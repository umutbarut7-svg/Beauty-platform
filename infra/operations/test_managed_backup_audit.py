import copy
import importlib.util
from pathlib import Path
import unittest

import test_backup_foundation_audit as fixtures
import test_managed_database_backup as lifecycle_fixture


SPEC = importlib.util.spec_from_file_location("audit", Path(__file__).with_name("audit-managed-backup.py"))
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)


class ManagedAuditTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.FoundationAuditTests()
        self.fixture.setUp()
        desired = AUDIT.RETENTION.desired_template(AUDIT.RETENTION.base_module())
        self.fixture.responses["get-template"]["TemplateBody"] = desired
        self.fixture.responses["describe-stacks"]["Stacks"][0]["StackStatus"] = "UPDATE_COMPLETE"
        self.fixture.responses["get-role-policy"]["PolicyDocument"] = copy.deepcopy(desired["Resources"]["BackupWriterPolicy"]["Properties"]["PolicyDocument"])
        self.fixture.responses["get-bucket-lifecycle-configuration"] = lifecycle_fixture.lifecycle()
        self.fixture.responses["describe-alarms"] = {"MetricAlarms": [{**desired["Resources"]["BackupHealthAlarm"]["Properties"],
            "StateValue": "INSUFFICIENT_DATA", "AlarmActions": [], "OKActions": [], "InsufficientDataActions": []}]}

    def test_actual_retention_and_alarm_configuration_are_required(self):
        self.assertEqual(AUDIT.inspect(self.fixture.read)["status"], "MANAGED_BACKUP_CLOUD_READY")
        self.fixture.responses["get-bucket-lifecycle-configuration"]["Rules"][0]["Expiration"]["Days"] = 7
        with self.assertRaisesRegex(ValueError, "RETENTION_DAYS"):
            AUDIT.inspect(self.fixture.read)

    def test_unapproved_notification_or_missing_telemetry_policy_is_rejected(self):
        self.fixture.responses["describe-alarms"]["MetricAlarms"][0]["AlarmActions"] = ["unapproved-route"]
        with self.assertRaisesRegex(ValueError, "NOTIFICATION"):
            AUDIT.inspect(self.fixture.read)
        self.setUp()
        self.fixture.responses["get-role-policy"]["PolicyDocument"]["Statement"].pop()
        with self.assertRaisesRegex(ValueError, "WRITER_POLICY"):
            AUDIT.inspect(self.fixture.read)

    def test_missing_data_cannot_be_silently_ignored(self):
        self.fixture.responses["describe-alarms"]["MetricAlarms"][0]["TreatMissingData"] = "notBreaching"
        with self.assertRaisesRegex(ValueError, "ALARM_DIFFERS"):
            AUDIT.inspect(self.fixture.read)


if __name__ == "__main__":
    unittest.main()
