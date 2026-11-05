import copy
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location("audit", Path(__file__).with_name("audit-backup-foundation.py"))
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)


class FoundationAuditTests(unittest.TestCase):
    def setUp(self):
        f = AUDIT.FOUNDATION
        expected = f.template()
        self.responses = {
            "get-caller-identity": {"Account": f.ACCOUNT, "Arn": "arn:aws:sts::" + f.ACCOUNT + ":assumed-role/BeautyPlatformGitHubAudit/fixture"},
            "describe-stacks": {"Stacks": [{"StackStatus": "CREATE_COMPLETE", "Parameters": [{"ParameterKey": "RuntimeRoleName", "ParameterValue": AUDIT.ROLE}],
                "Outputs": [{"OutputKey": key, "OutputValue": value} for key, value in {"BucketName": f.BUCKET, "BackupPrefix": f.PREFIX, "RuntimeRoleName": AUDIT.ROLE}.items()]}]},
            "get-template": {"TemplateBody": expected},
            "get-role-policy": {"PolicyDocument": copy.deepcopy(expected["Resources"]["BackupWriterPolicy"]["Properties"]["PolicyDocument"])},
            "get-bucket-policy": {"Policy": json.dumps(AUDIT.resolve(expected["Resources"]["BackupBucketPolicy"]["Properties"]["PolicyDocument"]))},
            "get-bucket-encryption": {"ServerSideEncryptionConfiguration": {"Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}, "BucketKeyEnabled": False}]}},
        }
        self.calls = []

    def read(self, service, operation, *arguments):
        self.calls.append((service, operation, arguments))
        self.assertIn((service, operation), AUDIT.ALLOWED)
        return copy.deepcopy(self.responses[operation])

    def test_exact_completed_stack_and_live_policies_pass(self):
        report = AUDIT.inspect(self.read)
        self.assertEqual(report["stackStatus"], "CREATE_COMPLETE")
        self.assertIs(report["productionReady"], False)
        self.assertTrue(report["liveWriterPolicy"])
        for service, _, arguments in self.calls:
            if service == "s3api":
                self.assertEqual(arguments[arguments.index("--expected-bucket-owner") + 1], AUDIT.FOUNDATION.ACCOUNT)

    def test_pending_failed_and_unknown_stack_are_not_complete(self):
        for status in ["CREATE_IN_PROGRESS", "ROLLBACK_COMPLETE", None]:
            self.responses["describe-stacks"]["Stacks"][0]["StackStatus"] = status
            with self.assertRaisesRegex(ValueError, "NOT_CREATE_COMPLETE"):
                AUDIT.inspect(self.read)

    def test_wrong_identity_or_role_binding_stops(self):
        self.responses["get-caller-identity"]["Account"] = "wrong"
        with self.assertRaisesRegex(ValueError, "IDENTITY"):
            AUDIT.inspect(self.read)
        self.assertEqual(len(self.calls), 1)
        self.setUp()
        self.responses["describe-stacks"]["Stacks"][0]["Parameters"][0]["ParameterValue"] = "OtherRole"
        with self.assertRaisesRegex(ValueError, "BINDING"):
            AUDIT.inspect(self.read)

    def test_extra_live_permission_and_changed_template_are_rejected(self):
        self.responses["get-role-policy"]["PolicyDocument"]["Statement"].append({"Effect": "Allow", "Action": "s3:*", "Resource": "*"})
        with self.assertRaisesRegex(ValueError, "WRITER_POLICY"):
            AUDIT.inspect(self.read)
        self.setUp()
        self.responses["get-template"]["TemplateBody"]["Description"] = "changed"
        with self.assertRaisesRegex(ValueError, "TEMPLATE"):
            AUDIT.inspect(self.read)

    def test_bucket_policy_or_encryption_drift_is_rejected(self):
        policy = json.loads(self.responses["get-bucket-policy"]["Policy"])
        policy["Statement"].pop()
        self.responses["get-bucket-policy"]["Policy"] = json.dumps(policy)
        with self.assertRaisesRegex(ValueError, "BUCKET_POLICY"):
            AUDIT.inspect(self.read)
        self.setUp()
        self.responses["get-bucket-encryption"]["ServerSideEncryptionConfiguration"]["Rules"][0]["ApplyServerSideEncryptionByDefault"]["SSEAlgorithm"] = "aws:kms"
        with self.assertRaisesRegex(ValueError, "ENCRYPTION"):
            AUDIT.inspect(self.read)

    def test_semantic_action_order_does_not_change_policy_meaning(self):
        document = self.responses["get-role-policy"]["PolicyDocument"]
        document["Statement"].reverse()
        for statement in document["Statement"]:
            statement["Action"].reverse()
        self.assertEqual(AUDIT.inspect(self.read)["status"], "FOUNDATION_AUDIT_COMPLETE")

    def test_audit_api_allowlist_blocks_mutations(self):
        with patch.object(AUDIT.subprocess, "run") as run:
            with self.assertRaisesRegex(ValueError, "READ_ONLY"):
                AUDIT.aws("iam", "put-role-policy")
            run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
