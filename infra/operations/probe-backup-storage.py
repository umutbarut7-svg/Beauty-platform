#!/usr/bin/env python3
"""One encrypted diagnostic object only. Never reads the production database."""

import base64
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile


if "RECIPIENT" not in globals():
    SPEC = importlib.util.spec_from_file_location("recipient", Path(__file__).with_name("install-backup-recipient.py"))
    RECIPIENT = importlib.util.module_from_spec(SPEC)
    SPEC.loader.exec_module(RECIPIENT)

ACCOUNT = "926642724499"
REGION = "eu-north-1"
ROLE = "BeautyPlatformPreview-RuntimeRole-qJeq1ARIaXWh"
BUCKET = "orzell-backups-926642724499-eu-north-1"
OPERATION = "orzell-backup-storage-probe-20261105-1"
OBJECT = "encrypted/v1/diagnostics/" + OPERATION + ".cms"
ROOT = Path("/opt/epifiz/backup/operations") / OPERATION
CERTIFICATE = Path("/opt/epifiz/backup/trust") / (RECIPIENT.KEY_ID + ".crt")


def aws(service, operation, *arguments, denied=False):
    if (service, operation) not in {("sts", "get-caller-identity"), ("s3api", "get-bucket-versioning"),
                                   ("s3api", "get-public-access-block"), ("s3api", "put-object"),
                                   ("s3api", "get-object"), ("s3api", "delete-object")}:
        raise ValueError("PROBE_OPERATION_NOT_ALLOWED")
    result = subprocess.run(["aws", service, operation, *arguments, "--region", REGION,
                             "--output", "json", "--no-cli-pager", "--cli-connect-timeout", "5", "--cli-read-timeout", "20"],
                            capture_output=True, text=True, timeout=30,
                            env={**os.environ, "AWS_MAX_ATTEMPTS": "1", "AWS_PAGER": ""})
    if result.returncode:
        match = re.search(r"\(([A-Za-z0-9_.-]+)\)", result.stderr)
        code = match[1] if match else "Unavailable"
        if denied and code == "AccessDenied":
            return {"accessDenied": True}
        raise ValueError("AWS_PROBE_FAILED:" + operation + ":" + code)
    if denied:
        raise ValueError("DELETE_PROTECTION_FAILED")
    return json.loads(result.stdout)


def read_private(path, maximum):
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(descriptor, "rb") as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077 or info.st_size > maximum:
            raise ValueError("UNSAFE_PROBE_INPUT")
        value = stream.read(maximum + 1)
        if len(value) > maximum:
            raise ValueError("PROBE_INPUT_LIMIT")
        return value


