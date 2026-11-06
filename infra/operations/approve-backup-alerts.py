#!/usr/bin/env python3
"""Owner-run, fixed-recipient backup alarm delivery; plan mode is offline."""

import argparse
import copy
import hashlib
import json
from pathlib import Path
import re
import subprocess
import time
import types
import urllib.request
import uuid


ACCOUNT = "926642724499"
REGION = "eu-north-1"
STACK = "orzell-encrypted-backup-storage-v1"
ROLE = "BeautyPlatformPreview-RuntimeRole-qJeq1ARIaXWh"
RECIPIENT = "orzellapp@gmail.com"  # Explicitly selected by the owner on 6 November.
# v1 was rolled back after an invalid SNS policy. Its retained topic is not adopted
# or deleted: v2 has a distinct fixed name and remains in the same managed stack.
TOPIC_NAME = "ORZELL-Backup-Health-Alerts-v2"
TOPIC_ARN = "arn:aws:sns:" + REGION + ":" + ACCOUNT + ":" + TOPIC_NAME
ALARM_ARN = "arn:aws:cloudwatch:" + REGION + ":" + ACCOUNT + ":alarm:ORZELL-DatabaseBackup-Health"
RETENTION_URL = "https://raw.githubusercontent.com/umutbarut7-svg/Beauty-platform/0a1f4cd0a9fdb36c8a0ab1ee44d93ba59d338747/infra/operations/approve-backup-retention.py"
RETENTION_SHA = "28430fad47ac741758082804a3196521fe4e3f9216723f62f85cf75a3561adf5"
READS = {("sts", "get-caller-identity"), ("cloudformation", "describe-stacks"),
         ("cloudformation", "get-template"), ("sns", "get-topic-attributes"),
         ("sns", "list-subscriptions-by-topic"), ("sns", "get-subscription-attributes"),
         ("cloudwatch", "describe-alarms")}
WRITES = {("cloudformation", "validate-template"), ("cloudformation", "update-stack"), ("sns", "publish")}
UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"


def retention_module():
    path = Path(__file__).with_name("approve-backup-retention.py")
    if path.is_file():
        source = path.read_bytes()
    else:
        with urllib.request.urlopen(RETENTION_URL, timeout=20) as response:
            source = response.read(20001)
    if len(source) > 20000 or hashlib.sha256(source).hexdigest() != RETENTION_SHA:
        raise ValueError("REVIEWED_RETENTION_SOURCE_DIFFERS")
    result = types.ModuleType("reviewed_retention")
    result.__file__ = str(path)
    exec(compile(source, "reviewed_retention", "exec"), result.__dict__)
    return result


def topic_policy():
    return {"Version": "2012-10-17", "Id": "OrzellBackupAlertsV2", "Statement": [
        {"Sid": "OnlyTheBackupAlarm", "Effect": "Allow", "Principal": {"Service": "cloudwatch.amazonaws.com"},
         "Action": "sns:Publish", "Resource": TOPIC_ARN,
         "Condition": {"ArnEquals": {"aws:SourceArn": ALARM_ARN}, "StringEquals": {"aws:SourceAccount": ACCOUNT}}},
        # Topic resource policies accept topic actions, not every SNS API action.
        # Keep TLS denial for every documented topic-policy action explicitly.
        {"Sid": "DenyInsecureTransport", "Effect": "Deny", "Principal": "*", "Action": [
            "sns:AddPermission", "sns:DeleteTopic", "sns:GetDataProtectionPolicy", "sns:GetTopicAttributes",
            "sns:ListSubscriptionsByTopic", "sns:ListTagsForResource", "sns:Publish",
            "sns:PutDataProtectionPolicy", "sns:RemovePermission", "sns:SetTopicAttributes", "sns:Subscribe"], "Resource": TOPIC_ARN,
         "Condition": {"Bool": {"aws:SecureTransport": "false"}}},
    ]}


