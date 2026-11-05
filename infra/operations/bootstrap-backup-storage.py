#!/usr/bin/env python3
"""Account-owner CloudShell setup for a NEW dedicated encrypted-backup bucket."""

import argparse
import json
import re
import subprocess
import sys


ACCOUNT = "926642724499"
REGION = "eu-north-1"
INSTANCE = "i-09fe7fdb5f10d63b6"
STACK = "orzell-encrypted-backup-storage-v1"
BUCKET = "orzell-backups-926642724499-eu-north-1"
PREFIX = "encrypted/v1/"
POLICY = "ORZELLBackupWriterV1"
BUCKET_ARN = "arn:aws:s3:::" + BUCKET
OBJECTS = BUCKET_ARN + "/" + PREFIX + "*"


def template():
    return {
        "AWSTemplateFormatVersion": "2010-09-09",
        "Description": "Dedicated ORZELL backup storage only; no compute, keys, schedules or existing bucket changes",
        "Parameters": {"RuntimeRoleName": {"Type": "String", "AllowedPattern": "[A-Za-z0-9+=,.@_-]{1,64}"}},
        "Resources": {
            "BackupBucket": {
                "Type": "AWS::S3::Bucket", "DeletionPolicy": "Retain", "UpdateReplacePolicy": "Retain",
                "Properties": {
                    "BucketName": BUCKET,
                    "OwnershipControls": {"Rules": [{"ObjectOwnership": "BucketOwnerEnforced"}]},
                    "PublicAccessBlockConfiguration": {key: True for key in ["BlockPublicAcls", "IgnorePublicAcls", "BlockPublicPolicy", "RestrictPublicBuckets"]},
                    "BucketEncryption": {"ServerSideEncryptionConfiguration": [{"ServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]},
                    "VersioningConfiguration": {"Status": "Enabled"},
                    "Tags": [{"Key": "Project", "Value": "ORZELL"}, {"Key": "Purpose", "Value": "EncryptedDatabaseBackups"}],
                },
            },
            "BackupBucketPolicy": {
                "Type": "AWS::S3::BucketPolicy",
                "Properties": {"Bucket": {"Ref": "BackupBucket"}, "PolicyDocument": {
                    "Version": "2012-10-17", "Statement": [
                        {"Sid": "DenyInsecureTransport", "Effect": "Deny", "Principal": "*", "Action": "s3:*",
                         "Resource": [{"Fn::GetAtt": ["BackupBucket", "Arn"]}, {"Fn::Sub": "${BackupBucket.Arn}/*"}],
                         "Condition": {"Bool": {"aws:SecureTransport": "false"}}},
                        {"Sid": "RequireExplicitSseS3", "Effect": "Deny", "Principal": "*", "Action": "s3:PutObject",
                         "Resource": {"Fn::Sub": "${BackupBucket.Arn}/*"},
                         "Condition": {"StringNotEquals": {"s3:x-amz-server-side-encryption": "AES256"}}},
                    ],
                }},
            },
            "BackupWriterPolicy": {
                "Type": "AWS::IAM::Policy", "DependsOn": "BackupBucket",
                "Properties": {"PolicyName": POLICY, "Roles": [{"Ref": "RuntimeRoleName"}],
                               "PolicyDocument": {"Version": "2012-10-17", "Statement": [
                                   {"Sid": "ReadBackupSafetyMetadata", "Effect": "Allow",
                                    "Action": ["s3:GetBucketVersioning", "s3:GetBucketPublicAccessBlock"], "Resource": BUCKET_ARN},
                                   {"Sid": "WriteAndVerifyEncryptedPackages", "Effect": "Allow",
                                    "Action": ["s3:PutObject", "s3:GetObject"], "Resource": OBJECTS},
                                   {"Sid": "NeverDeleteBackupVersionsFromRuntime", "Effect": "Deny",
                                    "Action": ["s3:DeleteObject", "s3:DeleteObjectVersion"], "Resource": OBJECTS},
                               ]}},
            },
        },
        "Outputs": {"BucketName": {"Value": {"Ref": "BackupBucket"}}, "BackupPrefix": {"Value": PREFIX},
                    "RuntimeRoleName": {"Value": {"Ref": "RuntimeRoleName"}}},
    }


def aws(service, operation, *arguments, missing=None):
    result = subprocess.run(["aws", service, operation, *arguments, "--region", REGION,
                             "--output", "json", "--no-cli-pager", "--cli-connect-timeout", "5", "--cli-read-timeout", "30"],
                            capture_output=True, text=True, timeout=45)
    if result.returncode:
        if missing == "stack" and "ValidationError" in result.stderr and "does not exist" in result.stderr:
            return None
        if missing == "policy" and "NoSuchEntity" in result.stderr:
            return None
        if missing == "bucket" and re.search(r"\((404|NoSuchBucket|NotFound)\)", result.stderr):
            return None
        raise ValueError("AWS_READ_OR_CREATE_FAILED:" + service + ":" + operation)
    return json.loads(result.stdout) if result.stdout.strip() else {}


def preflight(read=aws):
    if read("sts", "get-caller-identity").get("Account") != ACCOUNT:
        raise ValueError("WRONG_ACCOUNT")
    groups = read("ec2", "describe-instances", "--instance-ids", INSTANCE).get("Reservations", [])
    instances = [entry for group in groups for entry in group.get("Instances", [])]
    if len(instances) != 1 or instances[0].get("InstanceId") != INSTANCE or instances[0].get("State", {}).get("Name") != "running":
        raise ValueError("CURRENT_HOST_UNVERIFIED")
    profile = instances[0].get("IamInstanceProfile", {}).get("Arn", "")
    match = re.fullmatch(r"arn:aws:iam::" + ACCOUNT + r":instance-profile/([A-Za-z0-9+=,.@_-]{1,128})", profile)
    if not match:
        raise ValueError("INSTANCE_PROFILE_UNVERIFIED")
    roles = read("iam", "get-instance-profile", "--instance-profile-name", match[1]).get("InstanceProfile", {}).get("Roles", [])
    if len(roles) != 1:
        raise ValueError("ONE_EXISTING_RUNTIME_ROLE_REQUIRED")
    name = roles[0].get("RoleName", "")
    if not re.fullmatch(r"[A-Za-z0-9+=,.@_-]{1,64}", name):
        raise ValueError("RUNTIME_ROLE_UNVERIFIED")
    role = read("iam", "get-role", "--role-name", name).get("Role", {})
    trust = role.get("AssumeRolePolicyDocument", {}).get("Statement", [])
    if (role.get("Arn") != "arn:aws:iam::" + ACCOUNT + ":role/" + name or len(trust) != 1
            or trust[0].get("Effect") != "Allow" or trust[0].get("Action") != "sts:AssumeRole"
            or trust[0].get("Principal") != {"Service": "ec2.amazonaws.com"}
            or set(trust[0]) - {"Sid", "Effect", "Action", "Principal"}):
        raise ValueError("EC2_ONLY_EXISTING_ROLE_REQUIRED")
    stack = read("cloudformation", "describe-stacks", "--stack-name", STACK, missing="stack")
    if stack is not None:
        stacks = stack.get("Stacks", [])
        if len(stacks) != 1 or stacks[0].get("StackStatus") not in ("CREATE_COMPLETE", "UPDATE_COMPLETE"):
            raise ValueError("EXISTING_STACK_REQUIRES_REVIEW")
        parameters = {item["ParameterKey"]: item["ParameterValue"] for item in stacks[0].get("Parameters", [])}
        actual = read("cloudformation", "get-template", "--stack-name", STACK).get("TemplateBody")
        if isinstance(actual, str):
            actual = json.loads(actual)
        if parameters != {"RuntimeRoleName": name} or actual != template():
            raise ValueError("EXISTING_STACK_DIFFERS")
        return name, True
    if read("iam", "get-role-policy", "--role-name", name, "--policy-name", POLICY, missing="policy") is not None:
        raise ValueError("UNMANAGED_EXISTING_POLICY")
    if read("s3api", "head-bucket", "--bucket", BUCKET, "--expected-bucket-owner", ACCOUNT, missing="bucket") is not None:
        raise ValueError("EXISTING_BUCKET_NOT_ADOPTED")
    return name, False


def apply(call=aws):
    name, exists = preflight(call)
    if exists:
        return {"status": "EXISTING_STACK_UNCHANGED", "productionReady": False}
    body = json.dumps(template(), sort_keys=True)
    call("cloudformation", "validate-template", "--template-body", body)
    result = call("cloudformation", "create-stack", "--stack-name", STACK, "--template-body", body,
                  "--parameters", json.dumps([{"ParameterKey": "RuntimeRoleName", "ParameterValue": name}]),
                  "--capabilities", "CAPABILITY_NAMED_IAM", "--client-request-token", "orzell-backup-storage-v1-initial")
    if not result.get("StackId", "").startswith("arn:aws:cloudformation:" + REGION + ":" + ACCOUNT + ":stack/" + STACK + "/"):
        raise ValueError("STACK_CREATE_RESULT_UNCERTAIN_NO_RETRY")
    return {"status": "STACK_CREATE_REQUESTED", "stack": STACK, "region": REGION, "productionReady": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--print-template", action="store_true")
    args = parser.parse_args()
    if args.print_template:
        print(json.dumps(template(), indent=2))
    elif not args.apply:
        print(json.dumps({"status": "PLAN_ONLY_NO_AWS_CALLS", "account": ACCOUNT, "region": REGION,
                          "newBucket": BUCKET, "prefix": PREFIX, "existingHost": INSTANCE,
                          "creates": ["private versioned AES256 bucket", "TLS/SSE-only bucket policy", "narrow existing-runtime inline policy"],
                          "automaticDeletion": False, "newComputeOrKmsKey": False,
                          "backupOrScheduleCreated": False, "ownerApplyRequired": True}))
    else:
        try:
            print(json.dumps(apply(), sort_keys=True))
        except (ValueError, OSError, subprocess.TimeoutExpired, KeyError, TypeError, AttributeError) as error:
            print(json.dumps({"status": "STOPPED", "reason": str(error) if isinstance(error, ValueError) else type(error).__name__}))
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
