#!/usr/bin/env python3
"""Read approved retention/health configuration before enabling the prepared job."""

import importlib.util
import json
import os
from pathlib import Path
import re


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


AUDIT = module("foundation_audit", "audit-backup-foundation.py")
RETENTION = module("approved_retention", "approve-backup-retention.py")
MANAGED = module("managed_backup", "managed-database-backup.py")
ALERTS = module("approved_alerts", "approve-backup-alerts.py")


def inspect(read=AUDIT.aws):
    desired = RETENTION.desired_template(RETENTION.base_module())
    actual = read("cloudformation", "get-template", "--stack-name", RETENTION.STACK).get("TemplateBody")
    actual = json.loads(actual) if isinstance(actual, str) else actual
    alert_template = ALERTS.desired_template(RETENTION)
    alerts_attached = actual == alert_template
    if alerts_attached:
        desired = alert_template
    report = AUDIT.inspect(read, expected_template=desired, accepted_statuses=("UPDATE_COMPLETE",))
    lifecycle = read("s3api", "get-bucket-lifecycle-configuration", "--bucket", MANAGED.BUCKET,
                     "--expected-bucket-owner", MANAGED.ACCOUNT)
    MANAGED.approved_lifecycle(lifecycle)
    alarms = read("cloudwatch", "describe-alarms", "--alarm-names", RETENTION.ALARM).get("MetricAlarms", [])
    expected = desired["Resources"]["BackupHealthAlarm"]["Properties"]
    if len(alarms) != 1:
        raise ValueError("BACKUP_HEALTH_ALARM_REQUIRED")
    alarm = alarms[0]
    for field in ["AlarmName", "Namespace", "MetricName", "Dimensions", "Statistic", "Period", "EvaluationPeriods", "DatapointsToAlarm", "ComparisonOperator", "Threshold", "TreatMissingData"]:
        if alarm.get(field) != expected[field]:
            raise ValueError("BACKUP_HEALTH_ALARM_DIFFERS")
    for field in ["AlarmActions", "OKActions", "InsufficientDataActions"]:
        expected_actions = [ALERTS.TOPIC_ARN] if alerts_attached and field != "InsufficientDataActions" else []
        if alarm.get(field, []) != expected_actions:
            raise ValueError("UNREVIEWED_NOTIFICATION_ROUTE")
    if alerts_attached and alarm.get("ActionsEnabled") is not True:
        raise ValueError("ALERT_ACTIONS_DISABLED")
    report.update({"status": "MANAGED_BACKUP_CLOUD_READY", "retentionDays": 30, "noncurrentCleanupDays": 1,
                   "alarmState": alarm.get("StateValue", "UNKNOWN"), "notificationRouteConfigured": False})
    if alerts_attached:
        report.update(ALERTS.inspect_route(read))
    else:
        report.update({"subscriptionConfirmed": False, "notificationDeliveryVerified": False,
                       "notificationRouteStatus": "NOT_INSTALLED"})
    return report


if __name__ == "__main__":
    try:
        request = json.loads(Path(".github/operations/managed-backup-activation.json").read_text())
        if (set(request) != {"request_id", "mode", "release", "signer"}
                or request["request_id"] != "orzell-managed-backup-activation-20261106-1"
                or request["mode"] != "first-backup-and-enable-timers"
                or not re.fullmatch(r"[0-9a-f]{40}", request["release"])
                or not re.fullmatch(r"[0-9a-f]{64}", request["signer"])):
            raise ValueError("UNSUPPORTED_ACTIVATION_REQUEST")
        report = inspect()
        print(json.dumps(report, sort_keys=True))
        with open(os.environ["GITHUB_OUTPUT"], "a") as output:
            output.write("ready=true\n")
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
            summary.write("## Managed backup cloud readiness\n\n```json\n" + json.dumps(report, indent=2) + "\n```\n")
    except Exception as error:
        print(json.dumps({"status": "MANAGED_CLOUD_NOT_READY", "reason": str(error) if isinstance(error, ValueError) else type(error).__name__}))
        raise SystemExit(1)
