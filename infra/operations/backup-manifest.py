#!/usr/bin/env python3
"""Sign or verify offline backup metadata; never decrypts or connects to a service."""

import argparse
from contextlib import ExitStack
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile


SPEC = importlib.util.spec_from_file_location("encrypted_backup", Path(__file__).with_name("encrypted-backup.py"))
FILES = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(FILES)
ALGORITHM = "RSA-PSS-SHA256"
FIELDS = {
    "version", "kind", "backupId", "createdAt", "applicationSha", "snapshotBoundary",
    "cipherSha256", "cipherBytes", "recipientCertificateSha256", "signingPublicKeySha256",
}


def timestamp(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", value):
        raise ValueError("UTC_TIMESTAMP_REQUIRED")
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("ascii")


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("DUPLICATE_FIELD")
        result[key] = value
    return result


def digest(stream):
    result = hashlib.sha256()
    size = 0
    while True:
        block = stream.read(1024 * 1024)
        if not block:
            break
        result.update(block)
        size += len(block)
    stream.seek(0)
    return result.hexdigest(), size


def fingerprint(path, certificate=False):
    with FILES.regular_file(path) as stream:
        arguments = ["x509", "-in"] if certificate else ["pkey", "-pubin", "-in"]
        arguments += [f"/proc/self/fd/{stream.fileno()}", "-outform", "DER"]
        encoded = FILES.openssl(arguments, pass_fds=[stream.fileno()])
    return hashlib.sha256(encoded).hexdigest()


def signing_key(stream):
    output = FILES.openssl(
        ["pkey", "-pubin", "-in", f"/proc/self/fd/{stream.fileno()}", "-text_pub", "-noout"],
        pass_fds=[stream.fileno()],
    ).decode("ascii")
    bits = re.search(r"Public-Key: \((\d+) bit\)", output)
    if not bits or int(bits[1]) < 3072 or "Modulus:" not in output or "Exponent:" not in output:
        raise ValueError("RSA_3072_SIGNER_REQUIRED")
    encoded = FILES.openssl(
        ["pkey", "-pubin", "-in", f"/proc/self/fd/{stream.fileno()}", "-outform", "DER"],
        pass_fds=[stream.fileno()],
    )
    return hashlib.sha256(encoded).hexdigest()


def validate(manifest):
    if not isinstance(manifest, dict) or set(manifest) != FIELDS:
        raise ValueError("INVALID_MANIFEST_FIELDS")
    if type(manifest["version"]) is not int or manifest["version"] != 1 or manifest["kind"] != "ORZELL_POSTGRES_CMS":
        raise ValueError("INVALID_MANIFEST_VERSION")
    for name in ["backupId", "snapshotBoundary"]:
        if not isinstance(manifest[name], str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}", manifest[name]):
            raise ValueError("INVALID_CONTEXT")
    for name, length in [("applicationSha", 40), ("cipherSha256", 64), ("recipientCertificateSha256", 64), ("signingPublicKeySha256", 64)]:
        if not isinstance(manifest[name], str) or not re.fullmatch("[0-9a-f]{" + str(length) + "}", manifest[name]):
            raise ValueError("INVALID_DIGEST")
    if type(manifest["cipherBytes"]) is not int or manifest["cipherBytes"] <= 0:
        raise ValueError("INVALID_CIPHER_SIZE")
    timestamp(manifest["createdAt"])


def publish(destination, data):
    destination = Path(destination)
    if os.path.lexists(destination):
        raise ValueError("OUTPUT_ALREADY_EXISTS")
    fd, temporary = tempfile.mkstemp(prefix=".manifest-private-", dir=destination.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temporary, destination, follow_symlinks=False)
        directory = os.open(destination.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        os.unlink(temporary)


def sign(ciphertext, output, public_key, private_key, certificate, backup_id, application_sha, boundary, created_at, passphrase=None):
    with ExitStack() as stack:
        public = stack.enter_context(FILES.regular_file(public_key))
        signer_hash = signing_key(public)
        private = stack.enter_context(FILES.regular_file(private_key, private=True))
        encrypted = stack.enter_context(FILES.regular_file(ciphertext))
        FILES.authenticated_envelope(encrypted)
        cipher_hash, size = digest(encrypted)
        manifest = {
            "version": 1, "kind": "ORZELL_POSTGRES_CMS", "backupId": backup_id,
            "createdAt": created_at, "applicationSha": application_sha, "snapshotBoundary": boundary,
            "cipherSha256": cipher_hash, "cipherBytes": size,
            "recipientCertificateSha256": fingerprint(certificate, certificate=True),
            "signingPublicKeySha256": signer_hash,
        }
        validate(manifest)
        descriptors = [private.fileno()]
        arguments = ["dgst", "-sha256", "-sign", f"/proc/self/fd/{private.fileno()}"]
        if passphrase:
            password = stack.enter_context(FILES.regular_file(passphrase, private=True))
            descriptors.append(password.fileno())
            arguments += ["-passin", f"fd:{password.fileno()}"]
        else:
            arguments += ["-passin", "pass:"]
        arguments += ["-sigopt", "rsa_padding_mode:pss", "-sigopt", "rsa_pss_saltlen:digest"]
        signature = FILES.openssl(arguments, input=canonical(manifest), pass_fds=descriptors)
        # Detect a mismatched signing key before publishing anything.
        verify_signature(public, manifest, signature)
        publish(output, canonical({"algorithm": ALGORITHM, "manifest": manifest, "signature": signature.hex()}) + b"\n")
        return manifest


def verify_signature(public, manifest, signature):
    # Signature bytes are public; the anonymous temporary file is never retained.
    with tempfile.TemporaryFile() as stream:
        stream.write(signature)
        stream.flush()
        FILES.openssl(
            ["dgst", "-sha256", "-verify", f"/proc/self/fd/{public.fileno()}",
             "-signature", f"/proc/self/fd/{stream.fileno()}", "-sigopt", "rsa_padding_mode:pss",
             "-sigopt", "rsa_pss_saltlen:digest"],
            input=canonical(manifest), pass_fds=[public.fileno(), stream.fileno()],
        )


def verify(ciphertext, manifest_path, public_key, expected_signer, expected_recipient, backup_id, application_sha, boundary, not_before, not_after, now=None):
    # All expected values MUST come from independent recovery approval, never
    # from the untrusted manifest or a sidecar stored beside the backup.
    with FILES.regular_file(manifest_path) as stream:
        data = stream.read(65537)
    if len(data) > 65536:
        raise ValueError("MANIFEST_TOO_LARGE")
    envelope = json.loads(data, object_pairs_hook=unique_object)
    if not isinstance(envelope, dict) or set(envelope) != {"algorithm", "manifest", "signature"} or envelope["algorithm"] != ALGORITHM:
        raise ValueError("INVALID_SIGNATURE_ENVELOPE")
    manifest = envelope["manifest"]
    validate(manifest)
    signature = envelope["signature"]
    if not isinstance(signature, str) or not re.fullmatch(r"[0-9a-f]{768,4096}", signature) or len(signature) % 2:
        raise ValueError("INVALID_SIGNATURE")
    with FILES.regular_file(public_key) as public:
        observed_signer = signing_key(public)
        if observed_signer != expected_signer or manifest["signingPublicKeySha256"] != expected_signer:
            raise ValueError("UNTRUSTED_SIGNER")
        verify_signature(public, manifest, bytes.fromhex(signature))
    expected = {
        "backupId": backup_id, "applicationSha": application_sha, "snapshotBoundary": boundary,
        "recipientCertificateSha256": expected_recipient,
    }
    if any(manifest[name] != value for name, value in expected.items()):
        raise ValueError("BACKUP_CONTEXT_MISMATCH")
    start, end, created = timestamp(not_before), timestamp(not_after), timestamp(manifest["createdAt"])
    current = now or datetime.now(timezone.utc)
    if not start <= created <= end <= current:
        raise ValueError("BACKUP_OUTSIDE_APPROVED_TIME_WINDOW")
    with FILES.regular_file(ciphertext) as stream:
        FILES.authenticated_envelope(stream)
        observed_hash, observed_size = digest(stream)
    if observed_hash != manifest["cipherSha256"] or observed_size != manifest["cipherBytes"]:
        raise ValueError("CIPHERTEXT_MISMATCH")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["sign", "verify"])
    parser.add_argument("--input", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--public-key", required=True)
    parser.add_argument("--backup-id", required=True)
    parser.add_argument("--application-sha", required=True)
    parser.add_argument("--snapshot-boundary", required=True)
    parser.add_argument("--private-key")
    parser.add_argument("--passphrase-file")
    parser.add_argument("--certificate")
    parser.add_argument("--created-at")
    parser.add_argument("--expected-signer-sha256")
    parser.add_argument("--expected-recipient-sha256")
    parser.add_argument("--created-not-before")
    parser.add_argument("--created-not-after")
    args = parser.parse_args()
    required = [args.private_key, args.certificate, args.created_at] if args.mode == "sign" else [
        args.expected_signer_sha256, args.expected_recipient_sha256, args.created_not_before, args.created_not_after,
    ]
    if not all(required):
        parser.error("mode requires explicit signing inputs or independently approved verification context")
    try:
        if args.mode == "sign":
            sign(args.input, args.manifest, args.public_key, args.private_key, args.certificate,
                 args.backup_id, args.application_sha, args.snapshot_boundary, args.created_at, args.passphrase_file)
        else:
            verify(args.input, args.manifest, args.public_key, args.expected_signer_sha256,
                   args.expected_recipient_sha256, args.backup_id, args.application_sha, args.snapshot_boundary,
                   args.created_not_before, args.created_not_after)
    except (ValueError, OSError, RecursionError):
        print(json.dumps({"status": "FAILED"}))
        return 1
    print(json.dumps({"status": "SIGNED" if args.mode == "sign" else "VERIFIED"}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
