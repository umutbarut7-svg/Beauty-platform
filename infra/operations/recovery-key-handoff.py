#!/usr/bin/env python3
"""Offline one-attempt key handoff primitive; no receiver, host approval or CLI intake."""

from contextlib import ExitStack, contextmanager
from datetime import datetime, timedelta, timezone
import base64
import hashlib
import hmac
import importlib.util
import io
import json
from pathlib import Path
import re
import sys
import subprocess
import secrets
import threading
import time

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

SPEC = importlib.util.spec_from_file_location("handoff_memory", Path(__file__).with_name("recover-backup-memory.py"))
MEMORY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MEMORY)
VERSION = 1
KIND = "ORZELL_RECOVERY_KEY_HANDOFF"
MAX_KEY = 16384
MAX_PASSWORD = 1024
MAX_PLAINTEXT = 24576
MAX_ENVELOPE = 40000
MAX_CHALLENGE = 8192
TTL = 600
CONTEXT_FIELDS = {"backupId", "applicationSha", "cipherSha256", "recipientCertificateSha256",
                  "signingPublicKeySha256", "schemaReferenceSha256", "snapshotBoundary",
                  "backupCreatedNotBefore", "backupCreatedNotAfter"}


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("ascii")


def strict_json(raw, cap):
    if type(raw) is not bytes or not 0 < len(raw) <= cap:
        raise ValueError("HANDOFF_INPUT_LIMIT")
    try:
        value = json.loads(raw, object_pairs_hook=MEMORY.MANIFEST.unique_object)
        if not isinstance(value, dict) or canonical(value) != raw:
            raise ValueError()
        return value
    except (ValueError, TypeError, RecursionError, UnicodeError):
        raise ValueError("HANDOFF_CANONICAL_JSON_REQUIRED") from None


def b64(raw):
    return base64.b64encode(raw).decode("ascii")


