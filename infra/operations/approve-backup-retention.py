#!/usr/bin/env python3
"""Owner-run update: approved 30-day lifecycle and bounded health telemetry."""

import argparse
import copy
import hashlib
import json
from pathlib import Path
import sys
import types
import urllib.request


ACCOUNT = "926642724499"
REGION = "eu-north-1"
STACK = "orzell-encrypted-backup-storage-v1"
ROLE = "BeautyPlatformPreview-RuntimeRole-qJeq1ARIaXWh"
BASE_URL = "https://raw.githubusercontent.com/umutbarut7-svg/Beauty-platform/661a7ece34fe6db40ba6fb7552dfe7f0648b0e7f/infra/operations/bootstrap-backup-storage.py"
BASE_SHA256 = "2ef8329be82cf695ae5ec15404933ed6709fbcb1ebf74d4355f91c7e07f1727b"
NAMESPACE = "ORZELL/Backup"
ALARM = "ORZELL-DatabaseBackup-Health"


def base_module():
    sibling = Path(__file__).with_name("bootstrap-backup-storage.py")
    if sibling.is_file():
        source = sibling.read_bytes()
    else:
        with urllib.request.urlopen(BASE_URL, timeout=20) as response:
            source = response.read(20001)
    if len(source) > 20000 or hashlib.sha256(source).hexdigest() != BASE_SHA256:
        raise ValueError("REVIEWED_FOUNDATION_SOURCE_DIFFERS")
    module = types.ModuleType("reviewed_backup_foundation")
    exec(compile(source, "reviewed_backup_foundation", "exec"), module.__dict__)
    return module


def desired_template(base):
    result = copy.deepcopy(base.template())
    result["Description"] = "ORZELL approved 30-day backup lifecycle and health monitoring; no new compute or keys"
    result["Resources"]["BackupBucket"]["Properties"]["LifecycleConfiguration"] = {"Rules": [
        {"Id": "ApprovedThirtyDayBackupRetention", "Status": "Enabled", "Prefix": "encrypted/v1/",
         "ExpirationInDays": 30, "NoncurrentVersionExpiration": {"NoncurrentDays": 1},
         "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 1}},
        {"Id": "RemoveExpiredBackupDeleteMarkers", "Status": "Enabled", "Prefix": "encrypted/v1/", "ExpiredObjectDeleteMarker": True},
    ]}
    statements = result["Resources"]["BackupWriterPolicy"]["Properties"]["PolicyDocument"]["Statement"]
    statements[0]["Action"].append("s3:GetLifecycleConfiguration")
    statements.append({"Sid": "PublishOnlyBackupHealth", "Effect": "Allow", "Action": "cloudwatch:PutMetricData", "Resource": "*",
                       "Condition": {"StringEquals": {"cloudwatch:namespace": NAMESPACE}}})
    result["Resources"]["BackupHealthAlarm"] = {
        "Type": "AWS::CloudWatch::Alarm", "Properties": {
            "AlarmName": ALARM, "AlarmDescription": "ORZELL backup failed, stale over 26 hours or missing host health telemetry",
            "Namespace": NAMESPACE, "MetricName": "BackupHealthy", "Dimensions": [{"Name": "BackupSet", "Value": "orzell-database-v1"}],
            "Statistic": "Minimum", "Period": 3600, "EvaluationPeriods": 1, "DatapointsToAlarm": 1,
            "ComparisonOperator": "LessThanThreshold", "Threshold": 1, "TreatMissingData": "breaching",
            "Tags": [{"Key": "Project", "Value": "ORZELL"}],
        },
    }
    return result


def apply(base, call=None):
    call = call or base.aws
    if call("sts", "get-caller-identity").get("Account") != ACCOUNT:
        raise ValueError("WRONG_ACCOUNT")
    stacks = call("cloudformation", "describe-stacks", "--stack-name", STACK).get("Stacks", [])
    if len(stacks) != 1 or stacks[0].get("StackStatus") not in ("CREATE_COMPLETE", "UPDATE_COMPLETE"):
        raise ValueError("STACK_NOT_STABLE_NO_RETRY")
    parameters = {item["ParameterKey"]: item["ParameterValue"] for item in stacks[0].get("Parameters", [])}
    if parameters != {"RuntimeRoleName": ROLE}:
        raise ValueError("STACK_ROLE_DIFFERS")
    current = call("cloudformation", "get-template", "--stack-name", STACK).get("TemplateBody")
    current = json.loads(current) if isinstance(current, str) else current
    desired = desired_template(base)
    if current == desired:
        return {"status": "RETENTION_TEMPLATE_ALREADY_APPLIED", "productionReady": False}
    if current != base.template():
        raise ValueError("UNREVIEWED_STACK_DIFFERS")
    name, exists = base.preflight(call)
    if not exists or name != ROLE:
        raise ValueError("EXISTING_RUNTIME_BINDING_DIFFERS")
    body = json.dumps(desired, sort_keys=True)
    call("cloudformation", "validate-template", "--template-body", body)
    response = call("cloudformation", "update-stack", "--stack-name", STACK, "--template-body", body,
                    "--parameters", json.dumps([{"ParameterKey": "RuntimeRoleName", "UsePreviousValue": True}]),
                    "--capabilities", "CAPABILITY_NAMED_IAM", "--client-request-token", "orzell-backup-retention30-v1")
    if not response.get("StackId", "").startswith("arn:aws:cloudformation:" + REGION + ":" + ACCOUNT + ":stack/" + STACK + "/"):
        raise ValueError("UPDATE_RESULT_UNCERTAIN_NO_RETRY")
    return {"status": "RETENTION_UPDATE_REQUESTED", "retentionDays": 30, "noncurrentCleanupDays": 1,
            "alarmNotificationRouteConfigured": False, "productionReady": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--print-template", action="store_true")
    args = parser.parse_args()
    if not args.apply and not args.print_template:
        print(json.dumps({"status": "PLAN_ONLY_NO_NETWORK", "retentionDays": 30, "noncurrentCleanupDays": 1,
                          "newResources": ["one CloudWatch health alarm"], "metricNamespace": NAMESPACE,
                          "newComputeOrKeys": False, "emailsOrSmsSent": False, "backupStarted": False}))
        return 0
    try:
        base = base_module()
        print(json.dumps(desired_template(base), indent=2) if args.print_template else json.dumps(apply(base), sort_keys=True))
    except Exception as error:
        print(json.dumps({"status": "STOPPED", "reason": str(error) if isinstance(error, ValueError) else type(error).__name__}))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
