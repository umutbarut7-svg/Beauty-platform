import importlib.util
import pathlib
import unittest
from unittest.mock import Mock

spec = importlib.util.spec_from_file_location("bootstrap", pathlib.Path(__file__).with_name("bootstrap.py"))
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.sts, self.iam, self.ec2 = Mock(), Mock(), Mock()
        self.sts.get_caller_identity.return_value = {"Account": setup.ACCOUNT}
        self.iam.get_open_id_connect_provider.return_value = {"Url": "token.actions.githubusercontent.com", "ClientIDList": ["sts.amazonaws.com"]}
        self.ec2.describe_instances.return_value = {"Reservations": [{"Instances": [{"InstanceId": setup.INSTANCE, "State": {"Name": "running"}}]}]}
        self.iam.exceptions.NoSuchEntityException = type("Missing", (Exception,), {})
        self.iam.get_role.side_effect = self.iam.exceptions.NoSuchEntityException()

    def run_setup(self):
        setup.provision(self.sts, self.iam, self.ec2)

    def existing(self):
        self.iam.get_role.side_effect = None
        self.iam.get_role.return_value = {"Role": {"AssumeRolePolicyDocument": setup.TRUST}}
        self.iam.list_attached_role_policies.return_value = {"AttachedPolicies": []}
        self.iam.list_role_policies.return_value = {"PolicyNames": [setup.POLICY_NAME]}
        self.iam.get_role_policy.return_value = {"PolicyDocument": setup.POLICY}

    def assert_no_write(self):
        self.iam.create_role.assert_not_called()
        self.iam.put_role_policy.assert_not_called()

    def test_wrong_account_stops_before_any_iam_call(self):
        self.sts.get_caller_identity.return_value = {"Account": "000000000000"}
        with self.assertRaises(RuntimeError): self.run_setup()
        self.assert_no_write()
        self.iam.get_open_id_connect_provider.assert_not_called()

    def test_wrong_provider_audience_stops(self):
        self.iam.get_open_id_connect_provider.return_value["ClientIDList"] = ["wrong"]
        with self.assertRaises(RuntimeError): self.run_setup()
        self.assert_no_write()

    def test_nonrunning_host_stops(self):
        self.ec2.describe_instances.return_value["Reservations"][0]["Instances"][0]["State"]["Name"] = "stopped"
        with self.assertRaises(RuntimeError): self.run_setup()
        self.assert_no_write()

    def test_initial_creation_is_only_role_and_scoped_policy(self):
        self.run_setup()
        self.iam.create_role.assert_called_once()
        self.iam.put_role_policy.assert_called_once()
        write = setup.POLICY["Statement"][0]
        self.assertEqual(write["Action"], "ssm:SendCommand")
        self.assertEqual(write["Resource"], [f"arn:aws:ec2:{setup.REGION}:{setup.ACCOUNT}:instance/{setup.INSTANCE}", f"arn:aws:ssm:{setup.REGION}::document/AWS-RunShellScript"])
        self.assertEqual(setup.TRUST["Statement"][0]["Condition"]["StringEquals"]["token.actions.githubusercontent.com:sub"], "repo:umutbarut7-svg/Beauty-platform:ref:refs/heads/main")

    def test_repeat_is_read_only(self):
        self.existing()
        self.run_setup()
        self.assert_no_write()

    def test_changed_trust_is_never_overwritten(self):
        self.existing()
        self.iam.get_role.return_value = {"Role": {"AssumeRolePolicyDocument": {}}}
        with self.assertRaises(RuntimeError): self.run_setup()
        self.assert_no_write()

    def test_extra_privilege_is_never_silently_accepted(self):
        self.existing()
        self.iam.list_attached_role_policies.return_value = {"AttachedPolicies": [{"PolicyArn": "AdministratorAccess"}]}
        with self.assertRaises(RuntimeError): self.run_setup()
        self.assert_no_write()

    def test_changed_policy_is_never_overwritten(self):
        self.existing()
        self.iam.get_role_policy.return_value = {"PolicyDocument": {}}
        with self.assertRaises(RuntimeError): self.run_setup()
        self.assert_no_write()


if __name__ == "__main__": unittest.main()
