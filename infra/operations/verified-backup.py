#!/usr/bin/env python3
"""Offline verified decryption using sealed Linux file descriptors.

Does not restore a database or authorize reopening a recovered system.
"""

from contextlib import ExitStack
import argparse
import fcntl
import json
import sys
import importlib.util
import os
from pathlib import Path


SPEC = importlib.util.spec_from_file_location("backup_manifest", Path(__file__).with_name("backup-manifest.py"))
MANIFEST = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MANIFEST)


def snapshot_stream(stack, source, max_bytes=None):
    """Copy a stream with an optional enforced byte cap, then seal it."""
    if max_bytes is not None and (type(max_bytes) is not int or max_bytes <= 0):
        raise ValueError("INVALID_SNAPSHOT_LIMIT")
    descriptor = os.memfd_create("orzell-backup-input", os.MFD_CLOEXEC | os.MFD_ALLOW_SEALING)
    stream = stack.enter_context(os.fdopen(descriptor, "w+b", buffering=0))
    os.fchmod(descriptor, 0o600)
    total = 0
    while True:
        data = source.read(1024 * 1024 if max_bytes is None else min(1024 * 1024, max_bytes - total + 1))
        if not data:
            break
        total += len(data)
        if max_bytes is not None and total > max_bytes:
            raise ValueError("SNAPSHOT_SIZE_LIMIT")
        view = memoryview(data)
        while view:
            count = stream.write(view)
            if not count:
                raise OSError("SNAPSHOT_WRITE_FAILED")
            view = view[count:]
    if sys.platform != "linux":
        raise ValueError("LINUX_SEALED_FILES_REQUIRED")
    # Stable Linux UAPI values, also for Python builds omitting these names.
    fcntl.fcntl(descriptor, 1033, 0x0008 | 0x0004 | 0x0002 | 0x0001)
    stream.seek(0)
    return descriptor


def snapshot(stack, path, private=False, max_bytes=None):
    """Copy once, then prohibit writes, growth and truncation at kernel level."""
    with MANIFEST.FILES.regular_file(path, private=private) as source:
        return snapshot_stream(stack, source, max_bytes)


def decrypt(ciphertext, manifest_path, public_key, certificate, private_key, output,
            expected_signer, expected_recipient, backup_id, application_sha,
            boundary, not_before, not_after, passphrase=None, now=None):
    # Every consumed input is detached from its original pathname before any
    # trust decision. The exact sealed ciphertext verified is then decrypted.
    with ExitStack() as stack:
        cipher = snapshot(stack, ciphertext)
        metadata = snapshot(stack, manifest_path)
        public = snapshot(stack, public_key)
        cert = snapshot(stack, certificate)
        key = snapshot(stack, private_key, private=True)
        password = snapshot(stack, passphrase, private=True) if passphrase is not None else None
        verified = MANIFEST.verify(cipher, metadata, public, expected_signer, expected_recipient,
                                   backup_id, application_sha, boundary, not_before, not_after, now=now)
        if MANIFEST.fingerprint(cert, certificate=True) != expected_recipient:
            raise ValueError("UNTRUSTED_RECIPIENT_CERTIFICATE")
        MANIFEST.FILES.transform("decrypt", cipher, output, cert, key, password)
        return verified


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    fields = {"input": "ciphertext", "manifest": "manifest_path", "public-key": "public_key",
              "certificate": "certificate", "private-key": "private_key", "output": "output",
              "expected-signer-sha256": "expected_signer", "expected-recipient-sha256": "expected_recipient",
              "backup-id": "backup_id", "application-sha": "application_sha", "snapshot-boundary": "boundary",
              "created-not-before": "not_before", "created-not-after": "not_after"}
    for flag, destination in fields.items():
        parser.add_argument("--" + flag, dest=destination, required=True)
    parser.add_argument("--passphrase-file", dest="passphrase")
    args = parser.parse_args()
    try:
        decrypt(**vars(args))
    except (ValueError, OSError, RecursionError, AttributeError):
        print(json.dumps({"status": "FAILED"}))
        return 1
    print(json.dumps({"status": "VERIFIED_AND_DECRYPTED"}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
