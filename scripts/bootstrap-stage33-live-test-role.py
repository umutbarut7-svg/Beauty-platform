"""Run in the account owner's CloudShell. Never reads the OpenAI secret."""
import json
import subprocess
import sys

ACCOUNT = "926642724499"
REGION = "eu-north-1"
ROLE = "BeautyPlatformLiveAdapterTest"
POLICY = "Stage33AdapterTestOnly"
PARAMETER = f"arn:aws:ssm:{REGION}:{ACCOUNT}:parameter/beauty-platform/dev/openai-api-key"
BUCKET = "arn:aws:s3:::beautyplatform-private-photos-dev"
PREFIX = "private/mvp/f33f33f3-*"


def aws(*args, optional=False):
    result = subprocess.run(
        ["aws", *args, "--output", "json", "--no-cli-pager"],
        capture_output=True, text=True, timeout=60,
    )
    if result.returncode:
        if optional and "NoSuchEntity" in result.stderr:
            return None
        # Do not echo CLI request details or raw responses.
        raise RuntimeError("AWS operation failed: " + " ".join(args[:2]))
    return json.loads(result.stdout) if result.stdout.strip() else {}


def main():
    if aws("sts", "get-caller-identity")["Account"] != ACCOUNT:
        raise RuntimeError("Wrong AWS account; no changes made")
    key_arn = aws("kms", "describe-key", "--key-id", "alias/aws/ssm",
                  "--region", REGION)["KeyMetadata"]["Arn"]
    trust = {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Federated": f"arn:aws:iam::{ACCOUNT}:oidc-provider/token.actions.githubusercontent.com"},
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {"StringEquals": {
                "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
                "token.actions.githubusercontent.com:sub": "repo:umutbarut7-svg@327211068/Beauty-platform@1363270994:ref:refs/heads/main",
            }},
        }],
    }
    permission = {
        "Version": "2012-10-17",
        "Statement": [
            {"Effect": "Allow", "Action": "ssm:GetParameter", "Resource": PARAMETER},
            {"Effect": "Allow", "Action": "kms:Decrypt", "Resource": key_arn,
             "Condition": {"StringEquals": {
                 "kms:ViaService": f"ssm.{REGION}.amazonaws.com",
                 "kms:EncryptionContext:PARAMETER_ARN": PARAMETER,
             }}},
            {"Effect": "Allow", "Action": ["s3:GetBucketVersioning", "s3:GetBucketPublicAccessBlock"],
             "Resource": BUCKET},
            {"Effect": "Allow", "Action": "s3:ListBucket", "Resource": BUCKET,
             "Condition": {"StringLike": {"s3:prefix": PREFIX}}},
            {"Effect": "Allow", "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
             "Resource": f"{BUCKET}/{PREFIX}"},
        ],
    }
    existing = aws("iam", "get-role", "--role-name", ROLE, optional=True)
    if existing:
        role = existing["Role"]
        attached = aws("iam", "list-attached-role-policies", "--role-name", ROLE)["AttachedPolicies"]
        names = aws("iam", "list-role-policies", "--role-name", ROLE)["PolicyNames"]
        if (role["AssumeRolePolicyDocument"] != trust or attached
                or role.get("PermissionsBoundary") or set(names) - {POLICY}):
            raise RuntimeError("Existing role differs; stopped without changing it")
    else:
        aws("iam", "create-role", "--role-name", ROLE,
            "--assume-role-policy-document", json.dumps(trust),
            "--description", "Stage 33 adapter checks: one SSM parameter and reserved synthetic S3 objects only",
            "--max-session-duration", "3600")
    aws("iam", "put-role-policy", "--role-name", ROLE,
        "--policy-name", POLICY, "--policy-document", json.dumps(permission))
    actual = aws("iam", "get-role-policy", "--role-name", ROLE,
                 "--policy-name", POLICY)["PolicyDocument"]
    if actual != permission:
        raise RuntimeError("Role policy verification failed")
    print("Test rolu hazir. Anahtar okunmadi veya degistirilmedi.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else "Kurulum tamamlanamadi.")
        sys.exit(1)
