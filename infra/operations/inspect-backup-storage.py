#!/usr/bin/env python3
"""Read bucket configuration only. Never lists or reads stored objects."""

import json
import os
from pathlib import Path
import re
import subprocess


ACCOUNT = "926642724499"
ROLE = "arn:aws:sts::" + ACCOUNT + ":assumed-role/BeautyPlatformGitHubAudit/"
ALLOWED = {
    ("sts", "get-caller-identity"), ("s3api", "list-buckets"),
    ("s3api", "get-bucket-location"), ("s3api", "get-public-access-block"),
    ("s3api", "get-bucket-encryption"), ("s3api", "get-bucket-versioning"),
    ("s3api", "get-bucket-lifecycle-configuration"),
    ("s3api", "get-object-lock-configuration"), ("s3api", "get-bucket-policy-status"),
}


def aws(service, operation, **options):
    if (service, operation) not in ALLOWED:
        raise ValueError("READ_ONLY_OPERATION_REQUIRED")
    args = ["aws", service, operation, "--output", "json", "--no-cli-pager",
            "--region", "eu-north-1", "--cli-connect-timeout", "5", "--cli-read-timeout", "10"]
    for key, value in options.items():
        args += ["--" + key.replace("_", "-"), str(value)]
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=20,
                                env={**os.environ, "AWS_MAX_ATTEMPTS": "1", "AWS_PAGER": ""})
        if result.returncode:
            match = re.search(r"\(([A-Za-z0-9_.-]{1,80})\)", result.stderr)
            return {"unknown": match.group(1) if match else "CommandFailed"}
        value = json.loads(result.stdout)
        return value if isinstance(value, dict) else {"unknown": "InvalidResponse"}
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return {"unknown": "ReadFailed"}


def field(result, *keys):
    if "unknown" in result:
        return "UNKNOWN"
    value = result
    for key in keys:
        if not isinstance(value, dict) or key not in value:
            return "UNKNOWN"
        value = value[key]
    return value


def inspect(read=aws):
    identity = read("sts", "get-caller-identity")
    if identity.get("Account") != ACCOUNT or not identity.get("Arn", "").startswith(ROLE):
        raise ValueError("UNEXPECTED_AUDIT_IDENTITY")
    listed = read("s3api", "list-buckets")
    buckets = listed.get("Buckets")
    if not isinstance(buckets, list) or len(buckets) > 20:
        return {"status": "INCOMPLETE", "bucketCount": "UNKNOWN", "buckets": []}
    rows = []
    for index, bucket in enumerate(buckets, 1):
        # Names are used only in the request; reports contain ordinal aliases.
        name = bucket.get("Name") if isinstance(bucket, dict) else None
        if not isinstance(name, str) or not re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", name):
            raise ValueError("INVALID_BUCKET_METADATA")
        options = {"bucket": name, "expected_bucket_owner": ACCOUNT}
        location = read("s3api", "get-bucket-location", **options)
        region = location.get("LocationConstraint") or "us-east-1"
        block = field(read("s3api", "get-public-access-block", **options), "PublicAccessBlockConfiguration")
        blocks = ["BlockPublicAcls", "IgnorePublicAcls", "BlockPublicPolicy", "RestrictPublicBuckets"]
        public = all(block.get(key) is True for key in blocks) if isinstance(block, dict) and all(key in block for key in blocks) else "UNKNOWN"
        encryption = field(read("s3api", "get-bucket-encryption", **options), "ServerSideEncryptionConfiguration", "Rules")
        algorithms = sorted({rule.get("ApplyServerSideEncryptionByDefault", {}).get("SSEAlgorithm", "UNKNOWN") for rule in encryption}) if isinstance(encryption, list) else ["UNKNOWN"]
        version = read("s3api", "get-bucket-versioning", **options)
        lifecycle = read("s3api", "get-bucket-lifecycle-configuration", **options)
        rules = lifecycle.get("Rules")
        active = sum(rule.get("Status") == "Enabled" for rule in rules) if isinstance(rules, list) else "UNKNOWN"
        if lifecycle.get("unknown") == "NoSuchLifecycleConfiguration":
            active = 0
        lock = read("s3api", "get-object-lock-configuration", **options)
        locked = field(lock, "ObjectLockConfiguration", "ObjectLockEnabled")
        if lock.get("unknown") == "ObjectLockConfigurationNotFoundError":
            locked = "Not enabled"
        policy = field(read("s3api", "get-bucket-policy-status", **options), "PolicyStatus", "IsPublic")
        rows.append({"bucket": index, "region": "UNKNOWN" if "unknown" in location else region,
                     "allPublicBlocks": public, "policyPublic": policy,
                     "encryption": algorithms, "versioning": version.get("Status", "Not enabled") if "unknown" not in version else "UNKNOWN",
                     "activeLifecycleRules": active, "objectLock": locked})
    return {"status": "METADATA_READ_COMPLETE", "bucketCount": len(buckets), "buckets": rows}


def main():
    request = json.loads(Path(".github/operations/backup-storage-inspection.json").read_text())
    if request != {"request_id": "orzell-backup-storage-inspection-20261105-1", "mode": "read-bucket-configuration"}:
        raise ValueError("UNSUPPORTED_REQUEST")
    result = inspect()
    print(json.dumps(result, sort_keys=True))
    report = "## Backup storage metadata\n\n```json\n" + json.dumps(result, indent=2, sort_keys=True) + "\n```\n\n"
    report += "No objects listed/read/written. No resource, policy, key or service changes. UNKNOWN is unverified.\n"
    report += "Bucket metadata is not proof of backup destination selection, effective writer/recovery permissions, retention coverage, key custody, scheduling or successful production recovery.\n"
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
        summary.write(report)
    return 0 if result["status"] == "METADATA_READ_COMPLETE" else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, OSError, TypeError, AttributeError):
        print('{"status":"INSPECTION_FAILED"}')
        raise SystemExit(1)
