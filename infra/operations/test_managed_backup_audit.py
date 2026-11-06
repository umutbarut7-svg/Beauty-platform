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

    def alert_fixture(self, confirmed=False):
        import test_backup_alerts
        alerts = test_backup_alerts.Fake(attached=True, confirmed=confirmed)
        self.fixture.responses["get-template"]["TemplateBody"] = alerts.template
        self.fixture.responses["describe-alarms"]["MetricAlarms"] = [alerts.alarm]

        def read(service, operation, *args):
            if service == "sns":
                self.assertIn((service, operation), AUDIT.AUDIT.ALLOWED)
                return alerts.call(service, operation, *args)
            return self.fixture.read(service, operation, *args)
        return alerts, read

    def test_approved_pending_email_is_not_reported_as_confirmed_or_delivered(self):
        alerts, read = self.alert_fixture()
        report = AUDIT.inspect(read)
        self.assertFalse(report["notificationRouteConfigured"])
        self.assertFalse(report["notificationDeliveryVerified"])
        self.assertEqual(report["notificationRouteStatus"], "PENDING_EMAIL_CONFIRMATION")
        self.assertEqual(alerts.writes(), [])

    def test_approved_confirmed_route_is_not_inbox_delivery_proof(self):
        alerts, read = self.alert_fixture(confirmed=True)
        report = AUDIT.inspect(read)
        self.assertTrue(report["notificationRouteConfigured"])
        self.assertFalse(report["notificationDeliveryVerified"])
        self.assertEqual(alerts.writes(), [])

    def test_approved_template_does_not_override_disabled_or_redirected_live_alarm(self):
        for key, value in [("ActionsEnabled", False), ("AlarmActions", []), ("OKActions", ["other"])]:
            self.setUp()
            alerts, read = self.alert_fixture(confirmed=True)
            alerts.alarm[key] = value
            with self.assertRaisesRegex(ValueError, "DISABLED|NOTIFICATION"):
                AUDIT.inspect(read)
            self.assertEqual(alerts.writes(), [])

    def test_an_extra_actual_recipient_is_rejected(self):
        alerts, read = self.alert_fixture(confirmed=True)
        alerts.subscriptions.append(copy.deepcopy(alerts.subscriptions[0]))
        with self.assertRaisesRegex(ValueError, "EXACTLY_ONE"):
            AUDIT.inspect(read)
        self.assertEqual(alerts.writes(), [])


if __name__ == "__main__":
    unittest.main()
