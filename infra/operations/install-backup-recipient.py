#!/usr/bin/env python3
"""Install only the pinned PUBLIC recipient certificate; inspect host readiness."""

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import tempfile


PIN = "241abc0895734f656d4a5920ad074e008f56c405b0d5a144b0e823777293c84c"
KEY_ID = "orzell-recovery-241abc0895734f65"
ACCOUNT = "926642724499"
BUCKET = "beautyplatform-private-photos-dev"
IMAGE = "sha256:f13b300b0a0a236553b174b6453fc1d8ec3c06b1c912074401e625371464c99e"
ROOT = Path("/opt/epifiz/backup")


def run(arguments, data=None):
    process = subprocess.run(arguments, input=data, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                             timeout=25, env={**os.environ, "LC_ALL": "C", "AWS_PAGER": "", "AWS_MAX_ATTEMPTS": "1"})
    if process.returncode:
        raise ValueError("HOST_OPERATION_FAILED")
    return process.stdout


def validate(certificate, now=None):
    if not isinstance(certificate, str) or len(certificate) > 8192:
        raise ValueError("PUBLIC_CERTIFICATE_REQUIRED")
    if not re.fullmatch(r"-----BEGIN CERTIFICATE-----\n[A-Za-z0-9+/=\n]+-----END CERTIFICATE-----\n?", certificate):
        raise ValueError("PUBLIC_CERTIFICATE_REQUIRED")
    encoded = certificate.encode("ascii")
    der = run(["openssl", "x509", "-outform", "DER"], encoded)
    if hashlib.sha256(der).hexdigest() != PIN:
        raise ValueError("RECIPIENT_PIN_MISMATCH")
    detail = run(["openssl", "x509", "-text", "-noout"], encoded).decode("ascii")
    bits = re.search(r"Public-Key: \((\d+) bit\)", detail)
    if "Public Key Algorithm: rsaEncryption" not in detail or not bits or int(bits[1]) < 4096 or "Key Encipherment" not in detail:
        raise ValueError("RECIPIENT_USAGE_OR_STRENGTH")
    dates = run(["openssl", "x509", "-dates", "-noout"], encoded).decode("ascii").splitlines()
    parsed = {key: datetime.strptime(value, "%b %d %H:%M:%S %Y GMT").replace(tzinfo=timezone.utc)
              for key, value in (line.split("=", 1) for line in dates)}
    now = now or datetime.now(timezone.utc)
    if not parsed["notBefore"] <= now <= parsed["notAfter"]:
        raise ValueError("RECIPIENT_NOT_CURRENT")
    return encoded


def safe_directory(path, create=False):
    # Check every existing ancestor before a privileged mkdir or file publish.
    path = Path(path)
    for ancestor in reversed([path, *path.parents]):
        try:
            info = ancestor.lstat()
        except FileNotFoundError:
            if not create:
                raise
            ancestor.mkdir(mode=0o700)
            info = ancestor.lstat()
        if (not stat.S_ISDIR(info.st_mode) or info.st_uid not in (0, os.getuid())
                or info.st_mode & 0o022):
            raise ValueError("UNSAFE_DIRECTORY")
    return path


def install(certificate, root=ROOT):
    encoded = validate(certificate)
    directory = safe_directory(Path(root) / "trust", create=True)
    target = directory / (KEY_ID + ".crt")
    if os.path.lexists(target):
        fd = os.open(target, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, "rb") as source:
            info = os.fstat(source.fileno())
            if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid()
                    or info.st_mode & 0o077 or source.read(8193) != encoded):
                raise ValueError("EXISTING_RECIPIENT_DIFFERS")
        return "ALREADY_INSTALLED"
    fd, temporary = tempfile.mkstemp(prefix=".recipient-", dir=directory)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temporary, target, follow_symlinks=False)
        fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    finally:
        os.unlink(temporary)
    return "PUBLIC_RECIPIENT_INSTALLED"


def services(read=run):
    result = {}
    for name in ["api", "worker", "postgres"]:
        output = read(["docker", "inspect", "--format",
                       "{{.Id}}|{{.Image}}|{{.RestartCount}}|{{.State.StartedAt}}|{{.State.Running}}|{{.State.OOMKilled}}",
                       "beauty-preview-" + name + "-1"]).decode("ascii").strip().split("|")
        if len(output) != 6 or output[4:] != ["true", "false"] or (name != "postgres" and output[1] != IMAGE):
            raise ValueError("CURRENT_SERVICES_DIFFER")
        result[name] = output
    return result


def metadata(read=run):
    pg = read(["docker", "exec", "beauty-preview-postgres-1", "pg_dump", "--version"]).decode("ascii")
    pg_major = re.search(r"PostgreSQL\) (\d+)", pg)
    if not pg_major:
        raise ValueError("PG_DUMP_VERSION_UNVERIFIED")
    free = shutil.disk_usage("/opt/epifiz").free
    available = None
    for line in Path("/proc/meminfo").read_text().splitlines():
        if line.startswith("MemAvailable:"):
            available = int(line.split()[1]) * 1024
    report = {"pgDumpMajor": int(pg_major[1]), "freeDiskBytes": free,
              "availableMemoryBytes": available, "sealedFilesApi": hasattr(os, "memfd_create"),
              "awsCliPresent": shutil.which("aws") is not None,
              "pythonVersion": list(__import__("sys").version_info[:3])}
    if report["awsCliPresent"]:
        try:
            identity = json.loads(read(["aws", "sts", "get-caller-identity", "--output", "json", "--region", "eu-north-1"]))
            match = re.fullmatch(r"arn:aws:sts::" + ACCOUNT + r":assumed-role/([A-Za-z0-9+=,.@_-]{1,64})/[A-Za-z0-9+=,.@_-]+", identity.get("Arn", ""))
            if identity.get("Account") != ACCOUNT or not match:
                raise ValueError("RUNTIME_IDENTITY_DIFFERS")
            report["runtimeRoleName"] = match[1]
            version = json.loads(read(["aws", "s3api", "get-bucket-versioning", "--bucket", BUCKET,
                                       "--expected-bucket-owner", ACCOUNT, "--region", "eu-north-1", "--output", "json"]))
            report["existingPhotoBucketVersioning"] = version.get("Status", "Not enabled")
        except (ValueError, OSError, subprocess.TimeoutExpired):
            report["existingPhotoBucketVersioning"] = "UNKNOWN"
    return report


def main():
    if os.geteuid() != 0:
        raise ValueError("ROOT_OPERATION_REQUIRED")
    before = services()
    report = metadata()
    report["recipientStatus"] = install(globals().get("CERTIFICATE_PEM"))
    if before != services():
        raise ValueError("SERVICE_STATE_CHANGED")
    report.update({"keyId": KEY_ID, "recipientCertificateSha256": PIN,
                   "privateKeyTransferred": False, "backupStarted": False, "serviceStateUnchanged": True})
    print(json.dumps(report, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, TypeError, AttributeError, subprocess.TimeoutExpired):
        print('{"status":"RECIPIENT_INSTALLATION_FAILED"}')
        raise SystemExit(1)
