import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location("inspection", Path(__file__).with_name("inspect-backup-storage.py"))
INSPECT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(INSPECT)


class StorageInspectionTests(unittest.TestCase):
    def read(self, service, operation, **options):
        self.calls.append((service, operation, options))
        values = {
            "get-caller-identity": {"Account": INSPECT.ACCOUNT, "Arn": INSPECT.ROLE + "fixture"},
            "list-buckets": {"Buckets": [{"Name": "private-fixture-bucket"}]},
            "get-bucket-location": {"LocationConstraint": "eu-north-1"},
            "get-public-access-block": {"PublicAccessBlockConfiguration": {key: True for key in ["BlockPublicAcls", "IgnorePublicAcls", "BlockPublicPolicy", "RestrictPublicBuckets"]}},
            "get-bucket-encryption": {"ServerSideEncryptionConfiguration": {"Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]}},
            "get-bucket-versioning": {"Status": "Enabled"},
            "get-bucket-lifecycle-configuration": {"Rules": [{"Status": "Enabled"}, {"Status": "Disabled"}]},
            "get-object-lock-configuration": {"ObjectLockConfiguration": {"ObjectLockEnabled": "Enabled"}},
            "get-bucket-policy-status": {"PolicyStatus": {"IsPublic": False}},
        }
        return self.overrides.get(operation, values[operation])

    def setUp(self):
        self.calls, self.overrides = [], {}

    def test_configuration_redaction_and_read_only_requests(self):
        report = INSPECT.inspect(self.read)
        self.assertEqual(report["bucketCount"], 1)
        row = report["buckets"][0]
        self.assertEqual(row["activeLifecycleRules"], 1)
        self.assertIs(row["allPublicBlocks"], True)
        self.assertNotIn("private-fixture-bucket", str(report))
        self.assertNotIn(INSPECT.ACCOUNT, str(report))
        for service, operation, options in self.calls:
            self.assertIn((service, operation), INSPECT.ALLOWED)
            if "bucket" in options:
                self.assertEqual(options["expected_bucket_owner"], INSPECT.ACCOUNT)

    def test_access_denied_is_unknown_not_disabled_or_success(self):
        for operation in ["get-public-access-block", "get-bucket-location", "get-bucket-encryption", "get-bucket-versioning", "get-bucket-lifecycle-configuration", "get-object-lock-configuration", "get-bucket-policy-status"]:
            self.overrides[operation] = {"unknown": "AccessDenied"}
        row = INSPECT.inspect(self.read)["buckets"][0]
        self.assertTrue(all(value == "UNKNOWN" or value == ["UNKNOWN"] for key, value in row.items() if key != "bucket"))

    def test_absent_rules_are_distinct_from_access_denied(self):
        self.overrides["get-bucket-lifecycle-configuration"] = {"unknown": "NoSuchLifecycleConfiguration"}
        self.overrides["get-object-lock-configuration"] = {"unknown": "ObjectLockConfigurationNotFoundError"}
        self.overrides["get-bucket-versioning"] = {}
        row = INSPECT.inspect(self.read)["buckets"][0]
        self.assertEqual(row["activeLifecycleRules"], 0)
        self.assertEqual(row["versioning"], "Not enabled")
        self.assertEqual(row["objectLock"], "Not enabled")

    def test_wrong_identity_stops_before_bucket_queries(self):
        self.overrides["get-caller-identity"] = {"Account": "wrong", "Arn": INSPECT.ROLE + "fixture"}
        with self.assertRaisesRegex(ValueError, "IDENTITY"):
            INSPECT.inspect(self.read)
        self.assertEqual(len(self.calls), 1)

    def test_list_failure_or_excessive_inventory_is_incomplete(self):
        for value in [{"unknown": "AccessDenied"}, {"Buckets": [{}] * 21}]:
            self.overrides["list-buckets"] = value
            result = INSPECT.inspect(self.read)
            self.assertEqual(result["status"], "INCOMPLETE")
            self.assertEqual(result["bucketCount"], "UNKNOWN")

    def test_cli_blocks_writes_and_never_leaks_provider_diagnostics(self):
        with patch.object(INSPECT.subprocess, "run") as run:
            with self.assertRaisesRegex(ValueError, "READ_ONLY"):
                INSPECT.aws("s3api", "put-object", bucket="fixture")
            run.assert_not_called()
            run.return_value = subprocess.CompletedProcess([], 1, "", "secret diagnostic (AccessDenied) private bucket")
            self.assertEqual(INSPECT.aws("s3api", "list-buckets"), {"unknown": "AccessDenied"})
            run.side_effect = subprocess.TimeoutExpired([], 20)
            self.assertEqual(INSPECT.aws("s3api", "list-buckets"), {"unknown": "ReadFailed"})


if __name__ == "__main__":
    unittest.main()
