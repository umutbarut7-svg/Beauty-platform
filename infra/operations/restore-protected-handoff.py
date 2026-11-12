#!/usr/bin/env python3
"""Library bridge: protected encrypted handoff to disposable offline restore.

No live intake, private-file CLI, host provisioning or reopening authorization.
The caller still owns authenticating the host, context, client and challenge pin.
"""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import time


ROOT = Path(__file__).parent


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


HANDOFF = module("protected_restore_handoff", "recovery-key-handoff.py")
RESTORE = module("protected_restore_controller", "restore-backup-isolated.py")


def restore_protected(handoff, envelope, package, public_key, *, max_package_bytes,
                      max_cipher_bytes, max_plaintext_bytes, decrypt_timeout_seconds,
                      restore_timeout_seconds, acknowledge_invalidation=False):
    """Consume one caller-owned session; close it on every return or exception.

    The real signed package is checked before key unwrap. Only a sealed dump FD
    crosses into the existing restore controller. No private key/password is
    passed to Docker or returned to the caller. Schema is bound to the independently
    approved handoff context, never learned from the recovered target.
    """
    if type(handoff) is not HANDOFF.KeyHandoff:
        raise ValueError("PROTECTED_HANDOFF_SESSION_REQUIRED")
    try:
        if acknowledge_invalidation is not True:
            raise ValueError("OFFLINE_ACCESS_INVALIDATION_ACKNOWLEDGEMENT_REQUIRED")
        if type(envelope) is not bytes or not 0 < len(envelope) <= HANDOFF.MAX_ENVELOPE:
            raise ValueError("HANDOFF_INPUT_LIMIT")
        if type(restore_timeout_seconds) is not int or not 1 <= restore_timeout_seconds <= 300:
            raise ValueError("INVALID_RESTORE_DEADLINE")
        HANDOFF.MEMORY.limits(max_package_bytes, max_cipher_bytes, max_plaintext_bytes, decrypt_timeout_seconds)
        if max_package_bytes > 16 * 1024 * 1024 or max_plaintext_bytes > RESTORE.MAX_DUMP:
            raise ValueError("HANDOFF_PACKAGE_MEMORY_LIMIT")
        started = time.monotonic()
        with handoff.verified_dump(envelope, package, public_key,
                max_package_bytes=max_package_bytes, max_cipher_bytes=max_cipher_bytes,
                max_plaintext_bytes=max_plaintext_bytes, decrypt_timeout_seconds=decrypt_timeout_seconds) as (descriptor, manifest, expected_schema):
            opened = time.monotonic()
            with tempfile.TemporaryDirectory(prefix="orzell-protected-restore-docker-") as config:
                report = RESTORE._restore_sealed_dump(RESTORE.Docker(config), descriptor, expected_schema, restore_timeout_seconds)
            report["sourceApplicationSha"] = manifest["applicationSha"]
        # Context exit closes the sealed key/password/dump descriptors first.
        report.update(protectedHandoffConsumed=True,
                      packageVerificationAndDecryptionSeconds=round(opened - started, 3),
                      controllerElapsedSeconds=round(time.monotonic() - started, 3),
                      productionRestoreVerified=False, realRecoveryReady=False,
                      reopenAuthorized=False)
        return report
    finally:
        handoff.close()


if __name__ == "__main__":
    print(json.dumps({"status": "OFFLINE_NO_ACTION", "privateKeyRead": False,
                      "productionDataRead": False, "productionRestoreVerified": False,
                      "realRecoveryReady": False}))
    raise SystemExit(0 if len(sys.argv) == 1 else 2)
