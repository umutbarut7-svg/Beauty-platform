#!/usr/bin/env python3
"""Library-only, bounded authenticated decryption into a sealed Linux memfd.

No upload receiver, database restore, host approval or production activation.
"""

from contextlib import ExitStack, contextmanager
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import re
import resource
import selectors
import signal
import subprocess
import sys
import time


SPEC = importlib.util.spec_from_file_location("recovery_package", Path(__file__).with_name("recover-backup-package.py"))
PACKAGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PACKAGE)
VERIFIED = PACKAGE.VERIFIED
MANIFEST = VERIFIED.MANIFEST
FILES = MANIFEST.FILES
MAX_PLAINTEXT = 256 * 1024 * 1024
MAX_DECRYPT_SECONDS = 120
SEALS = 0x0001 | 0x0002 | 0x0004 | 0x0008


def limits(max_package_bytes, max_cipher_bytes, max_plaintext_bytes, decrypt_timeout_seconds):
    for value in (max_package_bytes, max_cipher_bytes):
        if type(value) is not int or not 0 < value <= PACKAGE.HARD_PACKAGE_LIMIT:
            raise ValueError("INVALID_PACKAGE_LIMIT")
    if max_cipher_bytes > max_package_bytes:
        raise ValueError("INVALID_PACKAGE_LIMIT")
    if type(max_plaintext_bytes) is not int or not 0 < max_plaintext_bytes <= MAX_PLAINTEXT:
        raise ValueError("INVALID_PLAINTEXT_LIMIT")
    if type(decrypt_timeout_seconds) is not int or not 1 <= decrypt_timeout_seconds <= MAX_DECRYPT_SECONDS:
        raise ValueError("INVALID_DECRYPT_DEADLINE")


def host_checks():
    # Necessary conditions, not proof of host trust or protected phone handoff.
    if sys.platform != "linux":
        raise ValueError("LINUX_SEALED_FILES_REQUIRED")
    lines = Path("/proc/swaps").read_text().splitlines()
    if not lines or not lines[0].startswith("Filename") or len(lines) != 1:
        raise ValueError("ACTIVE_OR_UNKNOWN_SWAP")
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))


def decrypt_memory(cipher, cert, key, password, max_plaintext_bytes, timeout_seconds):
    """Never release the descriptor until OpenSSL has authenticated and exited."""
    descriptor = os.memfd_create("orzell-recovered-dump", os.MFD_CLOEXEC | os.MFD_ALLOW_SEALING)
    process = None
    try:
        os.fchmod(descriptor, 0o600)
        arguments = ["/usr/bin/openssl", "cms", "-decrypt", "-binary", "-inform", "DER",
                     "-recip", f"/proc/self/fd/{cert}", "-inkey", f"/proc/self/fd/{key}"]
        inherited = [cert, key]
        if password is not None:
            inherited.append(password)
            arguments += ["-passin", f"fd:{password}"]
        else:
            arguments += ["-passin", "pass:"]
        started = time.monotonic()
        with FILES.regular_file(cipher) as source:
            FILES.authenticated_envelope(source)
            process = subprocess.Popen(arguments, stdin=source, stdout=subprocess.PIPE,
                                       stderr=subprocess.DEVNULL, pass_fds=inherited,
                                       env={"PATH": "/usr/bin:/bin", "LANG": "C", "OPENSSL_CONF": "/dev/null"},
                                       start_new_session=True, close_fds=True)
            total = 0
            with process.stdout, selectors.DefaultSelector() as selector:
                os.set_blocking(process.stdout.fileno(), False)
                selector.register(process.stdout, selectors.EVENT_READ)
                while True:
                    remaining = timeout_seconds - (time.monotonic() - started)
                    if remaining <= 0 or not selector.select(remaining):
                        raise ValueError("DECRYPT_DEADLINE_EXCEEDED")
                    block = os.read(process.stdout.fileno(), min(65536, max_plaintext_bytes - total + 1))
                    if not block:
                        break
                    total += len(block)
                    if total > max_plaintext_bytes:
                        raise ValueError("PLAINTEXT_SIZE_LIMIT")
                    view = memoryview(block)
                    while view:
                        count = os.write(descriptor, view)
                        if not count:
                            raise OSError("PLAINTEXT_WRITE_FAILED")
                        view = view[count:]
            remaining = timeout_seconds - (time.monotonic() - started)
            if remaining <= 0:
                raise ValueError("DECRYPT_DEADLINE_EXCEEDED")
            try:
                status = process.wait(timeout=remaining)
            except subprocess.TimeoutExpired:
                raise ValueError("DECRYPT_DEADLINE_EXCEEDED") from None
            if status != 0 or total == 0:
                raise ValueError("BACKUP_AUTHENTICATION_OR_TRANSFORM_FAILED")
        fcntl.fcntl(descriptor, 1033, SEALS)
        if fcntl.fcntl(descriptor, 1034) != SEALS:
            raise ValueError("SEALED_PLAINTEXT_NOT_VERIFIED")
        os.lseek(descriptor, 0, os.SEEK_SET)
        result, descriptor = descriptor, None
        return result
    finally:
        try:
            if process is not None and process.poll() is None:
                # The child has a private process group; never target the caller.
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                process.wait(timeout=5)
        finally:
            if descriptor is not None:
                os.close(descriptor)