def desired_template(retention=None):
    retention = retention or retention_module()
    result = copy.deepcopy(retention.desired_template(retention.base_module()))
    result["Resources"]["BackupAlertTopic"] = {
        "Type": "AWS::SNS::Topic", "DeletionPolicy": "RetainExceptOnCreate", "UpdateReplacePolicy": "Retain",
        "Properties": {"TopicName": TOPIC_NAME, "Tags": [{"Key": "Project", "Value": "ORZELL"}]}}
    result["Resources"]["BackupAlertPolicy"] = {"Type": "AWS::SNS::TopicPolicy", "Properties": {
        "Topics": [{"Ref": "BackupAlertTopic"}], "PolicyDocument": topic_policy()}}
    result["Resources"]["BackupAlertEmail"] = {"Type": "AWS::SNS::Subscription", "DependsOn": "BackupAlertPolicy",
        "Properties": {"TopicArn": {"Ref": "BackupAlertTopic"}, "Protocol": "email", "Endpoint": RECIPIENT}}
    alarm = result["Resources"]["BackupHealthAlarm"]["Properties"]
    alarm.update({"ActionsEnabled": True, "AlarmActions": [{"Ref": "BackupAlertTopic"}],
                  "OKActions": [{"Ref": "BackupAlertTopic"}]})
    return result


def canonical_policy(policy):
    result = copy.deepcopy(policy)
    if not isinstance(result, dict) or not isinstance(result.get("Statement"), list):
        raise ValueError("ALERT_TOPIC_POLICY_DIFFERS")
    for statement in result["Statement"]:
        for key in ("Action", "Resource"):
            value = statement.get(key)
            statement[key] = sorted(value if isinstance(value, list) else [value])
    result["Statement"].sort(key=lambda value: json.dumps(value, sort_keys=True))
    return result


def aws(service, operation, *arguments, missing_topic=False):
    if (service, operation) not in READS | WRITES:
        raise ValueError("UNSUPPORTED_ALERT_OPERATION")
    result = subprocess.run(["aws", service, operation, *arguments, "--region", REGION, "--output", "json",
                             "--no-cli-pager", "--cli-connect-timeout", "5", "--cli-read-timeout", "20"],
                            capture_output=True, text=True, timeout=35)
    if result.returncode:
        if missing_topic and (service, operation) == ("sns", "get-topic-attributes") and re.search(r"\((NotFound|NotFoundException)\)", result.stderr):
            return None
        raise ValueError("ALERT_OPERATION_UNAVAILABLE_" + service.upper() + "_" + operation.upper().replace("-", "_"))
    return json.loads(result.stdout) if result.stdout.strip() else {}


def stack_template(call, allow_reviewed_rollback=False):
    stacks = call("cloudformation", "describe-stacks", "--stack-name", STACK).get("Stacks", [])
    accepted = ("UPDATE_COMPLETE", "UPDATE_ROLLBACK_COMPLETE") if allow_reviewed_rollback else ("UPDATE_COMPLETE",)
    if len(stacks) != 1 or stacks[0].get("StackStatus") not in accepted:
        raise ValueError("STACK_NOT_STABLE_NO_RETRY")
    if {x["ParameterKey"]: x["ParameterValue"] for x in stacks[0].get("Parameters", [])} != {"RuntimeRoleName": ROLE}:
        raise ValueError("STACK_ROLE_DIFFERS")
    actual = call("cloudformation", "get-template", "--stack-name", STACK).get("TemplateBody")
    return json.loads(actual) if isinstance(actual, str) else actual