def unb64(value, minimum, maximum):
    if not isinstance(value, str) or not minimum <= len(value) <= 4 * ((maximum + 2) // 3):
        raise ValueError("HANDOFF_ENCODING_REQUIRED")
    try:
        raw = base64.b64decode(value, validate=True)
    except (ValueError, TypeError):
        raise ValueError("HANDOFF_ENCODING_REQUIRED") from None
    if not minimum <= len(raw) <= maximum or b64(raw) != value:
        raise ValueError("HANDOFF_ENCODING_REQUIRED")
    return raw


def utc_now():
    return datetime.now(timezone.utc).replace(microsecond=0)


def validate_context(context, now):
    if not isinstance(context, dict) or set(context) != CONTEXT_FIELDS:
        raise ValueError("INDEPENDENT_HANDOFF_CONTEXT_REQUIRED")
    for name in ("backupId", "snapshotBoundary"):
        if not isinstance(context[name], str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}", context[name]):
            raise ValueError("HANDOFF_CONTEXT_REQUIRED")
    for name in CONTEXT_FIELDS - {"backupId", "snapshotBoundary", "backupCreatedNotBefore", "backupCreatedNotAfter"}:
        size = 40 if name == "applicationSha" else 64
        if not isinstance(context[name], str) or not re.fullmatch(r"[0-9a-f]{" + str(size) + "}", context[name]):
            raise ValueError("HANDOFF_CONTEXT_REQUIRED")
    start = MEMORY.MANIFEST.timestamp(context["backupCreatedNotBefore"])
    end = MEMORY.MANIFEST.timestamp(context["backupCreatedNotAfter"])
    if not start <= end <= now:
        raise ValueError("HANDOFF_BACKUP_WINDOW_REQUIRED")


def certificate_profile(certificate, expected, now):
    if type(certificate) is not bytes or not 0 < len(certificate) <= MAX_KEY:
        raise ValueError("HANDOFF_CERTIFICATE_REQUIRED")
    try:
        cert = x509.load_pem_x509_certificate(certificate)
        encoded = cert.public_bytes(serialization.Encoding.DER)
        key = cert.public_key()
        before = cert.not_valid_before_utc if hasattr(cert, "not_valid_before_utc") else cert.not_valid_before.replace(tzinfo=timezone.utc)
        after = cert.not_valid_after_utc if hasattr(cert, "not_valid_after_utc") else cert.not_valid_after.replace(tzinfo=timezone.utc)
        if (hashlib.sha256(encoded).hexdigest() != expected or not before <= now < after
                or not isinstance(key, rsa.RSAPublicKey) or not 3072 <= key.key_size <= 8192):
            raise ValueError()
        return key.public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    except Exception:
        raise ValueError("HANDOFF_CERTIFICATE_NOT_APPROVED") from None


KEY_CHECK = r"""
import hashlib, os, resource, sys
resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
try:
    key_data = os.pread(int(sys.argv[1]), 16385, 0)
    password = os.pread(int(sys.argv[2]), 1025, 0) if sys.argv[2] != '-' else None
    if len(key_data) > 16384 or (password is not None and len(password) > 1024):
        raise ValueError()
    key = serialization.load_pem_private_key(key_data, password=password)
    if not isinstance(key, rsa.RSAPrivateKey) or not 3072 <= key.key_size <= 8192:
        raise ValueError()
    public = key.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    os.write(1, hashlib.sha256(public).digest())
except Exception:
    raise SystemExit(1)
"""


def validate_private_descriptor(key_fd, password_fd, expected_public):
    # Expensive private-key validation runs in a reaped, time-limited child.
    # Only sealed FD numbers and public source code are passed as arguments;
    # stdout is exactly a public-key digest and inherited cloud env is omitted.
    try:
        result = subprocess.run([sys.executable, '-c', KEY_CHECK, str(key_fd),
                                 str(password_fd) if password_fd is not None else '-'],
                                pass_fds=[key_fd] + ([password_fd] if password_fd is not None else []),
                                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                env={'PATH': '/usr/bin:/bin', 'LANG': 'C.UTF-8', 'OPENSSL_CONF': '/dev/null'},
                                close_fds=True, start_new_session=True, timeout=10)
    except subprocess.TimeoutExpired:
        raise ValueError('HANDOFF_KEY_VALIDATION_DEADLINE') from None
    if result.returncode or len(result.stdout) != 32 or not hmac.compare_digest(result.stdout, hashlib.sha256(expected_public).digest()):
        raise ValueError('HANDOFF_KEY_CERTIFICATE_MISMATCH')


class KeyHandoff:
    """One process-local ephemeral wrapping key; public challenge is not host approval.

    The expected context/certificate must be obtained independently of a package.
    Authenticate challenge_sha256 through a separate trusted owner channel before
    selecting real input on the phone. No code here establishes that channel.
    """

    def __init__(self, context, certificate):
        MEMORY.host_checks()
        now = utc_now()
        validate_context(context, now)
        self._certificate_public = certificate_profile(certificate, context["recipientCertificateSha256"], now)
        self._certificate = bytes(certificate)
        self._context = dict(context)
        self._lock = threading.Lock()
        self._used = False
        self._private = rsa.generate_private_key(public_exponent=65537, key_size=3072)
        self._expires = now + timedelta(seconds=TTL)
        self._deadline = time.monotonic() + TTL
        public = self._private.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
        challenge = {"version": VERSION, "kind": KIND, "handoffId": secrets.token_hex(32),
                     "createdAt": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                     "expiresAt": self._expires.strftime("%Y-%m-%dT%H:%M:%SZ"),
                     "wrapPublicKeySpki": b64(public), "context": dict(context)}
        self.challenge = canonical(challenge)
        self.challenge_sha256 = hashlib.sha256(self.challenge).hexdigest()
        self._label = bytes.fromhex(self.challenge_sha256)

    def __repr__(self):
        return "<KeyHandoff private material hidden>"

    def close(self):
        with self._lock:
            self._used = True
            self._private = None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    def _claim(self):
        with self._lock:
            if self._used or self._private is None:
                raise ValueError("HANDOFF_ALREADY_CONSUMED")
            self._used = True
            private, self._private = self._private, None
        return private

    @contextmanager
    def verified_dump(self, envelope, package, public_key, *, max_package_bytes,
                      max_cipher_bytes, max_plaintext_bytes, decrypt_timeout_seconds):
        """Bind the real signed package before receiving private-key plaintext.

        Returns the sealed dump, verified manifest and independently approved
        schema digest. Never applies SQL, opens a DB or authorizes reopening.
        """
        MEMORY.limits(max_package_bytes, max_cipher_bytes, max_plaintext_bytes, decrypt_timeout_seconds)
        if max_package_bytes > 16 * 1024 * 1024 or max_plaintext_bytes > 128 * 1024 * 1024:
            raise ValueError("HANDOFF_PACKAGE_MEMORY_LIMIT")
        MEMORY.host_checks()
        with ExitStack() as stack:
            sealed_package = MEMORY.VERIFIED.snapshot(stack, package, max_bytes=max_package_bytes)
            public = MEMORY.VERIFIED.snapshot(stack, public_key, max_bytes=MAX_KEY)
            certificate = MEMORY.VERIFIED.snapshot_stream(stack, io.BytesIO(self._certificate), max_bytes=MAX_KEY)
            incoming = stack.enter_context(MEMORY.FILES.regular_file(sealed_package))
            archive = stack.enter_context(MEMORY.PACKAGE.members(incoming, max_cipher_bytes))
            entries = {}
            for name, cap in (("backup.cms", max_cipher_bytes), ("manifest.json", MEMORY.PACKAGE.MAX_MANIFEST)):
                with archive.open(name) as source:
                    entries[name] = MEMORY.VERIFIED.snapshot_stream(stack, source, max_bytes=cap)
            context = self._context
            expected = dict(expected_signer=context["signingPublicKeySha256"],
                            expected_recipient=context["recipientCertificateSha256"], backup_id=context["backupId"],
                            application_sha=context["applicationSha"], boundary=context["snapshotBoundary"],
                            not_before=context["backupCreatedNotBefore"], not_after=context["backupCreatedNotAfter"])
            manifest = MEMORY.MANIFEST.verify(entries["backup.cms"], entries["manifest.json"], public,
                expected["expected_signer"], expected["expected_recipient"], expected["backup_id"], expected["application_sha"],
                expected["boundary"], expected["not_before"], expected["not_after"])
            if manifest["cipherSha256"] != context["cipherSha256"]:
                raise ValueError("HANDOFF_APPROVED_CIPHERTEXT_MISMATCH")
            with self.open_key(envelope) as (key_fd, password_fd):
                with MEMORY.verified_dump(package=sealed_package, public_key=public, certificate=certificate,
                    private_key=key_fd, passphrase=password_fd, max_package_bytes=max_package_bytes,
                    max_cipher_bytes=max_cipher_bytes, max_plaintext_bytes=max_plaintext_bytes,
                    decrypt_timeout_seconds=decrypt_timeout_seconds, **expected) as (dump, verified):
                    yield dump, verified, context["schemaReferenceSha256"]

    @contextmanager
    def open_key(self, envelope):
        # Every attempt consumes this session, including malformed/expired input.
        # New process state is never a durable global replay database.
        private = self._claim()
        try:
            MEMORY.host_checks()
            now = utc_now()
            if now >= self._expires or time.monotonic() >= self._deadline:
                raise ValueError("HANDOFF_EXPIRED")
            packet = strict_json(envelope, MAX_ENVELOPE)
            if (set(packet) != {"version", "kind", "challengeSha256", "wrappedKey", "iv", "ciphertext"}
                    or type(packet["version"]) is not int or packet["version"] != VERSION
                    or packet["kind"] != KIND or packet["challengeSha256"] != self.challenge_sha256):
                raise ValueError("HANDOFF_ENVELOPE_CONTEXT_MISMATCH")
            wrapped = unb64(packet["wrappedKey"], 384, 384)
            iv = unb64(packet["iv"], 12, 12)
            ciphertext = unb64(packet["ciphertext"], 17, MAX_PLAINTEXT + 16)
            try:
                aes_key = private.decrypt(wrapped, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()),
                                                              algorithm=hashes.SHA256(), label=self._label))
                if len(aes_key) != 32:
                    raise ValueError()
                plaintext = AESGCM(aes_key).decrypt(iv, ciphertext, self.challenge)
            except Exception:
                raise ValueError("HANDOFF_AUTHENTICATION_FAILED") from None
            finally:
                private = None
            payload = strict_json(plaintext, MAX_PLAINTEXT)
            if set(payload) != {"privateKey", "passphrase"}:
                raise ValueError("HANDOFF_PAYLOAD_REQUIRED")
            key_bytes = unb64(payload["privateKey"], 1, MAX_KEY)
            password = None if payload["passphrase"] is None else unb64(payload["passphrase"], 1, MAX_PASSWORD)
            # Never expose descriptors until the received key has been matched
            # to the independent backup certificate in the bounded validator.
            with ExitStack() as stack:
                key_fd = MEMORY.VERIFIED.snapshot_stream(stack, io.BytesIO(key_bytes), max_bytes=MAX_KEY)
                password_fd = MEMORY.VERIFIED.snapshot_stream(stack, io.BytesIO(password), max_bytes=MAX_PASSWORD) if password else None
                validate_private_descriptor(key_fd, password_fd, self._certificate_public)
                if utc_now() >= self._expires or time.monotonic() >= self._deadline:
                    raise ValueError("HANDOFF_EXPIRED")
                key_bytes = plaintext = payload = password = aes_key = None
                yield key_fd, password_fd
        finally:
            private = None
            self.close()


if __name__ == "__main__":
    print(json.dumps({"status": "OFFLINE_NO_ACTION", "privateKeyRead": False, "productionDataRead": False,
                      "protectedHandoffVerified": False, "realRecoveryReady": False}))
    raise SystemExit(0 if len(sys.argv) == 1 else 2)
