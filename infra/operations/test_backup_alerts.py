import copy
from contextlib import redirect_stdout
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch


ROOT = Path(__file__).parent
SPEC = importlib.util.spec_from_file_location("alerts", ROOT / "approve-backup-alerts.py")
ALERTS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ALERTS)


class Fake:
    def __init__(self, attached=False, confirmed=False):
        self.retention = ALERTS.retention_module()
        self.legacy = self.retention.desired_template(self.retention.base_module())
        self.template = ALERTS.desired_template(self.retention) if attached else copy.deepcopy(self.legacy)
        self.account = ALERTS.ACCOUNT
        self.parameters = [{"ParameterKey": "RuntimeRoleName", "ParameterValue": ALERTS.ROLE}]
        self.stack_status = "UPDATE_COMPLETE"
        self.topic_exists = attached
        self.policy = ALERTS.topic_policy()
        self.arn = ALERTS.TOPIC_ARN + ":12345678-1234-1234-1234-123456789abc"
        self.subscriptions = [{"Owner": ALERTS.ACCOUNT, "TopicArn": ALERTS.TOPIC_ARN,
            "Protocol": "email", "Endpoint": ALERTS.RECIPIENT,
            "SubscriptionArn": self.arn if confirmed else "PendingConfirmation"}]
        self.subscription = {"Owner": ALERTS.ACCOUNT, "TopicArn": ALERTS.TOPIC_ARN,
            "Protocol": "email", "Endpoint": ALERTS.RECIPIENT, "PendingConfirmation": "false"}
        self.alarm = copy.deepcopy(self.legacy["Resources"]["BackupHealthAlarm"]["Properties"])
        self.alarm.update({"ActionsEnabled": True, "AlarmActions": [ALERTS.TOPIC_ARN] if attached else [],
                           "OKActions": [ALERTS.TOPIC_ARN] if attached else [], "InsufficientDataActions": []})
        self.calls = []
        self.publish_error = None

    def call(self, service, operation, *args, **kwargs):
        self.calls.append((service, operation, args, kwargs))
        if operation == "get-caller-identity":
            return {"Account": self.account}
        if operation == "describe-stacks":
            return {"Stacks": [{"StackStatus": self.stack_status, "Parameters": self.parameters}]}
        if operation == "get-template":
            return {"TemplateBody": copy.deepcopy(self.template)}
        if operation == "describe-alarms":
            return {"MetricAlarms": [self.alarm]}
        if operation == "get-topic-attributes":
            if not self.topic_exists and kwargs.get("missing_topic"):
                return None
            return {"Attributes": {"Owner": ALERTS.ACCOUNT, "TopicArn": ALERTS.TOPIC_ARN, "Policy": json.dumps(self.policy)}}
        if operation == "list-subscriptions-by-topic":
            return {"Subscriptions": self.subscriptions}
        if operation == "get-subscription-attributes":
            return {"Attributes": self.subscription}
        if operation == "validate-template":
            return {}
        if operation == "update-stack":
            return {"StackId": "arn:aws:cloudformation:" + ALERTS.REGION + ":" + ALERTS.ACCOUNT + ":stack/" + ALERTS.STACK + "/fixed"}
        if operation == "publish":
            if self.publish_error:
                raise self.publish_error
            return {"MessageId": "12345678-1234-1234-1234-123456789abc"}
        raise AssertionError("Unreviewed operation: " + operation)

    def writes(self):
        return [x for x in self.calls if (x[0], x[1]) in ALERTS.WRITES]


