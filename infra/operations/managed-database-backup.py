#!/usr/bin/env python3
"""Daily bounded database backup; ciphertext only, create-only off-host upload."""

import argparse
import base64
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import resource
import shutil
import signal
import stat
import subprocess
import sys
import tempfile


ROOT = Path("/opt/epifiz/backup")
BUCKET = "orzell-backups-926642724499-eu-north-1"
ACCOUNT = "926642724499"
ROLE = "BeautyPlatformPreview-RuntimeRole-qJeq1ARIaXWh"
PIN = "241abc0895734f656d4a5920ad074e008f56c405b0d5a144b0e823777293c84c"
APPLICATION = "2e56def282c97a804a2f3d6c9b36a53b42a09df5"
IMAGE = "sha256:f13b300b0a0a236553b174b6453fc1d8ec3c06b1c912074401e625371464c99e"
LIMIT = 128 * 1024 * 1024
MAX_AGE = 26 * 3600


def utcnow():
    return datetime.now(timezone.utc)


def timestamp(now):
    return now.strftime("%Y-%m-%dT%H:%M:%SZ")


def private_read(path, limit=32768):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077 or info.st_size > limit:
            raise ValueError("UNSAFE_BACKUP_FILE")
        data = source.read(limit + 1)
        if len(data) > limit:
            raise ValueError("BACKUP_FILE_LIMIT")
        return data


def secure_directory(path, create=False):
    path = Path(path)
    for ancestor in reversed([path, *path.parents]):
        try:
            info = ancestor.lstat()
        except FileNotFoundError:
            if not create:
                raise
            ancestor.mkdir(mode=0o700)
            info = ancestor.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid not in (0, os.getuid()) or info.st_mode & 0o022:
            raise ValueError("UNSAFE_BACKUP_DIRECTORY")
    if path.stat().st_uid != os.getuid() or path.stat().st_mode & 0o077:
        raise ValueError("PRIVATE_BACKUP_DIRECTORY_REQUIRED")
    return path


