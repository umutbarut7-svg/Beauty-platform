#!/usr/bin/env python3
"""Install reviewed backup tools and disabled units; never starts a backup."""

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import tempfile
import urllib.request


ROOT = Path("/opt/epifiz/backup")
UNITS = Path("/etc/systemd/system")
PIN = "241abc0895734f656d4a5920ad074e008f56c405b0d5a144b0e823777293c84c"
APPLICATION = "2e56def282c97a804a2f3d6c9b36a53b42a09df5"
IMAGE = "sha256:f13b300b0a0a236553b174b6453fc1d8ec3c06b1c912074401e625371464c99e"
FILES = {"managed-database-backup.py", "produce-backup.py", "verified-backup.py", "backup-manifest.py", "encrypted-backup.py"}


def run(args):
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=45)
    if result.returncode:
        raise ValueError("MANAGED_INSTALL_COMMAND_FAILED")
    return result.stdout


def directory(path, private=True):
    path = Path(path)
    for ancestor in reversed([path, *path.parents]):
        try:
            info = ancestor.lstat()
        except FileNotFoundError:
            ancestor.mkdir(mode=0o700)
            info = ancestor.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid not in (0, os.getuid()) or info.st_mode & 0o022:
            raise ValueError("UNSAFE_INSTALL_DIRECTORY")
    if path.stat().st_uid != os.getuid() or (private and path.stat().st_mode & 0o077):
        raise ValueError("PRIVATE_INSTALL_DIRECTORY_REQUIRED")
    return path


def existing(path, maximum=32768, private=True):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or (private and info.st_mode & 0o077) or info.st_size > maximum:
            raise ValueError("UNSAFE_EXISTING_INSTALL_FILE")
        data = source.read(maximum + 1)
        if len(data) > maximum:
            raise ValueError("INSTALL_FILE_LIMIT")
        return data


