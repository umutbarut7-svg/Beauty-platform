import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location("host_plan", Path(__file__).with_name("plan-recovery-host.py"))
PLAN = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PLAN)


class Fake:
    def __init__(self):
        self.account = PLAN.ACCOUNT
        self.image = {"ImageId": "ami-1234567890abcdef0", "State": "available", "Architecture": "x86_64",
                      "RootDeviceType": "ebs", "RootDeviceName": "/dev/xvda", "Public": True,
                      "Name": "al2023-ami-2023.9.20261101.0-kernel-6.1-x86_64", "ImageOwnerAlias": "amazon",
                      "CreationDate": "2026-11-01T00:00:00.000Z"}
        self.price = "0.045"
        self.storage = "0.088"
        self.next_token = None
        self.product_change = lambda value: None
        self.calls = []

    def read(self, service, operation, *args):
        self.calls.append((service, operation, args))
        if (service, operation) not in PLAN.READS:
            raise AssertionError("Mutation attempted")
        if operation == "get-caller-identity":
            return {"Account": self.account}
        if operation == "describe-images":
            if args != ("--owners", "amazon", "--filters", json.dumps(PLAN.IMAGE_FILTERS)):
                raise AssertionError("Amazon ownership filter required")
            return {"Images": [self.image]}
        attributes = {item["Field"]: item["Value"] for item in json.loads(args[args.index("--filters") + 1])}
        storage = attributes.get("volumeApiName") == "gp3"
        product = {"product": {"attributes": {k: v for k, v in attributes.items() if k != "productFamily"}},
                   "terms": {"OnDemand": {"fixture-term": {"priceDimensions": {"fixture-rate": {
                       "unit": "GB-Mo" if storage else "Hrs", "beginRange": "0", "endRange": "Inf",
                       "appliesTo": [], "pricePerUnit": {"USD": self.storage if storage else self.price}}}}}}}
        if storage:
            product["product"]["productFamily"] = "Storage"
        self.product_change(product)
        return {"PriceList": [json.dumps(product)], **({"NextToken": self.next_token} if self.next_token else {})}