def inspect_route(read=aws):
    # CloudFormation intent alone is not actual notification routing or delivery.
    attributes = read("sns", "get-topic-attributes", "--topic-arn", TOPIC_ARN).get("Attributes", {})
    if attributes.get("Owner") != ACCOUNT or attributes.get("TopicArn") != TOPIC_ARN:
        raise ValueError("ALERT_TOPIC_BINDING_DIFFERS")
    if attributes.get("KmsMasterKeyId"):
        raise ValueError("UNREVIEWED_ALERT_ENCRYPTION_KEY")
    if canonical_policy(json.loads(attributes.get("Policy", "null"))) != canonical_policy(topic_policy()):
        raise ValueError("ALERT_TOPIC_POLICY_DIFFERS")
    page = read("sns", "list-subscriptions-by-topic", "--topic-arn", TOPIC_ARN)
    entries = page.get("Subscriptions", [])
    if page.get("NextToken") or len(entries) != 1:
        raise ValueError("EXACTLY_ONE_ALERT_RECIPIENT_REQUIRED")
    entry = entries[0]
    if any(entry.get(key) != value for key, value in {"Owner": ACCOUNT, "TopicArn": TOPIC_ARN,
                                                     "Protocol": "email", "Endpoint": RECIPIENT}.items()):
        raise ValueError("ALERT_RECIPIENT_DIFFERS")
    arn = entry.get("SubscriptionArn", "")
    if arn == "PendingConfirmation":
        return {"notificationRouteConfigured": False, "subscriptionConfirmed": False,
                "notificationDeliveryVerified": False, "notificationRouteStatus": "PENDING_EMAIL_CONFIRMATION"}
    if not re.fullmatch(re.escape(TOPIC_ARN) + ":" + UUID, arn):
        raise ValueError("ALERT_SUBSCRIPTION_UNVERIFIED")
    subscription = read("sns", "get-subscription-attributes", "--subscription-arn", arn).get("Attributes", {})
    if any(subscription.get(key) != value for key, value in {"Owner": ACCOUNT, "TopicArn": TOPIC_ARN,
            "Protocol": "email", "Endpoint": RECIPIENT, "PendingConfirmation": "false"}.items()):
        raise ValueError("ALERT_SUBSCRIPTION_DIFFERS")
    if json.loads(subscription.get("FilterPolicy", "{}")) != {}:
        raise ValueError("ALERT_FILTER_COULD_DROP_NOTIFICATIONS")
    if json.loads(subscription.get("RedrivePolicy", "{}")) != {}:
        raise ValueError("UNREVIEWED_ALERT_REDRIVE_ROUTE")
    return {"notificationRouteConfigured": True, "subscriptionConfirmed": True,
            "notificationDeliveryVerified": False, "notificationRouteStatus": "CONFIRMED_NOT_DELIVERY_PROOF"}


def inspect_alarm(read, retention, attached):
    expected = retention.desired_template(retention.base_module())["Resources"]["BackupHealthAlarm"]["Properties"]
    alarms = read("cloudwatch", "describe-alarms", "--alarm-names", retention.ALARM).get("MetricAlarms", [])
    fields = ["AlarmName", "Namespace", "MetricName", "Dimensions", "Statistic", "Period", "EvaluationPeriods",
              "DatapointsToAlarm", "ComparisonOperator", "Threshold", "TreatMissingData"]
    if len(alarms) != 1 or any(alarms[0].get(key) != expected[key] for key in fields):
        raise ValueError("BACKUP_HEALTH_ALARM_DIFFERS")
    alarm = alarms[0]
    if alarm.get("ActionsEnabled") is not True:
        raise ValueError("ALERT_ACTIONS_DISABLED")
    for key in ("AlarmActions", "OKActions", "InsufficientDataActions"):
        actions = [TOPIC_ARN] if attached and key != "InsufficientDataActions" else []
        if alarm.get(key, []) != actions:
            raise ValueError("UNREVIEWED_NOTIFICATION_ROUTE")


def apply(call=aws, retention=None, allow_reviewed_rollback=False):
    retention = retention or retention_module()
    identity = call("sts", "get-caller-identity")
    if identity.get("Account") != ACCOUNT:
        raise ValueError("WRONG_ACCOUNT")
    current = stack_template(call, allow_reviewed_rollback)
    desired = desired_template(retention)
    if current == desired:
        inspect_alarm(call, retention, True)
        return {"status": "ALERT_TEMPLATE_ALREADY_APPLIED", **inspect_route(call), "productionRestoreVerified": False}
    if current != retention.desired_template(retention.base_module()):
        raise ValueError("UNREVIEWED_STACK_DIFFERS")
    inspect_alarm(call, retention, False)
    if call("sns", "get-topic-attributes", "--topic-arn", TOPIC_ARN, missing_topic=True) is not None:
        raise ValueError("ALERT_TOPIC_NAME_ALREADY_IN_USE")
    body = json.dumps(desired, sort_keys=True)
    call("cloudformation", "validate-template", "--template-body", body)
    response = call("cloudformation", "update-stack", "--stack-name", STACK, "--template-body", body,
         "--parameters", json.dumps([{"ParameterKey": "RuntimeRoleName", "UsePreviousValue": True}]),
         "--capabilities", "CAPABILITY_NAMED_IAM", "--client-request-token", "orzell-backup-alert-email-v2")
    if not response.get("StackId", "").startswith("arn:aws:cloudformation:" + REGION + ":" + ACCOUNT + ":stack/" + STACK + "/"):
        raise ValueError("ALERT_UPDATE_UNCERTAIN_NO_RETRY")
    return {"status": "ALERT_UPDATE_REQUESTED", "notificationRouteConfigured": False,
            "subscriptionConfirmed": False, "notificationDeliveryVerified": False, "productionRestoreVerified": False}


