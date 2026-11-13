#!/usr/bin/env python3
"""Explicit owner-operated encrypted session; never accepts a private-file path."""
import argparse
import base64
from contextlib import ExitStack
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import selectors
import signal
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
OPS = Path(__file__).parent
BEGIN = "ORZELL-CAPSULE-V1"
END = "END-ORZELL-CAPSULE"
MAX_FRAME = 56000
BUNDLE_PINS = {
    ".github/operations/backup-recipient-20261105.pem": "fc893294cf4b7b1ce927ef86fa05b078b6f82804459da3161b072b884835f276",
    ".github/operations/backup-signing-public-20261105.pem": "39dd7914d95b708efe7d0478a5039a1a358b26d3aaf6d754b965cd5e42151745",
    ".github/operations/recovery-schema-reference-2e56def.json": "6ca4b7c1d0fe76939b2fa3b1f9f9700e55d92b7ba43e4dbefbc9423009f2d94c",
    ".github/operations/recovery-snapshot-20261112.json": "eb3c0c0e8853b0a0633b7b140f11ec6d8e9f1f36f5087060dfda4a9319158160",
    "infra/operations/backup-manifest.py": "2ad7d7c7634c9de033535a13483f5a899eda23fb1a3f87819a44ebed673f7a43",
    "infra/operations/encrypted-backup.py": "1753d75e1e8cac0f2ff6217d92eb3918465275f24b81b7cdffa1debe20e4b3f3",
    "infra/operations/inspect-recovery-package.py": "a16f61f06815e96f9742bab16345ca73872644efcb3e7ca5f39d23072ade7657",
    "infra/operations/quarantine-recovery-access.sql": "7561eb15c7fb86d332cb86a8e939d84411cf0220e50fed14fa206f58dd969727",
    "infra/operations/recover-backup-memory.py": "e53a2f6a838703721fb1a46a4539f080933155fdbbd9b2083e611989940375d0",
    "infra/operations/recover-backup-package.py": "2c6089efb7d1858aef7ea61b13d6040a6e28657da730501df807904e517af6fa",
    "infra/operations/recovery-catalog.sql": "1e7e22e98e3d370f1a5fe809f1248df6c142a5baa208e4456dc194f2f24f57be",
    "infra/operations/recovery-domain-check.sql": "785c2c28f9d6339266b7c674aea8fe647e2aaaeff5fd2f492f230facd0f28066",
    "infra/operations/recovery-key-handoff.py": "6dc4e43a1b05bb1d5e838e1831e90dbc650f1bd8acda857f6abbd0702d3fc763",
    "infra/operations/recovery-quarantine-check.sql": "0783d6d1ea5d34253b9971f652474f85b4319f11451a3359b4d35b70e06944de",
    "infra/operations/restore-backup-isolated.py": "356e19bd5058b2fe4bc15caf284b75ccc20533616eaaec0d8ae1f27c7b6d1e0e",
    "infra/operations/restore-protected-handoff.py": "938d08ff1ef8bb5d71d121e3f9e62de455becf651e5ded445408fd50e43154b5",
    "infra/operations/verified-backup.py": "7dfda5a588650a209ebe2705fd71bdb455f7ffe1917f4e1230a2559e52245c94"
}  # Exact public runtime source installed by PR137.


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, OPS / filename)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def decode_frame(raw):
    if type(raw) is not bytes or not 0 < len(raw) <= MAX_FRAME:
        raise ValueError("CAPSULE_FRAME_LIMIT")
    try:
        lines = raw.decode("ascii").splitlines()
        if len(lines) < 3 or lines[0] != BEGIN or lines[-1] != END:
            raise ValueError()
        if any(not re.fullmatch(r"[A-Za-z0-9+/=]{1,256}", line) for line in lines[1:-1]):
            raise ValueError()
        encoded = "".join(lines[1:-1])
        value = base64.b64decode(encoded, validate=True)
        if base64.b64encode(value).decode() != encoded or not 0 < len(value) <= 40000:
            raise ValueError()
        return value
    except (UnicodeError, ValueError):
        raise ValueError("CANONICAL_ENCRYPTED_CAPSULE_FRAME_REQUIRED") from None