@contextmanager
def verified_dump(package, public_key, certificate, private_key, expected_signer,
                  expected_recipient, backup_id, application_sha, boundary,
                  not_before, not_after, max_package_bytes, max_cipher_bytes,
                  max_plaintext_bytes, decrypt_timeout_seconds, passphrase=None, now=None):
    """Yield (sealed_fd, verified_manifest); fd closes on context exit.

    Expected context must be independently bound, never read from the package.
    Caller must keep keys on an approved host; this API does not approve intake.
    The decryption deadline excludes bounded input copying/signature validation.
    """
    limits(max_package_bytes, max_cipher_bytes, max_plaintext_bytes, decrypt_timeout_seconds)
    host_checks()
    with ExitStack() as stack:
        sealed_package = VERIFIED.snapshot(stack, package, max_bytes=max_package_bytes)
        incoming = stack.enter_context(FILES.regular_file(sealed_package))
        archive = stack.enter_context(PACKAGE.members(incoming, max_cipher_bytes))
        entries = {}
        for name, cap in (("backup.cms", max_cipher_bytes), ("manifest.json", PACKAGE.MAX_MANIFEST)):
            with archive.open(name) as source:
                entries[name] = VERIFIED.snapshot_stream(stack, source, max_bytes=cap)
        public = VERIFIED.snapshot(stack, public_key, max_bytes=PACKAGE.MAX_KEY)
        # Reject invalid trust/context/ciphertext BEFORE opening the private key.
        manifest = MANIFEST.verify(entries["backup.cms"], entries["manifest.json"], public,
                                   expected_signer, expected_recipient, backup_id, application_sha,
                                   boundary, not_before, not_after, now=now)
        cert = VERIFIED.snapshot(stack, certificate, max_bytes=PACKAGE.MAX_KEY)
        if MANIFEST.fingerprint(cert, certificate=True) != expected_recipient:
            raise ValueError("UNTRUSTED_RECIPIENT_CERTIFICATE")
        with FILES.regular_file(cert) as stream:
            profile = FILES.openssl(["x509", "-in", f"/proc/self/fd/{stream.fileno()}", "-text", "-noout"],
                                    pass_fds=[stream.fileno()]).decode("ascii")
        bits = re.search(r"Public-Key: \((\d+) bit\)", profile)
        if "Public Key Algorithm: rsaEncryption" not in profile or not bits or int(bits[1]) < 3072:
            raise ValueError("RSA_3072_OR_STRONGER_REQUIRED")
        key = VERIFIED.snapshot(stack, private_key, private=True, max_bytes=PACKAGE.MAX_KEY)
        password = VERIFIED.snapshot(stack, passphrase, private=True, max_bytes=PACKAGE.MAX_KEY) if passphrase is not None else None
        descriptor = decrypt_memory(entries["backup.cms"], cert, key, password,
                                    max_plaintext_bytes, decrypt_timeout_seconds)
        stack.callback(os.close, descriptor)
        if os.pread(descriptor, 5, 0) != b"PGDMP":
            raise ValueError("POSTGRES_CUSTOM_DUMP_REQUIRED")
        yield descriptor, manifest


if __name__ == "__main__":
    # Deliberately no command line for private material or real recovery yet.
    print(json.dumps({"status": "OFFLINE_NO_ACTION", "privateKeyRead": False,
                      "productionDataRead": False, "productionRestoreVerified": False}))
    raise SystemExit(0 if len(sys.argv) == 1 else 2)
