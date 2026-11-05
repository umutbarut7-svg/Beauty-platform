import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location("foundation", Path(__file__).with_name("bootstrap-backup-storage.py"))
FOUNDATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(FOUNDATION)


class BackupStorageBootstrapTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.responses = {
            "get-caller-identity": {"Account": FOUNDATION.ACCOUNT},
            "describe-instances": {"Reservations": [{"Instances": [{"InstanceId": FOUNDATION.INSTANCE,
                "State": {"Name": "running"}, "IamInstanceProfile": {"Arn": "arn:aws:iam::" + FOUNDATION.ACCOUNT + ":instance-profile/RuntimeProfile"}}]}]},
            "get-instance-profile": {"InstanceProfile": {"Roles": [{"RoleName": "RuntimeFixture"}]}},
            "get-role": {"Role": {"Arn": "arn:aws:iam::" + FOUNDATION.ACCOUNT + ":role/RuntimeFixture",
                "AssumeRolePolicyDocument": {"Statement": [{"Effect": "Allow", "Action": "sts:AssumeRole", "Principal": {"Service": "ec2.amazonaws.com"}}]}}},
            "describe-stacks": None, "get-role-policy": None, "head-bucket": None, "validate-template": {},
            "create-stack": {"StackId": "arn:aws:cloudformation:" + FOUNDATION.REGION + ":" + FOUNDATION.ACCOUNT + ":stack/" + FOUNDATION.STACK + "/fixture"},
        }

    def call(self, service, operation, *args, **kwargs):
        self.calls.append((service, operation, args, kwargs))
        return copy.deepcopy(self.responses[operation])

    def assert_no_mutation(self):
        self.assertFalse(any(operation.startswith(("create-", "put-", "update-", "delete-")) for _, operation, _, _ in self.calls))

    def test_safe_apply_validates_template_before_one_stack_creation(self):
        result = FOUNDATION.apply(self.call)
        self.assertEqual(result["status"], "STACK_CREATE_REQUESTED")
        self.assertIs(result["productionReady"], False)
        self.assertEqual([item[1] for item in self.calls][-2:], ["validate-template", "create-stack"])
        create = self.calls[-1][2]
        parameters = json.loads(create[create.index("--parameters") + 1])
        self.assertEqual(parameters, [{"ParameterKey": "RuntimeRoleName", "ParameterValue": "RuntimeFixture"}])

    def test_wrong_account_or_host_never_creates_resources(self):
        self.responses["get-caller-identity"] = {"Account": "wrong"}
        with self.assertRaisesRegex(ValueError, "WRONG_ACCOUNT"):
            FOUNDATION.apply(self.call)
        self.assertEqual(len(self.calls), 1)
        self.assert_no_mutation()
        self.setUp()
        self.responses["describe-instances"] = {"Reservations": []}
        with self.assertRaisesRegex(ValueError, "HOST_UNVERIFIED"):
            FOUNDATION.apply(self.call)
        self.assert_no_mutation()

    def test_other_account_profile_or_multiple_roles_never_delegates(self):
        self.responses["describe-instances"]["Reservations"][0]["Instances"][0]["IamInstanceProfile"]["Arn"] = "arn:aws:iam::000000000000:instance-profile/Other"
        with self.assertRaisesRegex(ValueError, "PROFILE_UNVERIFIED"):
            FOUNDATION.apply(self.call)
        self.assert_no_mutation()
        self.setUp()
        self.responses["get-instance-profile"]["InstanceProfile"]["Roles"] *= 2
        with self.assertRaisesRegex(ValueError, "ONE_EXISTING"):
            FOUNDATION.apply(self.call)
        self.assert_no_mutation()

    def test_role_with_broader_trust_is_not_given_backup_access(self):
        trust = self.responses["get-role"]["Role"]["AssumeRolePolicyDocument"]["Statement"]
        trust.append({"Effect": "Allow", "Action": "sts:AssumeRole", "Principal": {"AWS": "*"}})
        with self.assertRaisesRegex(ValueError, "EC2_ONLY"):
            FOUNDATION.apply(self.call)
        self.assert_no_mutation()

    def test_unmanaged_policy_or_existing_bucket_is_not_adopted(self):
        for operation, reason in [("get-role-policy", "UNMANAGED"), ("head-bucket", "NOT_ADOPTED")]:
            with self.subTest(operation=operation):
                self.setUp()
                self.responses[operation] = {}
                with self.assertRaisesRegex(ValueError, reason):
                    FOUNDATION.apply(self.call)
                self.assert_no_mutation()

    def existing_stack(self):
        self.responses["describe-stacks"] = {"Stacks": [{"StackStatus": "CREATE_COMPLETE", "Parameters": [{"ParameterKey": "RuntimeRoleName", "ParameterValue": "RuntimeFixture"}]}]}
        self.responses["get-template"] = {"TemplateBody": FOUNDATION.template()}

    def test_existing_matching_stack_is_left_unchanged(self):
        self.existing_stack()
        self.assertEqual(FOUNDATION.apply(self.call)["status"], "EXISTING_STACK_UNCHANGED")
        self.assert_no_mutation()

    def test_changed_or_failed_stack_stops_without_update_or_retry(self):
        self.existing_stack()
        self.responses["describe-stacks"]["Stacks"][0]["StackStatus"] = "ROLLBACK_COMPLETE"
        with self.assertRaisesRegex(ValueError, "REQUIRES_REVIEW"):
            FOUNDATION.apply(self.call)
        self.assert_no_mutation()
        self.existing_stack()
        self.responses["get-template"]["TemplateBody"]["Description"] = "modified"
        with self.assertRaisesRegex(ValueError, "STACK_DIFFERS"):
            FOUNDATION.apply(self.call)
        self.assert_no_mutation()

    def test_ambiguous_creation_result_requires_inspection(self):
        self.responses["create-stack"] = {}
        with self.assertRaisesRegex(ValueError, "UNCERTAIN_NO_RETRY"):
            FOUNDATION.apply(self.call)
        self.assertEqual(sum(operation == "create-stack" for _, operation, _, _ in self.calls), 1)

    def test_cli_default_plan_makes_no_external_calls(self):
        with patch.object(FOUNDATION.sys, "argv", ["bootstrap-backup-storage.py"]), patch.object(FOUNDATION.subprocess, "run") as run, contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(FOUNDATION.main(), 0)
        run.assert_not_called()
        self.assertEqual(json.loads(output.getvalue())["status"], "PLAN_ONLY_NO_AWS_CALLS")

    def test_access_denied_and_diagnostics_are_not_treated_as_missing(self):
        diagnostic = "secret marker private path (AccessDenied)"
        with patch.object(FOUNDATION.subprocess, "run", return_value=subprocess.CompletedProcess([], 1, "", diagnostic)):
            for missing in ["bucket", "policy", "stack"]:
                with self.assertRaises(ValueError) as raised:
                    FOUNDATION.aws("s3api", "head-bucket", missing=missing)
                self.assertNotIn("secret", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