def wait_and_test(call=aws, pause=time.sleep, clock=time.monotonic):
    deadline = clock() + 300
    for _ in range(100):
        if clock() >= deadline:
            return {"status": "ALERT_UPDATE_PENDING_NO_RETRY", "notificationDeliveryVerified": False}
        stacks = call("cloudformation", "describe-stacks", "--stack-name", STACK).get("Stacks", [])
        if len(stacks) != 1:
            raise ValueError("STACK_UNVERIFIED_NO_RETRY")
        state = stacks[0].get("StackStatus")
        if state == "UPDATE_COMPLETE":
            break
        if state not in ("UPDATE_IN_PROGRESS", "UPDATE_COMPLETE_CLEANUP_IN_PROGRESS"):
            raise ValueError("ALERT_STACK_REQUIRES_REVIEW")
        pause(3)
    else:
        return {"status": "ALERT_UPDATE_PENDING_NO_RETRY", "notificationDeliveryVerified": False}
    if stack_template(call) != desired_template():
        raise ValueError("ALERT_STACK_TEMPLATE_DIFFERS")
    inspect_alarm(call, retention_module(), True)
    deadline = clock() + 300
    report = {"notificationRouteConfigured": False, "subscriptionConfirmed": False, "notificationDeliveryVerified": False}
    for _ in range(100):
        if clock() >= deadline:
            return {"status": "AWAITING_EMAIL_CONFIRMATION", **report}
        report = inspect_route(call)
        if report["subscriptionConfirmed"]:
            break
        pause(3)
    else:
        return {"status": "AWAITING_EMAIL_CONFIRMATION", **report}
    marker = "ORZELL_BACKUP_ALERT_TEST_" + uuid.uuid4().hex
    # One attempt only. A timeout/unknown response is not automatically republished.
    response = call("sns", "publish", "--topic-arn", TOPIC_ARN, "--subject", "ORZELL backup alert delivery test",
                    "--message", marker + "\nSynthetic delivery check only; no customer data or recovery keys.")
    if not re.fullmatch(UUID, response.get("MessageId", "")):
        raise ValueError("TEST_PUBLISH_UNCERTAIN_DO_NOT_RETRY")
    return {"status": "TEST_ACCEPTED_CHECK_RECIPIENT_INBOX", **report, "testMarker": marker,
            "testAcceptedBySns": True, "testDeliveredToInbox": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--print-template", action="store_true")
    parser.add_argument("--wait-and-send-test", action="store_true")
    parser.add_argument("--resume-after-reviewed-rollback", action="store_true")
    args = parser.parse_args()
    if args.wait_and_send_test and not args.apply:
        parser.error("--wait-and-send-test requires --apply")
    if args.resume_after_reviewed_rollback and not args.apply:
        parser.error("--resume-after-reviewed-rollback requires --apply")
    if not args.apply and not args.print_template:
        print(json.dumps({"status": "PLAN_ONLY_NO_NETWORK", "recipient": RECIPIENT,
                          "newComputeOrKeys": False, "emailsSent": False, "productionRestoreVerified": False}))
        return 0
    try:
        if args.print_template:
            print(json.dumps(desired_template(), indent=2))
        else:
            print(json.dumps(apply(allow_reviewed_rollback=args.resume_after_reviewed_rollback), sort_keys=True), flush=True)
            if args.wait_and_send_test:
                print(json.dumps(wait_and_test(), sort_keys=True), flush=True)
    except Exception as error:
        reason = str(error) if isinstance(error, ValueError) and re.fullmatch(r"[A-Z_]{1,100}", str(error)) else type(error).__name__
        print(json.dumps({"status": "ALERT_SETUP_STOPPED", "reason": reason, "notificationDeliveryVerified": False}))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