def publish(path, content):
    descriptor, temporary = tempfile.mkstemp(prefix=".probe-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temporary, path, follow_symlinks=False)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        os.unlink(temporary)


def encrypt_probe(certificate):
    descriptor = os.memfd_create("orzell-public-probe-recipient", os.MFD_CLOEXEC | os.MFD_ALLOW_SEALING)
    try:
        with os.fdopen(os.dup(descriptor), "wb") as stream:
            stream.write(certificate)
        fcntl.fcntl(descriptor, 1033, 0x0008 | 0x0004 | 0x0002 | 0x0001)
        os.lseek(descriptor, 0, os.SEEK_SET)
        result = subprocess.run(["openssl", "cms", "-encrypt", "-binary", "-aes-256-gcm", "-outform", "DER", "-stream",
                                 "-recip", "/proc/self/fd/" + str(descriptor), "-keyopt", "rsa_padding_mode:oaep",
                                 "-keyopt", "rsa_oaep_md:sha256"],
                                input=b"ORZELL SYNTHETIC STORAGE PROBE ONLY\n" + os.urandom(256),
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=20, pass_fds=[descriptor])
        if result.returncode or not 100 < len(result.stdout) < 8192:
            raise ValueError("PROBE_ENCRYPTION_FAILED")
        return result.stdout
    finally:
        os.close(descriptor)


def probe(root=ROOT, certificate_path=CERTIFICATE, call=aws, service_snapshot=None):
    root = Path(root)
    if os.path.lexists(root / "started.json"):
        raise ValueError("PRIOR_PROBE_REQUIRES_INSPECTION_NO_RETRY")
    snapshots = service_snapshot or RECIPIENT.services
    before = snapshots()
    identity = call("sts", "get-caller-identity")
    if identity.get("Account") != ACCOUNT or not identity.get("Arn", "").startswith("arn:aws:sts::" + ACCOUNT + ":assumed-role/" + ROLE + "/"):
        raise ValueError("RUNTIME_IDENTITY_DIFFERS")
    options = ["--bucket", BUCKET, "--expected-bucket-owner", ACCOUNT]
    if call("s3api", "get-bucket-versioning", *options).get("Status") != "Enabled":
        raise ValueError("VERSIONING_NOT_ENABLED")
    blocks = call("s3api", "get-public-access-block", *options).get("PublicAccessBlockConfiguration", {})
    if not all(blocks.get(key) is True for key in ["BlockPublicAcls", "IgnorePublicAcls", "BlockPublicPolicy", "RestrictPublicBuckets"]):
        raise ValueError("PUBLIC_BLOCKS_DIFFER")
    skeleton = call("s3api", "put-object", "--generate-cli-skeleton", "input")
    if not {"IfNoneMatch", "ChecksumSHA256"}.issubset(skeleton):
        raise ValueError("CLI_CONDITIONAL_CHECKSUM_SUPPORT_REQUIRED")
    certificate = read_private(certificate_path, 8192)
    RECIPIENT.validate(certificate.decode("ascii"))
    RECIPIENT.safe_directory(root, create=True)
    encrypted = encrypt_probe(certificate)
    digest = hashlib.sha256(encrypted).digest()
    checksum = base64.b64encode(digest).decode("ascii")
    cipher = root / "probe.cms"
    publish(cipher, encrypted)
    publish(root / "started.json", json.dumps({"operation": OPERATION, "object": OBJECT, "sha256": digest.hex()}).encode())
    # One deterministic create-only upload. Any ambiguous failure leaves the
    # durable marker; rerunning cannot silently emit another object/version.
    uploaded = call("s3api", "put-object", *options, "--key", OBJECT, "--body", str(cipher),
                    "--server-side-encryption", "AES256", "--checksum-algorithm", "SHA256",
                    "--checksum-sha256", checksum, "--if-none-match", "*")
    version, etag = uploaded.get("VersionId"), uploaded.get("ETag")
    if not version or version == "null" or not etag or uploaded.get("ChecksumSHA256") != checksum or uploaded.get("ServerSideEncryption") != "AES256":
        raise ValueError("UPLOAD_EVIDENCE_DIFFERS")
    publish(root / "uploaded.json", json.dumps({"versionId": version, "etag": etag, "sha256": digest.hex()}).encode())
    download = root / "readback.cms"
    # Latest-version GET uses GetObject (the role intentionally has no
    # GetObjectVersion). Bind both ETag and returned version plus SHA-256.
    received = call("s3api", "get-object", *options, "--key", OBJECT, "--if-match", etag,
                    "--checksum-mode", "ENABLED", str(download))
    download.chmod(0o600)
    readback = read_private(download, 8192)
    if (hashlib.sha256(readback).digest() != digest or received.get("ChecksumSHA256") != checksum
            or received.get("VersionId") != version or received.get("ServerSideEncryption") != "AES256"):
        raise ValueError("READBACK_EVIDENCE_DIFFERS")
    for extra in [[], ["--version-id", version]]:
        denied = call("s3api", "delete-object", *options, "--key", OBJECT, *extra, denied=True)
        if denied != {"accessDenied": True}:
            raise ValueError("DELETE_PROTECTION_UNVERIFIED")
    if before != snapshots():
        raise ValueError("SERVICES_CHANGED")
    report = {"status": "STORAGE_PROBE_COMPLETE", "operation": OPERATION, "objectKey": OBJECT,
              "versionId": version, "cipherSha256": digest.hex(), "cipherBytes": len(encrypted),
              "recipientCertificateSha256": RECIPIENT.PIN, "versioning": "Enabled", "allPublicBlocks": True,
              "sse": "AES256", "readBackHashMatch": True, "deleteDenied": True, "deleteVersionDenied": True,
              "serviceStateUnchanged": True, "productionBackupCreated": False, "privateKeyUsed": False}
    publish(root / "result.json", json.dumps(report, sort_keys=True).encode())
    return report


if __name__ == "__main__":
    try:
        if os.geteuid() != 0:
            raise ValueError("ROOT_PROBE_REQUIRED")
        print(json.dumps(probe(), sort_keys=True))
    except (ValueError, OSError, TypeError, KeyError, AttributeError, subprocess.TimeoutExpired) as error:
        print(json.dumps({"status": "STORAGE_PROBE_FAILED", "reason": str(error) if isinstance(error, ValueError) else type(error).__name__}))
        raise SystemExit(1)