def publish(path, data, mode=0o600):
    if os.path.lexists(path):
        if existing(path, private=mode == 0o600) != data:
            raise ValueError("EXISTING_INSTALLATION_DIFFERS")
        return
    fd, temporary = tempfile.mkstemp(prefix=".install-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), mode)
        os.link(temporary, path, follow_symlinks=False)
        descriptor = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    finally:
        os.unlink(temporary)


def units(release, root=ROOT):
    base = f"""[Unit]
After=network-online.target docker.service
Wants=network-online.target
[Service]
Type=oneshot
User=root
UMask=0077
Environment=AWS_PAGER= AWS_MAX_ATTEMPTS=1 PYTHONDONTWRITEBYTECODE=1
ExecStart=/usr/bin/python3 {release}/managed-database-backup.py MODE
TimeoutStartSec=660
KillMode=control-group
Nice=10
MemoryMax=384M
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths={root}/runs {root}/state
NoNewPrivileges=true
"""
    return {
        "orzell-database-backup.service": base.replace("MODE", "run"),
        "orzell-backup-health.service": base.replace("MODE", "health"),
        "orzell-database-backup.timer": """[Unit]
Description=ORZELL daily encrypted backup at 03:00 Europe/Istanbul
[Timer]
OnCalendar=*-*-* 00:00:00 UTC
Persistent=true
AccuracySec=1min
Unit=orzell-database-backup.service
[Install]
WantedBy=timers.target
""",
        "orzell-backup-health.timer": """[Unit]
Description=ORZELL hourly backup health metric
[Timer]
OnBootSec=5min
OnUnitActiveSec=1h
AccuracySec=1min
Unit=orzell-backup-health.service
[Install]
WantedBy=timers.target
""",
    }


def source_download(url):
    with urllib.request.urlopen(url, timeout=20) as response:
        return response.read(40001)


def services(execute):
    values = {}
    for name in ["api", "worker", "postgres"]:
        parts = execute(["docker", "inspect", "--format", "{{.Id}}|{{.Image}}|{{.RestartCount}}|{{.State.StartedAt}}|{{.State.Running}}|{{.State.OOMKilled}}",
                         "beauty-preview-" + name + "-1"]).decode().strip().split("|")
        if len(parts) != 6 or parts[4:] != ["true", "false"] or (name != "postgres" and parts[1] != IMAGE):
            raise ValueError("APPLICATION_RELEASE_DIFFERS")
        values[name] = parts
    return values


def install(manifest, root=ROOT, unit_root=UNITS, fetch=source_download, execute=run):
    if set(manifest) != {"source", "files"} or not re.fullmatch(r"[0-9a-f]{40}", manifest["source"]) or set(manifest["files"]) != FILES:
        raise ValueError("REVIEWED_SOURCE_MANIFEST_REQUIRED")
    root, unit_root = Path(root), Path(unit_root)
    before = services(execute)
    directory(unit_root, private=False)
    certificate = existing(root / "trust/orzell-recovery-241abc0895734f65.crt", 8192)
    with tempfile.NamedTemporaryFile() as public:
        public.write(certificate)
        public.flush()
        der = execute(["openssl", "x509", "-in", public.name, "-outform", "DER"])
    if hashlib.sha256(der).hexdigest() != PIN:
        raise ValueError("INSTALLED_RECIPIENT_PIN_DIFFERS")
    # No service may already be active/enabled under these new names. Existing
    # unit files must be identical; unknown installations are never overwritten.
    for name in ["orzell-database-backup.timer", "orzell-backup-health.timer"]:
        query = subprocess.run(["systemctl", "is-enabled", name], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=10)
        if query.stdout.strip() not in (b"", b"disabled", b"not-found"):
            raise ValueError("EXISTING_TIMER_REQUIRES_REVIEW")
        active = subprocess.run(["systemctl", "is-active", name], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=10)
        if active.stdout.strip() not in (b"", b"inactive", b"unknown"):
            raise ValueError("EXISTING_ACTIVE_TIMER_REQUIRES_REVIEW")
    releases = directory(root / "releases")
    release = releases / manifest["source"]
    if os.path.lexists(release):
        directory(release)
        for name, digest in manifest["files"].items():
            if hashlib.sha256(existing(release / name, 40000)).hexdigest() != digest:
                raise ValueError("EXISTING_RELEASE_DIFFERS")
    else:
        stage = Path(tempfile.mkdtemp(prefix=".release-", dir=releases))
        try:
            for name, digest in manifest["files"].items():
                if not re.fullmatch(r"[0-9a-f]{64}", digest):
                    raise ValueError("INVALID_SOURCE_DIGEST")
                url = "https://raw.githubusercontent.com/umutbarut7-svg/Beauty-platform/" + manifest["source"] + "/infra/operations/" + name
                data = fetch(url)
                if len(data) > 40000 or hashlib.sha256(data).hexdigest() != digest:
                    raise ValueError("REVIEWED_TOOL_BYTES_DIFFER")
                compile(data, name, "exec")
                publish(stage / name, data)
            os.rename(stage, release)
        finally:
            if stage.exists():
                shutil.rmtree(stage)
    signing = directory(root / "signing")
    key, public = signing / "signer.key", signing / "signer.pub"
    if os.path.lexists(key) != os.path.lexists(public):
        raise ValueError("PARTIAL_SIGNER_REQUIRES_REVIEW")
    if not key.exists():
        with tempfile.TemporaryDirectory(prefix=".signer-", dir=signing) as temporary:
            temp_key, temp_pub = Path(temporary) / "signer.key", Path(temporary) / "signer.pub"
            execute(["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:3072", "-out", str(temp_key)])
            temp_key.chmod(0o600)
            execute(["openssl", "pkey", "-in", str(temp_key), "-pubout", "-out", str(temp_pub)])
            temp_pub.chmod(0o600)
            publish(key, temp_key.read_bytes())
            publish(public, temp_pub.read_bytes())
    existing(key, 8192)
    public_bytes = existing(public, 8192)
    from_private = execute(["openssl", "pkey", "-in", str(key), "-pubout", "-outform", "DER"])
    from_public = execute(["openssl", "pkey", "-pubin", "-in", str(public), "-outform", "DER"])
    if from_private != from_public:
        raise ValueError("SIGNER_KEYPAIR_DIFFERS")
    signer = hashlib.sha256(from_public).hexdigest()
    settings = {"version": 1, "recipient": PIN, "signer": signer, "application": APPLICATION, "image": IMAGE, "release": manifest["source"]}
    publish(root / "managed-config.json", json.dumps(settings, sort_keys=True).encode())
    directory(root / "runs")
    directory(root / "state")
    definitions = units(release, root)
    for name, content in definitions.items():
        publish(unit_root / name, content.encode(), mode=0o644)
    execute(["systemd-analyze", "verify", *[str(unit_root / name) for name in definitions]])
    execute(["systemctl", "daemon-reload"])
    if before != services(execute):
        raise ValueError("APPLICATION_SERVICES_CHANGED")
    return {"status": "MANAGED_BACKUP_PREPARED_DISABLED", "release": manifest["source"], "signerPublicSha256": signer,
            "signerPublicPem": public_bytes.decode("ascii"), "recipientCertificateSha256": PIN,
            "dailyIstanbulTime": "03:00", "retentionDays": 30, "timersEnabled": False, "databaseBackupStarted": False,
            "applicationServicesUnchanged": True}


if __name__ == "__main__":
    try:
        if os.geteuid() != 0:
            raise ValueError("ROOT_INSTALLATION_REQUIRED")
        print(json.dumps(install(globals().get("SOURCE_MANIFEST")), sort_keys=True))
    except (ValueError, OSError, TypeError, AttributeError, subprocess.TimeoutExpired) as error:
        print(json.dumps({"status": "MANAGED_INSTALL_FAILED", "reason": str(error) if isinstance(error, ValueError) else type(error).__name__}))
        raise SystemExit(1)