def read_frame(deadline, descriptor=0):
    raw = bytearray()
    with selectors.DefaultSelector() as selector:
        selector.register(descriptor, selectors.EVENT_READ)
        while len(raw) <= MAX_FRAME:
            remaining = deadline - time.monotonic()
            if remaining <= 0 or not selector.select(remaining):
                raise ValueError("HANDOFF_INPUT_EXPIRED")
            block = os.read(descriptor, min(1024, MAX_FRAME-len(raw)+1))
            if not block:
                raise ValueError("HANDOFF_INPUT_CLOSED")
            raw.extend(block)
            if len(raw) > MAX_FRAME:
                raise ValueError("CAPSULE_FRAME_LIMIT")
            # One encrypted frame; no private text, filenames or shell commands.
            if raw.endswith(("\n"+END+"\n").encode()) or raw.endswith(("\r\n"+END+"\r\n").encode()):
                return decode_frame(bytes(raw))
    raise ValueError("CAPSULE_FRAME_LIMIT")


def emit(value):
    print(json.dumps(value, sort_keys=True), flush=True)


def receipt_output(receipt_id):
    if not re.fullmatch(r"[0-9a-f]{32}", receipt_id or ""):
        raise ValueError("VALID_RESULT_RECEIPT_ID_REQUIRED")

    def output(value):
        # Bind only terminal outcomes to this CloudShell attempt. No key, capsule,
        # challenge or content is added to the local saved-result channel.
        if value.get("status") in ("OWNER_SNAPSHOT_RESTORED_TO_ISOLATED_DATABASE",
                                   "OWNER_RECOVERY_SESSION_STOPPED", "RECOVERY_SESSION_REJECTED"):
            value = dict(value, resultReceiptId=receipt_id)
        emit(value)
    return output


