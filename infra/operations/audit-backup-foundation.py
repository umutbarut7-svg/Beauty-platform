#!/usr/bin/env python3
"""Inspect the owner's completed backup stack and exact live safety policies."""

import importlib.util
import json
import os
from pathlib import Path
import subprocess


SPEC = importlib.util.spec_from_file_location("foundation", Path(__file__).with_name("bootstrap-backup-storage.py"))
FOUNDATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(FOUNDATION)
ROLE = "BeautyPlatformPreview-RuntimeRole-qJeq1ARIaXWh"
ALLOWED = {("sts", "get-caller-identity"), ("cloudformation", "describe-stacks"),
           ("cloudformation", "get-template"), ("iam", "get-role-policy"),
           ("s3api", "get-bucket-policy"), ("s3api", "get-bucket-encryption"),
           ("s3api", "get-bucket-lifecycle-configuration"), ("cloudwatch", "describe-alarms"),
           ("sns", "get-topic-attributes"), ("sns", "list-subscriptions-by-topic"),
           ("sns", "get-subscription-attributes")}


def aws(service, operation, *arguments):
    if (service, operation) not in ALLOWED:
        raise ValueError("READ_ONLY_AUDIT_REQUIRED")
    result = subprocess.run(["aws", service, operation, *arguments, "--region", FOUNDATION.REGION,
                             "--output", "json", "--no-cli-pager", "--cli-connect-timeout", "5", "--cli-read-timeout", "20"],
                            capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise ValueError("AUDIT_READ_UNAVAILABLE:" + service + ":" + operation)
    return json.loads(result.stdout)


def normalize(value):
    if isinstance(value, dict):
        result = {key: normalize(item) for key, item in value.items()}
        for key in ["Action", "Resource"]:
            if key in result:
                items = result[key] if isinstance(result[key], list) else [result[key]]
                result[key] = sorted(items)
        if "Statement" in result:
            result["Statement"] = sorted(result["Statement"], key=lambda item: json.dumps(item, sort_keys=True))
        return result
    return [normalize(item) for item in value] if isinstance(value, list) else value


def resolve(value):
    if isinstance(value, dict):
        if value == {"Ref": "BackupBucket"}:
            return FOUNDATION.BUCKET
        if value == {"Fn::GetAtt": ["BackupBucket", "Arn"]}:
            return FOUNDATION.BUCKET_ARN
        if set(value) == {"Fn::Sub"}:
            return value["Fn::Sub"].replace("${BackupBucket.Arn}", FOUNDATION.BUCKET_ARN)
        return {key: resolve(item) for key, item in value.items()}
    return [resolve(item) for item in value] if isinstance(value, list) else value


def inspect(read=aws, expected_template=None, accepted_statuses=("CREATE_COMPLETE",)):
    identity = read("sts", "get-caller-identity")
    prefix = "arn:aws:sts::" + FOUNDATION.ACCOUNT + ":assumed-role/BeautyPlatformGitHubAudit/"
    if identity.get("Account") != FOUNDATION.ACCOUNT or not identity.get("Arn", "").startswith(prefix):
        raise ValueError("AUDIT_IDENTITY_DIFFERS")
    stacks = read("cloudformation", "describe-stacks", "--stack-name", FOUNDATION.STACK).get("Stacks", [])
    if len(stacks) != 1 or stacks[0].get("StackStatus") not in accepted_statuses:
        raise ValueError("STACK_NOT_CREATE_COMPLETE")
    stack = stacks[0]
    parameters = {item["ParameterKey"]: item["ParameterValue"] for item in stack.get("Parameters", [])}
    outputs = {item["OutputKey"]: item["OutputValue"] for item in stack.get("Outputs", [])}
    if parameters != {"RuntimeRoleName": ROLE} or outputs != {"BucketName": FOUNDATION.BUCKET, "BackupPrefix": FOUNDATION.PREFIX, "RuntimeRoleName": ROLE}:
        raise ValueError("STACK_BINDING_DIFFERS")
    actual = read("cloudformation", "get-template", "--stack-name", FOUNDATION.STACK).get("TemplateBody")
    if isinstance(actual, str):
        actual = json.loads(actual)
    expected = expected_template if expected_template is not None else FOUNDATION.template()
    if actual != expected:
        raise ValueError("STACK_TEMPLATE_DIFFERS")
    writer = read("iam", "get-role-policy", "--role-name", ROLE, "--policy-name", FOUNDATION.POLICY).get("PolicyDocument")
    if normalize(writer) != normalize(expected["Resources"]["BackupWriterPolicy"]["Properties"]["PolicyDocument"]):
        raise ValueError("LIVE_WRITER_POLICY_DIFFERS")
    options = ["--bucket", FOUNDATION.BUCKET, "--expected-bucket-owner", FOUNDATION.ACCOUNT]
    policy = read("s3api", "get-bucket-policy", *options).get("Policy")
    if isinstance(policy, str):
        policy = json.loads(policy)
    if normalize(policy) != normalize(resolve(expected["Resources"]["BackupBucketPolicy"]["Properties"]["PolicyDocument"])):
        raise ValueError("LIVE_BUCKET_POLICY_DIFFERS")
    encryption = read("s3api", "get-bucket-encryption", *options).get("ServerSideEncryptionConfiguration", {}).get("Rules", [])
    if len(encryption) != 1 or encryption[0].get("ApplyServerSideEncryptionByDefault") != {"SSEAlgorithm": "AES256"}:
        raise ValueError("BUCKET_ENCRYPTION_DIFFERS")
    return {"status": "FOUNDATION_AUDIT_COMPLETE", "stackStatus": stack["StackStatus"],
            "templateAndRoleBinding": True, "liveWriterPolicy": True, "liveTlsAndSsePolicy": True,
            "defaultEncryption": "AES256", "productionReady": False}


def main():
    request = json.loads(Path(".github/operations/backup-storage-verification.json").read_text())
    if request != {"request_id": "orzell-backup-storage-verification-20261105-1", "mode": "audit-and-one-encrypted-probe"}:
        raise ValueError("UNSUPPORTED_VERIFICATION_REQUEST")
    report = inspect()
    print(json.dumps(report, sort_keys=True))
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write("complete=true\n")
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
        summary.write("## Backup foundation audit\n\n```json\n" + json.dumps(report, indent=2) + "\n```\n")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, TypeError, KeyError, AttributeError, subprocess.TimeoutExpired) as error:
        print(json.dumps({"status": "FOUNDATION_AUDIT_FAILED", "reason": str(error) if isinstance(error, ValueError) else type(error).__name__}))
        raise SystemExit(1)
