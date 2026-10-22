#!/usr/bin/env python3
"""One-time owner CloudShell setup for the approved preview management bridge."""
import argparse
import json
import sys

ACCOUNT = "926642724499"
REGION = "eu-north-1"
INSTANCE = "i-09fe7fdb5f10d63b6"
ROLE = "BeautyPlatformPreviewOperations"
POLICY_NAME = "SinglePreviewServer"
PROVIDER = f"arn:aws:iam::{ACCOUNT}:oidc-provider/token.actions.githubusercontent.com"
TRUST = {
    "Version": "2012-10-17",
    "Statement": [{"Effect": "Allow", "Principal": {"Federated": PROVIDER},
        "Action": "sts:AssumeRoleWithWebIdentity", "Condition": {"StringEquals": {
            "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
            "token.actions.githubusercontent.com:sub": "repo:umutbarut7-svg@327211068/Beauty-platform@1363270994:ref:refs/heads/main"}}}],
}
LEGACY_TRUST = json.loads(json.dumps(TRUST))
LEGACY_TRUST["Statement"][0]["Condition"]["StringEquals"]["token.actions.githubusercontent.com:sub"] = "repo:umutbarut7-svg/Beauty-platform:ref:refs/heads/main"
POLICY = {
    "Version": "2012-10-17",
    "Statement": [
        {"Sid": "CommandOnlyOnExistingPreview", "Effect": "Allow", "Action": "ssm:SendCommand",
         "Resource": [f"arn:aws:ec2:{REGION}:{ACCOUNT}:instance/{INSTANCE}",
                      f"arn:aws:ssm:{REGION}::document/AWS-RunShellScript"]},
        {"Sid": "CommandStatusAndHostInventory", "Effect": "Allow",
         "Action": ["ssm:GetCommandInvocation", "ssm:ListCommands", "ssm:ListCommandInvocations",
                    "ssm:DescribeInstanceInformation", "ec2:DescribeInstances", "ec2:DescribeInstanceStatus"],
         "Resource": "*", "Condition": {"StringEquals": {"aws:RequestedRegion": REGION}}},
    ],
}


def provision(sts, iam, ec2):
    # All preflight reads precede the first mutation. No access keys or instance changes.
    if sts.get_caller_identity()["Account"] != ACCOUNT:
        raise RuntimeError("Wrong AWS account; no changes made")
    provider = iam.get_open_id_connect_provider(OpenIDConnectProviderArn=PROVIDER)
    if provider["Url"].removeprefix("https://") != "token.actions.githubusercontent.com" or "sts.amazonaws.com" not in provider["ClientIDList"]:
        raise RuntimeError("Unexpected existing GitHub OIDC provider")
    reservations = ec2.describe_instances(InstanceIds=[INSTANCE])["Reservations"]
    hosts = [host for group in reservations for host in group["Instances"]]
    if len(hosts) != 1 or hosts[0]["InstanceId"] != INSTANCE or hosts[0]["State"]["Name"] != "running":
        raise RuntimeError("Expected running preview host not found")
    try:
        role = iam.get_role(RoleName=ROLE)["Role"]
    except iam.exceptions.NoSuchEntityException:
        role = None
    if role:
        trust = role["AssumeRolePolicyDocument"]
        if trust not in (TRUST, LEGACY_TRUST):
            raise RuntimeError("Existing role trust differs; left unchanged")
        attached = iam.list_attached_role_policies(RoleName=ROLE)
        inline = iam.list_role_policies(RoleName=ROLE)
        if attached.get("AttachedPolicies") or attached.get("IsTruncated") or inline.get("IsTruncated") or set(inline.get("PolicyNames", [])) - {POLICY_NAME}:
            raise RuntimeError("Existing role has unexpected policies; left unchanged")
        if POLICY_NAME in inline.get("PolicyNames", []):
            if iam.get_role_policy(RoleName=ROLE, PolicyName=POLICY_NAME)["PolicyDocument"] != POLICY:
                raise RuntimeError("Existing permissions differ; left unchanged")
            if trust == LEGACY_TRUST:
                # Repair only the exact trust created by the original bootstrap.
                # The ID-bearing subject was verified in the successful OIDC audit log.
                iam.update_assume_role_policy(RoleName=ROLE, PolicyDocument=json.dumps(TRUST))
                print("GITHUB KIMLIK ESLESMESI DUZELTILDI; sunucu ve yetki kapsami degismedi.")
                return
            print("BAGLANTI ROLU ZATEN HAZIR; degisiklik yapilmadi.")
            return
        if trust == LEGACY_TRUST:
            raise RuntimeError("Legacy role setup is incomplete; inspect before repair")
    else:
        iam.create_role(RoleName=ROLE, AssumeRolePolicyDocument=json.dumps(TRUST),
                        Description="GitHub main operations on the single approved preview host",
                        MaxSessionDuration=3600, Tags=[{"Key": "Project", "Value": "BeautyPlatformPreview"}])
    iam.put_role_policy(RoleName=ROLE, PolicyName=POLICY_NAME, PolicyDocument=json.dumps(POLICY))
    print("BAGLANTI ROLU HAZIR. GitHub uzerinden canli dogrulama gerekiyor.")
    print("Yeni sunucu olusturulmadi; mevcut servisler degistirilmedi; erisim anahtari uretilmedi.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if not args.apply:
        print("PLAN: GitHub main -> temporary OIDC role -> SSM on one existing preview host.")
        print("SSM shell commands run with host administrator privileges. No AWS IAM writes or infrastructure creation granted.")
        print("Only --apply creates the dedicated IAM role and its inline policy; no AWS calls in plan mode.")
        return
    import boto3
    from botocore.config import Config
    config = Config(connect_timeout=5, read_timeout=20, retries={"total_max_attempts": 2})
    try:
        provision(*(boto3.client(service, region_name=REGION, config=config) for service in ["sts", "iam", "ec2"]))
    except Exception as error:
        code = getattr(error, "response", {}).get("Error", {}).get("Code")
        print("Kurulum durdu: " + (code or (str(error) if isinstance(error, RuntimeError) else type(error).__name__)), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