def drive_session(bridge, handoff, package, public_key, *, package_bytes, context,
                  output=emit, reader=read_frame):
    started = time.monotonic()
    drill_at = datetime.now(timezone.utc)
    attempted = False
    try:
        output({"status": "WAITING_FOR_ENCRYPTED_CAPSULE", "challengeBase64": base64.b64encode(handoff.challenge).decode(),
                "challengeSha256": handoff.challenge_sha256, "expiresAt": json.loads(handoff.challenge)["expiresAt"],
                "backupId": context["backupId"], "realRecoveryReady": False})
        capsule = reader(handoff._deadline)
        attempted = True
        report = bridge.restore_protected(handoff, capsule, package, public_key,
            max_package_bytes=package_bytes, max_cipher_bytes=package_bytes,
            max_plaintext_bytes=bridge.RESTORE.MAX_DUMP, decrypt_timeout_seconds=30,
            restore_timeout_seconds=180, acknowledge_invalidation=True)
        snapshot_at = datetime.strptime(context["backupCreatedNotAfter"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        report.update(status="OWNER_SNAPSHOT_RESTORED_TO_ISOLATED_DATABASE",
            actualBackupRestoredToIsolatedDatabase=context["snapshotBoundary"] == "LIVE_DAILY_SNAPSHOT",
            drillStartedAt=drill_at.isoformat(), backupSnapshotAt=context["backupCreatedNotAfter"],
            observedSnapshotAgeAtDrillSeconds=round((drill_at-snapshot_at).total_seconds(), 3),
            handoffAndRestoreDrillSeconds=round(time.monotonic()-started, 3),
            privateKeyRead=True, productionDataRead=context["snapshotBoundary"] == "LIVE_DAILY_SNAPSHOT",
            productionRestoreVerified=False, reopenAuthorized=False, realRecoveryReady=False)
        output(report)
        return report
    except BaseException:
        output({"status": "OWNER_RECOVERY_SESSION_STOPPED", "capsuleSubmitted": attempted,
                "privateMaterialMayHaveBeenProcessed": attempted, "realRecoveryReady": False})
        raise
    finally:
        handoff.close()


def host_guard():
    if os.geteuid() != 0:
        raise ValueError("DEDICATED_ROOT_RECOVERY_SESSION_REQUIRED")
    if time.clock_gettime(time.CLOCK_BOOTTIME) > 6000:
        raise ValueError("HOST_EXPIRY_TOO_CLOSE_NO_EXTENSION")
    forbidden = ("AWS_", "OPENAI_", "DATABASE_URL", "PGPASSWORD", "PGSERVICE", "PGHOST", "PGPORT")
    if any(name.startswith(forbidden) for name in os.environ):
        raise ValueError("CREDENTIAL_FREE_RECOVERY_ENVIRONMENT_REQUIRED")
    for name, digest in BUNDLE_PINS.items():
        path = ROOT / name
        if path.is_symlink() or not path.is_file() or path.stat().st_size > 262144:
            raise ValueError("PINNED_PUBLIC_RUNTIME_REQUIRED")
        if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise ValueError("PINNED_PUBLIC_RUNTIME_REQUIRED")


def run_owner(package, *, output=emit):
    host_guard()
    bridge = module("owner_session_bridge", "restore-protected-handoff.py")
    bridge.HANDOFF.MEMORY.host_checks()
    # Exercise the installed crypto provider before accepting owner material.
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding, rsa
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    probe = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    pad = padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=b"generated-provider-probe")
    if probe.decrypt(probe.public_key().encrypt(b"generated", pad), pad) != b"generated":
        raise ValueError("CRYPTO_PROVIDER_PROBE_FAILED")
    aes = AESGCM(os.urandom(32))
    nonce = os.urandom(12)
    if aes.decrypt(nonce, aes.encrypt(nonce, b"generated", b"probe"), b"probe") != b"generated":
        raise ValueError("CRYPTO_PROVIDER_PROBE_FAILED")
    del probe, aes
    inspect = module("owner_package_inspector", "inspect-recovery-package.py")
    metadata = ROOT / ".github/operations"
    binding = json.loads((metadata / "recovery-snapshot-20261112.json").read_text())
    reference = json.loads((metadata / "recovery-schema-reference-2e56def.json").read_text())
    public = metadata / "backup-signing-public-20261105.pem"
    cert = metadata / "backup-recipient-20261105.pem"
    with ExitStack() as stack:
        source = stack.enter_context(inspect.FILES.regular_file(package))
        if os.fstat(source.fileno()).st_size != binding["packageBytes"]:
            raise ValueError("PACKAGE_RECEIPT_SIZE_MISMATCH")
        sealed = inspect.VERIFIED.snapshot_stream(stack, source, max_bytes=binding["packageBytes"])
        authenticated = inspect.inspect_package(sealed, public, cert, binding, reference)
        # Independent approved full-package SHA256 + signer binds this exact
        # manifest/cipher context; the capsule cannot choose its own backup.
        context = authenticated["context"]
        with bridge.HANDOFF.KeyHandoff(context, cert.read_bytes()) as handoff:
            return drive_session(bridge, handoff, sealed, public,
                                 package_bytes=binding["packageBytes"], context=context, output=output)


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise ValueError("UNSUPPORTED_RECOVERY_SESSION_ARGUMENTS")


def main():
    output = emit
    try:
        parser = Parser(description=__doc__)
        parser.add_argument("--start-isolated-session", action="store_true")
        parser.add_argument("--encrypted-package")
        parser.add_argument("--acknowledge-access-invalidation", action="store_true")
        parser.add_argument("--result-receipt-id")
        args = parser.parse_args()
        if not any(vars(args).values()):
            emit({"status": "OFFLINE_NO_ACTION", "privateKeyRead": False, "productionDataRead": False})
            return 0
        if not (args.start_isolated_session and args.encrypted_package and args.acknowledge_access_invalidation):
            raise ValueError("EXPLICIT_ISOLATED_SESSION_ACKNOWLEDGEMENT_REQUIRED")
        output = receipt_output(args.result_receipt_id)
        def interrupted(*_):
            raise KeyboardInterrupt()
        signal.signal(signal.SIGTERM, interrupted)
        run_owner(args.encrypted_package, output=output)
        return 0
    except (Exception, KeyboardInterrupt) as exc:
        reason = str(exc) if isinstance(exc, ValueError) and re.fullmatch(r"[A-Z_]{1,100}", str(exc)) else "RECOVERY_SESSION_FAILED"
        output({"status": "RECOVERY_SESSION_REJECTED", "reason": reason, "realRecoveryReady": False})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
