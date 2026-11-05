#!/usr/bin/env python3
"""Stream a trusted producer into encrypted, signed offline backup packaging."""

import argparse
from contextlib import ExitStack
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile


SPEC = importlib.util.spec_from_file_location("verified_backup", Path(__file__).with_name("verified-backup.py"))
VERIFIED = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFIED)
MANIFEST = VERIFIED.MANIFEST
FILES = MANIFEST.FILES


def stop(process):
    if process is not None:
        # A producer's descendants may still hold its stdout open after exit.
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait()


def produce(command, output, certificate, signing_public, signing_private,
            expected_recipient, expected_signer, backup_id, application_sha,
            boundary, timeout=300, passphrase=None):
    if not isinstance(command, list) or not command or any(not isinstance(x, str) or not x for x in command):
        raise ValueError("EXPLICIT_COMMAND_ARGUMENTS_REQUIRED")
    if not isinstance(timeout, (int, float)) or not 0 < timeout <= 3600:
        raise ValueError("INVALID_TIMEOUT")
    destination = Path(output)
    if os.path.lexists(destination):
        raise ValueError("OUTPUT_ALREADY_EXISTS")
    deadline = time.monotonic() + timeout
    with ExitStack() as stack:
        cert = VERIFIED.snapshot(stack, certificate)
        public = VERIFIED.snapshot(stack, signing_public)
        private = VERIFIED.snapshot(stack, signing_private, private=True)
        password = VERIFIED.snapshot(stack, passphrase, private=True) if passphrase is not None else None
        if MANIFEST.fingerprint(cert, certificate=True) != expected_recipient:
            raise ValueError("UNTRUSTED_RECIPIENT")
        with FILES.regular_file(public) as stream:
            if MANIFEST.signing_key(stream) != expected_signer:
                raise ValueError("UNTRUSTED_SIGNER")
        # Check the actual pinned certificate's strength and validity before
        # starting any database producer. Never include command/env in errors.
        cert_path = f"/proc/self/fd/{cert}"
        description = FILES.openssl(["x509", "-in", cert_path, "-text", "-noout"], pass_fds=[cert]).decode("ascii")
        bits = re.search(r"Public-Key: \((\d+) bit\)", description)
        if "Public Key Algorithm: rsaEncryption" not in description or not bits or int(bits[1]) < 3072:
            raise ValueError("RSA_3072_RECIPIENT_REQUIRED")
        FILES.openssl(["x509", "-in", cert_path, "-checkend", "0", "-noout"], pass_fds=[cert])
        with tempfile.TemporaryDirectory(prefix=".backup-producer-", dir=destination.parent) as directory:
            root = Path(directory)
            cipher, manifest = root / "backup.cms", root / "manifest.json"
            producer = encryptor = None
            created_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            try:
                with cipher.open("xb") as encrypted:
                    os.fchmod(encrypted.fileno(), 0o600)
                    producer = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "--stream-producer", *command], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                                stderr=subprocess.DEVNULL, start_new_session=True)
                    try:
                        encryptor = subprocess.Popen(
                            ["openssl", "cms", "-encrypt", "-binary", "-aes-256-gcm", "-outform", "DER", "-stream",
                             "-recip", cert_path, "-keyopt", "rsa_padding_mode:oaep", "-keyopt", "rsa_oaep_md:sha256"],
                            stdin=producer.stdout, stdout=encrypted, stderr=subprocess.DEVNULL,
                            pass_fds=[cert], start_new_session=True,
                        )
                    finally:
                        producer.stdout.close()
                    while True:
                        producer_status, encryptor_status = producer.poll(), encryptor.poll()
                        if producer_status not in (None, 0) or encryptor_status not in (None, 0):
                            raise ValueError("BACKUP_PIPELINE_FAILED")
                        if producer_status == 0 and encryptor_status == 0:
                            break
                        if time.monotonic() >= deadline:
                            raise ValueError("BACKUP_PIPELINE_TIMEOUT")
                        time.sleep(0.02)
                    encrypted.flush()
                    os.fsync(encrypted.fileno())
                if cipher.stat().st_size == 0:
                    raise ValueError("EMPTY_ENCRYPTED_BACKUP")
                MANIFEST.sign(cipher, manifest, public, private, cert, backup_id,
                              application_sha, boundary, created_at, password)
                ended_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                MANIFEST.verify(cipher, manifest, public, expected_signer, expected_recipient,
                                backup_id, application_sha, boundary, created_at, ended_at)
                package = root / "complete.zip"
                with zipfile.ZipFile(package, "x", compression=zipfile.ZIP_STORED) as archive:
                    for path in [cipher, manifest]:
                        archive.write(path, arcname=path.name)
                package.chmod(0o600)
                with package.open("rb") as stream:
                    os.fsync(stream.fileno())
                # Only a complete encrypted + signed package is published.
                # Hard-link creation cannot overwrite even a concurrent output.
                os.link(package, destination, follow_symlinks=False)
                descriptor = os.open(destination.parent, os.O_RDONLY | os.O_DIRECTORY)
                try:
                    os.fsync(descriptor)
                finally:
                    os.close(descriptor)
            finally:
                stop(encryptor)
                stop(producer)
    return {"status": "ENCRYPTED_SIGNED_PACKAGE_CREATED"}


def stream_producer(command):
    """Child in the producer process group; no plaintext temporary file."""
    producer = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=subprocess.DEVNULL)
    try:
        prefix = producer.stdout.read(5)
        if prefix != b"PGDMP":
            producer.kill()
            producer.wait()
            return 1
        sys.stdout.buffer.write(prefix)
        shutil.copyfileobj(producer.stdout, sys.stdout.buffer, length=1024 * 1024)
        sys.stdout.buffer.flush()
        return 0 if producer.wait() == 0 else 1
    finally:
        producer.stdout.close()


def main():
    if sys.argv[1:2] == ["--stream-producer"]:
        return stream_producer(sys.argv[2:])
    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ["output", "certificate", "signing-public", "signing-private", "expected-recipient",
                 "expected-signer", "backup-id", "application-sha", "boundary"]:
        parser.add_argument("--" + flag, required=True)
    parser.add_argument("--timeout", type=float, default=300)
    parser.add_argument("--passphrase", help="Protected passphrase FILE path, never a literal password")
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = vars(parser.parse_args())
    if args["command"][:1] == ["--"]:
        args["command"] = args["command"][1:]
    try:
        result = produce(**args)
    except (ValueError, OSError, RecursionError, AttributeError):
        print(json.dumps({"status": "FAILED"}))
        return 1
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