class HostPlanTests(unittest.TestCase):
    def test_default_and_template_modes_never_call_aws_or_provision(self):
        output = subprocess.check_output([sys.executable, str(Path(PLAN.__file__))], text=True)
        value = json.loads(output)
        self.assertEqual(value["status"], "PLAN_ONLY_NO_NETWORK")
        self.assertFalse(value["provisioned"])
        rendered = subprocess.check_output([sys.executable, str(Path(PLAN.__file__)), "--print-template"], text=True)
        self.assertIn("RecoveryHost", json.loads(rendered)["Resources"])
        rejected = subprocess.run([sys.executable, str(Path(PLAN.__file__)), "--apply"], capture_output=True)
        self.assertEqual(rejected.returncode, 2)

    def test_template_exposes_no_ports_or_production_credential_access(self):
        resources = PLAN.template()["Resources"]
        self.assertEqual(resources["Firewall"]["Properties"]["SecurityGroupIngress"], [])
        role = resources["SessionRole"]["Properties"]
        self.assertNotIn("ManagedPolicyArns", role)
        statements = role["Policies"][0]["PolicyDocument"]["Statement"]
        allowed = [value for value in statements if value["Effect"] == "Allow"]
        self.assertEqual(set(allowed[0]["Action"]), set(PLAN.SESSION_ACTIONS))
        self.assertEqual(allowed[1]["Action"], "cloudformation:SignalResource")
        self.assertEqual(allowed[1]["Resource"], {"Ref": "AWS::StackId"})
        denied = statements[2]["Action"]
        for action in ["s3:*", "ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath", "secretsmanager:GetSecretValue", "kms:Decrypt"]:
            self.assertIn(action, denied)
        self.assertNotIn("RoleName", role)
        for name in resources:
            self.assertNotIn(resources[name]["Type"], {"AWS::EC2::VPCPeeringConnection", "AWS::EC2::NatGateway", "AWS::S3::Bucket"})

    def test_expiry_and_rollback_are_prepared_but_not_reported_as_hard_billing_cap(self):
        host = PLAN.template()["Resources"]["RecoveryHost"]
        props = host["Properties"]
        self.assertEqual(props["InstanceInitiatedShutdownBehavior"], "terminate")
        self.assertEqual(props["CreditSpecification"], {"CPUCredits": "standard"})
        self.assertNotIn("KeyName", props)
        self.assertEqual(props["MetadataOptions"]["HttpTokens"], "required")
        self.assertTrue(props["BlockDeviceMappings"][0]["Ebs"]["Encrypted"])
        self.assertTrue(props["BlockDeviceMappings"][0]["Ebs"]["DeleteOnTermination"])
        self.assertEqual(host["CreationPolicy"]["ResourceSignal"]["Timeout"], "PT15M")
        script = PLAN.bootstrap()
        self.assertLess(script.index("systemd-run"), script.index("dnf -y"))
        self.assertIn("--on-active=120min", script)
        self.assertNotIn("synthetic-only-allow-host-swap", script)
        self.assertNotIn("swapoff", script)
        self.assertNotIn("--private-key", script)
        subprocess.run(["bash", "-n"], input=script.encode(), check=True)

    def test_real_price_plan_uses_exact_region_and_separates_approval_from_estimate(self):
        fake = Fake()
        value = PLAN.inspect(fake.read)
        self.assertEqual(value["estimatedTwoHourUsd"], "0.104889")
        self.assertTrue(value["withinOneDollarPlanningBudget"])
        for field in ["hardBillingCap", "terminationVerified", "accountLossRecoveryVerified", "realRecoveryReady", "provisioned", "privateKeyRead", "productionDataRead"]:
            self.assertFalse(value[field])
        self.assertEqual(len(fake.calls), 4)
        fake.price = "10"
        self.assertFalse(PLAN.inspect(fake.read)["withinOneDollarPlanningBudget"])

    def test_wrong_account_or_image_rejects_before_pricing(self):
        fake = Fake()
        fake.account = "other"
        with self.assertRaisesRegex(ValueError, "WRONG_ACCOUNT"):
            PLAN.inspect(fake.read)
        self.assertEqual(len(fake.calls), 1)
        for key, value in [("Public", False), ("Architecture", "arm64"), ("RootDeviceName", "/dev/sda1"),
                           ("ImageOwnerAlias", "marketplace"), ("ProductCodes", ["extra-charge"]), ("Name", "al2023-ami-minimal-2023.9.20261101.0-kernel-6.1-x86_64")]:
            fake = Fake()
            fake.image[key] = value
            with self.assertRaisesRegex(ValueError, "IMAGE_BINDING"):
                PLAN.inspect(fake.read)
            self.assertFalse(any(service == "pricing" for service, _, _ in fake.calls))

    def test_exact_reviewed_image_id_has_no_mutable_parameter_default(self):
        parameter = PLAN.template()["Parameters"]["AmiId"]
        self.assertEqual(parameter["Type"], "AWS::EC2::Image::Id")
        self.assertNotIn("Default", parameter)
        self.assertNotIn(("ssm", "get-parameter"), PLAN.READS)
        fake = Fake()
        original = fake.read
        def ambiguous(service, operation, *args):
            value = original(service, operation, *args)
            if operation == "describe-images":
                value["Images"].append({**fake.image, "ImageId": "ami-abcdef01234567890"})
            return value
        with self.assertRaisesRegex(ValueError, "AMBIGUOUS"):
            PLAN.inspect(ambiguous)

    def test_provider_error_is_classified_without_echoing_secret_stderr(self):
        result = subprocess.CompletedProcess([], 1, "", "An error occurred (AccessDeniedException): secret-token")
        with patch.object(PLAN.subprocess, "run", return_value=result):
            with self.assertRaisesRegex(ValueError, "PRICING_GET_PRODUCTS_ACCESSDENIEDEXCEPTION") as found:
                PLAN.aws("pricing", "get-products")
            self.assertNotIn("secret-token", str(found.exception))

    def test_same_release_selects_newest_kernel_but_not_arbitrary_image_id(self):
        fake = Fake()
        original = fake.read
        def two_kernels(service, operation, *args):
            value = original(service, operation, *args)
            if operation == "describe-images":
                value["Images"].append({**fake.image, "ImageId": "ami-abcdef01234567890",
                    "Name": "al2023-ami-2023.9.20261101.0-kernel-6.12-x86_64"})
            return value
        value = PLAN.inspect(two_kernels)
        self.assertEqual(value["amiId"], "ami-abcdef01234567890")
        self.assertEqual(value["amiSelectionRule"], "LATEST_PUBLIC_RELEASE_THEN_NEWEST_KERNEL")

    def test_unknown_or_misbound_regional_prices_cannot_be_treated_as_estimates(self):
        changes = [lambda p: p["product"]["attributes"].update(regionCode="us-east-1"),
                   lambda p: p["terms"]["OnDemand"].clear(),
                   lambda p: p["terms"]["OnDemand"]["fixture-term"]["priceDimensions"]["fixture-rate"].update(unit="GB"),
                   lambda p: p["terms"]["OnDemand"]["fixture-term"]["priceDimensions"]["fixture-rate"].update(beginRange="10")]
        for change in changes:
            fake = Fake()
            fake.product_change = change
            with self.assertRaises(ValueError):
                PLAN.inspect(fake.read)
        fake = Fake()
        fake.next_token = "more"
        with self.assertRaisesRegex(ValueError, "UNAMBIGUOUS"):
            PLAN.inspect(fake.read)
        for bad in ["NaN", "Infinity", "-1", "0", "not-a-price"]:
            fake = Fake()
            fake.price = bad
            with self.assertRaises(ValueError):
                PLAN.inspect(fake.read)

    def test_api_allowlist_rejects_resource_or_access_changes_before_execution(self):
        with patch.object(PLAN.subprocess, "run", side_effect=AssertionError("Must not execute")):
            for pair in [("cloudformation", "create-stack"), ("cloudformation", "delete-stack"),
                         ("ec2", "run-instances"), ("iam", "create-role"), ("ssm", "send-command"), ("s3api", "get-object")]:
                with self.assertRaisesRegex(ValueError, "READ_ONLY_HOST_PLAN"):
                    PLAN.aws(*pair)


if __name__ == "__main__":
    unittest.main()