class AlertTests(unittest.TestCase):
    def test_template_preserves_storage_iam_lifecycle_and_metric(self):
        fake = Fake()
        desired = ALERTS.desired_template(fake.retention)
        restored = copy.deepcopy(desired)
        for key in ["BackupAlertTopic", "BackupAlertPolicy", "BackupAlertEmail"]:
            del restored["Resources"][key]
        for key in ["ActionsEnabled", "AlarmActions", "OKActions"]:
            del restored["Resources"]["BackupHealthAlarm"]["Properties"][key]
        self.assertEqual(restored, fake.legacy)
        self.assertEqual(desired["Resources"]["BackupAlertEmail"]["Properties"]["Endpoint"], ALERTS.RECIPIENT)
        allow = ALERTS.topic_policy()["Statement"][0]
        self.assertEqual(allow["Principal"], {"Service": "cloudwatch.amazonaws.com"})
        self.assertEqual(allow["Condition"]["ArnEquals"]["aws:SourceArn"], ALERTS.ALARM_ARN)
        self.assertEqual(allow["Condition"]["StringEquals"]["aws:SourceAccount"], ALERTS.ACCOUNT)

    def test_plan_has_no_network_or_email(self):
        output = subprocess.check_output([sys.executable, str(ROOT / "approve-backup-alerts.py")], text=True)
        self.assertEqual(json.loads(output)["status"], "PLAN_ONLY_NO_NETWORK")
        self.assertFalse(json.loads(output)["emailsSent"])

    def test_only_exact_old_stack_can_be_updated(self):
        fake = Fake()
        report = ALERTS.apply(fake.call, fake.retention)
        self.assertEqual(report["status"], "ALERT_UPDATE_REQUESTED")
        self.assertFalse(report["notificationDeliveryVerified"])
        self.assertEqual([x[1] for x in fake.writes()], ["validate-template", "update-stack"])
        update = fake.writes()[-1][2]
        self.assertIn("orzell-backup-alert-email-v1", update)
        self.assertNotIn("publish", [x[1] for x in fake.calls])

    def test_wrong_account_role_template_or_unstable_stack_stops_before_writes(self):
        for change in [lambda f: setattr(f, "account", "wrong"),
                       lambda f: f.parameters[0].update(ParameterValue="other-role"),
                       lambda f: f.template["Resources"]["BackupBucket"]["Properties"].update(VersioningConfiguration={}),
                       lambda f: setattr(f, "stack_status", "UPDATE_IN_PROGRESS")]:
            fake = Fake()
            change(fake)
            with self.assertRaises(ValueError):
                ALERTS.apply(fake.call, fake.retention)
            self.assertEqual(fake.writes(), [])

    def test_existing_topic_name_is_not_adopted(self):
        fake = Fake()
        fake.topic_exists = True
        with self.assertRaisesRegex(ValueError, "NAME_ALREADY_IN_USE"):
            ALERTS.apply(fake.call, fake.retention)
        self.assertEqual(fake.writes(), [])

    def test_pending_confirmation_does_not_mean_delivery_or_resubscribe(self):
        fake = Fake(attached=True)
        report = ALERTS.apply(fake.call, fake.retention)
        self.assertFalse(report["notificationRouteConfigured"])
        self.assertEqual(report["notificationRouteStatus"], "PENDING_EMAIL_CONFIRMATION")
        self.assertEqual(fake.writes(), [])

    def test_confirmed_subscription_is_not_inbox_delivery_proof(self):
        fake = Fake(attached=True, confirmed=True)
        report = ALERTS.inspect_route(fake.call)
        self.assertTrue(report["subscriptionConfirmed"])
        self.assertFalse(report["notificationDeliveryVerified"])

    def test_extra_recipients_wrong_endpoint_filter_or_topic_policy_are_rejected(self):
        changes = [lambda f: f.subscriptions.append(copy.deepcopy(f.subscriptions[0])),
                   lambda f: f.subscriptions[0].update(Endpoint="other@example.test"),
                   lambda f: f.subscription.update(FilterPolicy='{"drop":["alarms"]}'),
                   lambda f: f.policy["Statement"][0].update(Principal="*"),
                   lambda f: f.policy["Statement"][0]["Condition"]["ArnEquals"].update({"aws:SourceArn": "*"})]
        for change in changes:
            fake = Fake(attached=True, confirmed=True)
            change(fake)
            with self.assertRaises(ValueError):
                ALERTS.inspect_route(fake.call)
            self.assertEqual(fake.writes(), [])

    def test_disabled_or_redirected_alarm_does_not_pass(self):
        for key, value in [("ActionsEnabled", False), ("AlarmActions", []), ("OKActions", ["other"]), ("TreatMissingData", "notBreaching")]:
            fake = Fake(attached=True, confirmed=True)
            fake.alarm[key] = value
            with self.assertRaises(ValueError):
                ALERTS.apply(fake.call, fake.retention)
            self.assertEqual(fake.writes(), [])

    def test_policy_serialization_order_is_not_false_drift(self):
        fake = Fake(attached=True, confirmed=True)
        fake.policy["Statement"].reverse()
        fake.policy["Statement"][0]["Action"] = ["sns:*"]
        self.assertTrue(ALERTS.inspect_route(fake.call)["subscriptionConfirmed"])

    def test_only_confirmed_recipient_can_receive_one_synthetic_test(self):
        fake = Fake(attached=True, confirmed=True)
        with patch.object(ALERTS, "retention_module", return_value=fake.retention):
            report = ALERTS.wait_and_test(fake.call, lambda _: None)
        self.assertEqual([x[1] for x in fake.writes()], ["publish"])
        self.assertTrue(report["testAcceptedBySns"])
        self.assertFalse(report["testDeliveredToInbox"])
        self.assertFalse(report["notificationDeliveryVerified"])
        self.assertTrue(report["testMarker"].startswith("ORZELL_BACKUP_ALERT_TEST_"))

    def test_pending_consent_never_publishes(self):
        fake = Fake(attached=True)
        with patch.object(ALERTS, "retention_module", return_value=fake.retention):
            report = ALERTS.wait_and_test(fake.call, lambda _: None)
        self.assertEqual(report["status"], "AWAITING_EMAIL_CONFIRMATION")
        self.assertEqual(fake.writes(), [])

    def test_uncertain_publish_is_not_retried(self):
        fake = Fake(attached=True, confirmed=True)
        fake.publish_error = subprocess.TimeoutExpired("hidden-command", 35)
        with patch.object(ALERTS, "retention_module", return_value=fake.retention):
            with self.assertRaises(subprocess.TimeoutExpired):
                ALERTS.wait_and_test(fake.call, lambda _: None)
        self.assertEqual([x[1] for x in fake.writes()], ["publish"])

    def test_read_only_audit_does_not_gain_write_operations(self):
        import test_managed_backup_audit as fixture_module
        audit = fixture_module.AUDIT.AUDIT
        with self.assertRaisesRegex(ValueError, "READ_ONLY_AUDIT"):
            audit.aws("sns", "publish")

    def test_changed_retention_helper_cannot_be_executed(self):
        with patch.object(Path, "is_file", return_value=True), patch.object(Path, "read_bytes", return_value=b"raise RuntimeError('unreviewed code')"):
            with self.assertRaisesRegex(ValueError, "RETENTION_SOURCE_DIFFERS"):
                ALERTS.retention_module()

    def test_raw_command_errors_and_recipient_data_are_not_printed(self):
        output = io.StringIO()
        with patch.object(sys, "argv", ["approve-backup-alerts.py", "--apply"]), redirect_stdout(output):
            with patch.object(ALERTS, "apply", side_effect=ValueError("secret-token private-object-key")):
                self.assertEqual(ALERTS.main(), 1)
        self.assertNotIn("secret-token", output.getvalue())
        self.assertEqual(json.loads(output.getvalue())["reason"], "ValueError")

    def test_update_deadline_never_publishes_or_resubmits(self):
        fake = Fake(attached=True, confirmed=True)
        fake.stack_status = "UPDATE_IN_PROGRESS"
        clock = iter([0, 0, 301]).__next__
        report = ALERTS.wait_and_test(fake.call, lambda _: None, clock)
        self.assertEqual(report["status"], "ALERT_UPDATE_PENDING_NO_RETRY")
        self.assertEqual(fake.writes(), [])


if __name__ == "__main__":
    unittest.main()