def atomic_json(path, value, replace=False):
    if os.path.lexists(path):
        if not replace:
            raise ValueError("EXISTING_BACKUP_RECEIPT")
        private_read(path)
    fd, temporary = tempfile.mkstemp(prefix=".managed-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(json.dumps(value, sort_keys=True).encode())
            stream.flush()
            os.fsync(stream.fileno())
        if replace:
            os.replace(temporary, path)
        else:
            os.link(temporary, path, follow_symlinks=False)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def command(arguments, **kwargs):
    result = subprocess.run(arguments, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=25, **kwargs)
    if result.returncode:
        raise ValueError("BACKUP_COMMAND_FAILED")
    return result.stdout


def aws(service, operation, *arguments):
    allowed = {("sts", "get-caller-identity"), ("s3api", "get-bucket-versioning"), ("s3api", "get-public-access-block"),
               ("s3api", "get-bucket-lifecycle-configuration"), ("s3api", "put-object"), ("s3api", "get-object"),
               ("cloudwatch", "put-metric-data")}
    if (service, operation) not in allowed:
        raise ValueError("BACKUP_OPERATION_NOT_ALLOWED")
    return json.loads(command(["aws", service, operation, *arguments, "--region", "eu-north-1", "--output", "json", "--no-cli-pager",
                               "--cli-connect-timeout", "5", "--cli-read-timeout", "20"],
                              env={**os.environ, "AWS_MAX_ATTEMPTS": "1", "AWS_PAGER": ""}) or b"{}")


def services(read=command):
    result = {}
    for name in ["api", "worker", "postgres"]:
        value = read(["docker", "inspect", "--format", "{{.Id}}|{{.Image}}|{{.RestartCount}}|{{.State.StartedAt}}|{{.State.Running}}|{{.State.OOMKilled}}",
                      "beauty-preview-" + name + "-1"]).decode().strip().split("|")
        if len(value) != 6 or value[4:] != ["true", "false"] or (name != "postgres" and value[1] != IMAGE):
            raise ValueError("BACKUP_RELEASE_REQUIRES_REVIEW")
        result[name] = value
    return result


def config():
    secure_directory(ROOT)
    value = json.loads(private_read(ROOT / "managed-config.json"))
    if (set(value) != {"version", "recipient", "signer", "application", "image", "release"}
            or value["version"] != 1 or value["recipient"] != PIN or value["application"] != APPLICATION
            or value["image"] != IMAGE or not re.fullmatch(r"[0-9a-f]{64}", value["signer"])
            or not re.fullmatch(r"[0-9a-f]{40}", value["release"])):
        raise ValueError("MANAGED_CONFIG_DIFFERS")
    return value


def approved_lifecycle(value):
    rules = {rule.get("ID"): rule for rule in value.get("Rules", [])}
    if len(value.get("Rules", [])) != 2 or set(rules) != {"ApprovedThirtyDayBackupRetention", "RemoveExpiredBackupDeleteMarkers"}:
        raise ValueError("APPROVED_RETENTION_REQUIRED")
    for rule in rules.values():
        prefix = rule.get("Prefix", rule.get("Filter", {}).get("Prefix"))
        if (rule.get("Status") != "Enabled" or prefix != "encrypted/v1/"
                or ("Prefix" in rule and "Filter" in rule)
                or ("Filter" in rule and rule["Filter"] != {"Prefix": "encrypted/v1/"})):
            raise ValueError("RETENTION_PREFIX_DIFFERS")
    expiry = rules["ApprovedThirtyDayBackupRetention"]
    if (expiry.get("Expiration") != {"Days": 30} or expiry.get("NoncurrentVersionExpiration") != {"NoncurrentDays": 1}
            or expiry.get("AbortIncompleteMultipartUpload") != {"DaysAfterInitiation": 1}
            or rules["RemoveExpiredBackupDeleteMarkers"].get("Expiration") != {"ExpiredObjectDeleteMarker": True}):
        raise ValueError("RETENTION_DAYS_DIFFERS")


def cloud_preflight(call=aws):
    identity = call("sts", "get-caller-identity")
    if identity.get("Account") != ACCOUNT or not identity.get("Arn", "").startswith("arn:aws:sts::" + ACCOUNT + ":assumed-role/" + ROLE + "/"):
        raise ValueError("RUNTIME_IDENTITY_DIFFERS")
    options = ["--bucket", BUCKET, "--expected-bucket-owner", ACCOUNT]
    if call("s3api", "get-bucket-versioning", *options).get("Status") != "Enabled":
        raise ValueError("VERSIONING_REQUIRED")
    block = call("s3api", "get-public-access-block", *options).get("PublicAccessBlockConfiguration", {})
    if not all(block.get(key) is True for key in ["BlockPublicAcls", "IgnorePublicAcls", "BlockPublicPolicy", "RestrictPublicBuckets"]):
        raise ValueError("PRIVATE_BACKUP_BUCKET_REQUIRED")
    approved_lifecycle(call("s3api", "get-bucket-lifecycle-configuration", *options))
    return options


def file_digest(path):
    result = hashlib.sha256()
    count = 0
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError("UNSAFE_PACKAGE_FILE")
        while True:
            block = source.read(1024 * 1024)
            if not block:
                break
            count += len(block)
            if count > LIMIT:
                raise ValueError("PACKAGE_SIZE_LIMIT")
            result.update(block)
    if count == 0:
        raise ValueError("EMPTY_PACKAGE")
    return result.digest(), count


def dump_command():
    return ["docker", "exec", "beauty-preview-postgres-1", "timeout", "--kill-after=5s", "300s", "/bin/sh", "-c",
            'if [ "$POSTGRES_DB" != beauty_preview ] || [ "$POSTGRES_USER" != beauty ]; then exit 70; fi; '
            'export PGPASSWORD="$POSTGRES_PASSWORD"; exec nice -n 10 pg_dump --username=beauty --dbname=beauty_preview '
            '--format=custom --no-owner --no-password --lock-wait-timeout=5000']


def produce(package, backup_id, settings):
    arguments = [sys.executable, str(Path(__file__).with_name("produce-backup.py")),
                 "--output", str(package), "--certificate", str(ROOT / "trust/orzell-recovery-241abc0895734f65.crt"),
                 "--signing-public", str(ROOT / "signing/signer.pub"), "--signing-private", str(ROOT / "signing/signer.key"),
                 "--expected-recipient", PIN, "--expected-signer", settings["signer"], "--backup-id", backup_id,
                 "--application-sha", APPLICATION, "--boundary", "LIVE_DAILY_SNAPSHOT", "--timeout", "310", "--", *dump_command()]
    def limits():
        resource.setrlimit(resource.RLIMIT_FSIZE, (LIMIT, LIMIT))
    process = subprocess.Popen(arguments, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                               start_new_session=True, preexec_fn=limits)
    try:
        output, _ = process.communicate(timeout=600)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait()
        raise ValueError("BACKUP_PRODUCER_DEADLINE")
    if process.returncode or json.loads(output).get("status") != "ENCRYPTED_SIGNED_PACKAGE_CREATED":
        raise ValueError("BACKUP_PRODUCER_FAILED")


def load_state():
    path = ROOT / "state/state.json"
    return json.loads(private_read(path)) if os.path.lexists(path) else {"lastSuccessAt": None, "lastAttemptAt": None, "lastAttemptStatus": "NEVER"}


def status(now=None):
    now = now or utcnow()
    state = load_state()
    success = state.get("lastSuccessAt")
    age = (now - datetime.strptime(success, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)).total_seconds() if success else None
    running = state.get("lastAttemptStatus") == "RUNNING" and state.get("lastAttemptAt")
    running_age = (now - datetime.strptime(state["lastAttemptAt"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)).total_seconds() if running else None
    healthy = age is not None and 0 <= age <= MAX_AGE and (state.get("lastAttemptStatus") == "SUCCESS" or (running_age is not None and 0 <= running_age <= 660))
    return {"healthy": healthy, "lastSuccessAt": success, "lastAttemptStatus": state.get("lastAttemptStatus"), "ageSeconds": age}


def health(call=aws):
    report = status()
    try:
        config()
        services()
    except (ValueError, OSError):
        report["healthy"] = False
    metric = [{"MetricName": "BackupHealthy", "Dimensions": [{"Name": "BackupSet", "Value": "orzell-database-v1"}],
               "Value": 1 if report["healthy"] else 0, "Unit": "Count"}]
    call("cloudwatch", "put-metric-data", "--namespace", "ORZELL/Backup", "--metric-data", json.dumps(metric))
    return report


def backup(call=aws, create=produce, snapshot=services, now=None):
    now = now or utcnow()
    settings = config()
    before = snapshot()
    options = cloud_preflight(call)
    if shutil.disk_usage(ROOT).free < 1024 * 1024 * 1024 + 2 * LIMIT:
        raise ValueError("BACKUP_DISK_RESERVE_REQUIRED")
    day = now.strftime("%Y-%m-%d")
    folder = ROOT / "runs" / day
    secure_directory(folder, create=True)
    if os.path.lexists(folder / "result.json"):
        receipt = json.loads(private_read(folder / "result.json"))
        if receipt.get("status") != "BACKUP_VERIFIED" or receipt.get("applicationSha") != APPLICATION or receipt.get("recipient") != PIN:
            raise ValueError("EXISTING_DAILY_RECEIPT_DIFFERS")
        return {**receipt, "alreadyComplete": True}
    if os.path.lexists(folder / "started.json"):
        raise ValueError("DAILY_ATTEMPT_REQUIRES_INSPECTION_NO_RETRY")
    state = load_state()
    backup_id = "orzell-database-" + now.strftime("%Y%m%d")
    key = "encrypted/v1/daily/" + day + "/" + backup_id + ".zip"
    atomic_json(folder / "started.json", {"backupId": backup_id, "createdAt": timestamp(now), "objectKey": key})
    state.update({"lastAttemptAt": timestamp(now), "lastAttemptStatus": "RUNNING"})
    atomic_json(ROOT / "state/state.json", state, replace=True)
    package, readback = folder / "backup.zip", folder / "readback.zip"
    create(package, backup_id, settings)
    if before != snapshot():
        raise ValueError("SOURCE_CHANGED_BEFORE_UPLOAD")
    digest, size = file_digest(package)
    checksum = base64.b64encode(digest).decode()
    upload = call("s3api", "put-object", *options, "--key", key, "--body", str(package), "--server-side-encryption", "AES256",
                  "--checksum-algorithm", "SHA256", "--checksum-sha256", checksum, "--if-none-match", "*")
    if not upload.get("VersionId") or upload["VersionId"] == "null" or not upload.get("ETag") or upload.get("ChecksumSHA256") != checksum or upload.get("ServerSideEncryption") != "AES256":
        raise ValueError("REMOTE_UPLOAD_EVIDENCE_DIFFERS")
    atomic_json(folder / "uploaded.json", {"objectKey": key, "versionId": upload["VersionId"], "sha256": digest.hex(), "bytes": size})
    received = call("s3api", "get-object", *options, "--key", key, "--if-match", upload["ETag"], "--checksum-mode", "ENABLED", str(readback))
    readback.chmod(0o600)
    if (file_digest(readback) != (digest, size) or received.get("VersionId") != upload["VersionId"]
            or received.get("ChecksumSHA256") != checksum or received.get("ServerSideEncryption") != "AES256" or before != snapshot()):
        raise ValueError("REMOTE_READBACK_OR_SOURCE_DIFFERS")
    receipt = {"status": "BACKUP_VERIFIED", "backupId": backup_id, "createdAt": timestamp(now), "verifiedAt": timestamp(utcnow()),
               "objectKey": key, "versionId": upload["VersionId"], "bytes": size, "sha256": digest.hex(), "applicationSha": APPLICATION,
               "recipient": PIN, "signer": settings["signer"], "retentionDays": 30, "privateRecoveryKeyUsed": False}
    atomic_json(folder / "result.json", receipt)
    state.update({"lastSuccessAt": receipt["verifiedAt"], "lastAttemptStatus": "SUCCESS", "lastReceiptKey": key})
    atomic_json(ROOT / "state/state.json", state, replace=True)
    package.unlink()
    readback.unlink()
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["run", "health", "status"])
    args = parser.parse_args()
    try:
        if os.geteuid() != 0:
            raise ValueError("ROOT_BACKUP_SERVICE_REQUIRED")
        if args.mode == "run":
            lock = os.open(ROOT / "state/run.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
            with os.fdopen(lock, "r+") as stream:
                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
                report = backup()
            try:
                health()
                report["healthMetricPublished"] = True
            except (ValueError, OSError, subprocess.TimeoutExpired):
                report["healthMetricPublished"] = False
        else:
            report = health() if args.mode == "health" else status()
        print(json.dumps(report, sort_keys=True))
        return 0
    except (ValueError, OSError, KeyError, TypeError, AttributeError, subprocess.TimeoutExpired) as error:
        if args.mode == "run" and not isinstance(error, BlockingIOError):
            try:
                state = load_state()
                state.update({"lastAttemptAt": timestamp(utcnow()), "lastAttemptStatus": "FAILED"})
                atomic_json(ROOT / "state/state.json", state, replace=True)
                health()
            except Exception:
                pass
        print(json.dumps({"status": "BACKUP_SERVICE_FAILED", "reason": str(error) if isinstance(error, ValueError) else type(error).__name__}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
