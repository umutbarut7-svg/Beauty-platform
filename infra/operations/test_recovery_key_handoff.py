import base64
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import fcntl
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.x509.oid import NameOID

SPEC = importlib.util.spec_from_file_location("handoff", Path(__file__).with_name("recovery-key-handoff.py"))
HANDOFF = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HANDOFF)
CLIENT = Path(__file__).with_name("wrap-recovery-handoff.mjs").resolve().as_uri()
NODE = '''
import { wrapRecoveryKey } from CLIENT_URL;
let text = ''; for await (const c of process.stdin) text += c;
const i = JSON.parse(text);
const decode = v => new Uint8Array(Buffer.from(v, 'base64'));
try {
 const result = await wrapRecoveryKey(decode(i.challenge), i.pin,
   i.invalidPrivate ? null : decode(i.key), i.password === null ? null : decode(i.password));
 process.stdout.write(JSON.stringify({ok: true, envelope: Buffer.from(result).toString('base64')}));
} catch (e) { process.stdout.write(JSON.stringify({ok: false, reason: e.message})); }
'''.replace("CLIENT_URL", json.dumps(CLIENT))


class HandoffTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
        cls.signer = rsa.generate_private_key(public_exponent=65537, key_size=3072)
        cls.password = b"generated-fixture-password"
        cls.key_pem = cls.key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                            serialization.BestAvailableEncryption(cls.password))
        now = datetime.now(timezone.utc)
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "generated-handoff-fixture")])
        cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(cls.key.public_key())
                .serial_number(x509.random_serial_number()).not_valid_before(now-timedelta(days=1))
                .not_valid_after(now+timedelta(days=1)).sign(cls.key, hashes.SHA256()))
        cls.cert = cert.public_bytes(serialization.Encoding.PEM)
        cls.fingerprint = hashlib.sha256(cert.public_bytes(serialization.Encoding.DER)).hexdigest()

    def setUp(self):
        # Generated material only; this patch is not a real-host approval.
        self.guard = patch.object(HANDOFF.MEMORY, "host_checks")
        self.guard.start()
        self.addCleanup(self.guard.stop)
        now = HANDOFF.utc_now()
        stamp = lambda d: d.strftime("%Y-%m-%dT%H:%M:%SZ")
        self.context = {"backupId": "generated-handoff-fixture", "applicationSha": "a"*40,
                        "cipherSha256": "b"*64, "recipientCertificateSha256": self.fingerprint,
                        "signingPublicKeySha256": "c"*64, "schemaReferenceSha256": "d"*64,
                        "snapshotBoundary": "SYNTHETIC_ONLY", "backupCreatedNotBefore": stamp(now-timedelta(minutes=5)),
                        "backupCreatedNotAfter": stamp(now)}

    def session(self):
        value = HANDOFF.KeyHandoff(self.context, self.cert)
        self.addCleanup(value.close)
        return value

    def node_wrap(self, session, key=None, password=None, challenge=None, pin=None, invalid_private=False):
        request = {"challenge": HANDOFF.b64(challenge or session.challenge), "pin": pin or session.challenge_sha256,
                   "key": HANDOFF.b64(self.key_pem if key is None else key),
                   "password": HANDOFF.b64(self.password) if password is None else (None if password is False else HANDOFF.b64(password)),
                   "invalidPrivate": invalid_private}
        result = subprocess.run(["node", "--input-type=module", "-e", NODE], input=json.dumps(request),
                                capture_output=True, text=True, timeout=15, check=True)
        return json.loads(result.stdout)

    def envelope(self, session, **kwargs):
        output = self.node_wrap(session, **kwargs)
        self.assertTrue(output["ok"], output.get("reason"))
        return base64.b64decode(output["envelope"], validate=True)

    def test_webcrypto_encrypted_pem_to_sealed_descriptors_and_close(self):
        session = self.session()
        self.assertNotIn(b"PRIVATE KEY", session.challenge)
        self.assertNotIn("PRIVATE KEY", repr(session))
        packet = self.envelope(session)
        self.assertNotIn(self.password, packet)
        with session.open_key(packet) as (key_fd, password_fd):
            self.assertTrue(os.pread(key_fd, 20000, 0) == self.key_pem)
            self.assertTrue(os.pread(password_fd, 2000, 0) == self.password)
            for fd in (key_fd, password_fd):
                self.assertEqual(fcntl.fcntl(fd, 1034), HANDOFF.MEMORY.SEALS)
                self.assertEqual(os.fstat(fd).st_mode & 0o777, 0o600)
        for fd in (key_fd, password_fd):
            with self.assertRaises(OSError):
                os.fstat(fd)
        with self.assertRaisesRegex(ValueError, "HANDOFF_ALREADY_CONSUMED"):
            with session.open_key(packet):
                self.fail("Replay accepted")

    def test_unencrypted_pem_and_caller_exception_close(self):
        session = self.session()
        key = self.key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL,
                                     serialization.NoEncryption())
        packet = self.envelope(session, key=key, password=False)
        with self.assertRaisesRegex(RuntimeError, "caller-failure"):
            with session.open_key(packet) as (fd, password):
                self.assertIsNone(password)
                self.assertTrue(os.pread(fd, 20000, 0) == key)
                raise RuntimeError("caller-failure")
        with self.assertRaises(OSError):
            os.fstat(fd)

    def test_independent_pin_checked_before_private_input(self):
        session = self.session()
        output = self.node_wrap(session, pin="0"*64, invalid_private=True)
        self.assertFalse(output["ok"])
        self.assertEqual(output["reason"], "HANDOFF_CHALLENGE_PIN_MISMATCH")
        request = json.loads(session.challenge)
        request["context"]["cipherSha256"] = "f"*64
        output = self.node_wrap(session, challenge=HANDOFF.canonical(request))
        self.assertEqual(output["reason"], "HANDOFF_CHALLENGE_PIN_MISMATCH")

    def test_client_rejects_expired_future_excessive_lifetime_and_unknown_fields(self):
        session = self.session()
        now = HANDOFF.utc_now()
        stamp = lambda d: d.strftime("%Y-%m-%dT%H:%M:%SZ")
        changes = [{"createdAt": stamp(now-timedelta(minutes=20)), "expiresAt": stamp(now-timedelta(minutes=10))},
                   {"createdAt": stamp(now+timedelta(minutes=1))},
                   {"expiresAt": stamp(now+timedelta(hours=1))}, {"unreviewed": True}]
        for change in changes:
            with self.subTest(change=change):
                value = dict(json.loads(session.challenge), **change)
                raw = HANDOFF.canonical(value)
                output = self.node_wrap(session, challenge=raw, pin=hashlib.sha256(raw).hexdigest())
                self.assertFalse(output["ok"])
        oversized = self.node_wrap(session, key=b"x"*(HANDOFF.MAX_KEY+1))
        self.assertEqual(oversized["reason"], "HANDOFF_PRIVATE_INPUT_LIMIT")

    def test_gcm_tag_and_rsa_ciphertext_corruption_consume_without_private_output(self):
        for field in ("ciphertext", "wrappedKey"):
            with self.subTest(field=field):
                session = self.session()
                packet = json.loads(self.envelope(session))
                raw = bytearray(base64.b64decode(packet[field]))
                raw[-1] ^= 1
                packet[field] = HANDOFF.b64(raw)
                with self.assertRaisesRegex(ValueError, "^HANDOFF_AUTHENTICATION_FAILED$"):
                    with session.open_key(HANDOFF.canonical(packet)):
                        self.fail("Corruption accepted")
                self.assertIsNone(session._private)
                with self.assertRaisesRegex(ValueError, "HANDOFF_ALREADY_CONSUMED"):
                    with session.open_key(HANDOFF.canonical(packet)):
                        self.fail("Replay after failure accepted")

    def test_other_session_wrong_cert_key_and_wrong_password_rejected(self):
        first, second = self.session(), self.session()
        with self.assertRaisesRegex(ValueError, "HANDOFF_ENVELOPE_CONTEXT_MISMATCH"):
            with second.open_key(self.envelope(first)):
                self.fail("Other session accepted")
        for key, password in ((self.signer.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                                        serialization.NoEncryption()), False),
                              (self.key_pem, b"wrong-generated-password")):
            session = self.session()
            with self.assertRaisesRegex(ValueError, "^HANDOFF_KEY_CERTIFICATE_MISMATCH$"):
                with session.open_key(self.envelope(session, key=key, password=password)):
                    self.fail("Wrong key/password accepted")

    def test_expiry_close_and_one_attempt_are_enforced(self):
        session = self.session()
        packet = self.envelope(session)
        with patch.object(HANDOFF.time, "monotonic", return_value=session._deadline+1):
            with self.assertRaisesRegex(ValueError, "HANDOFF_EXPIRED"):
                with session.open_key(packet):
                    self.fail("Expired session accepted")
        session = self.session()
        session.close()
        with self.assertRaisesRegex(ValueError, "HANDOFF_ALREADY_CONSUMED"):
            with session.open_key(b"{}"):
                self.fail("Closed session accepted")

    def test_private_validation_deadline_has_narrow_environment_and_closes_fds(self):
        session = self.session()
        packet = self.envelope(session)
        seen = []

        def timeout(args, **kwargs):
            self.assertEqual(kwargs["timeout"], 10)
            self.assertEqual(set(kwargs["env"]), {"PATH", "LANG", "OPENSSL_CONF"})
            self.assertNotIn("PRIVATE KEY", repr(args))
            seen.extend(kwargs["pass_fds"])
            raise subprocess.TimeoutExpired(args[0], 10)

        with patch.object(HANDOFF.subprocess, "run", side_effect=timeout):
            with self.assertRaisesRegex(ValueError, "^HANDOFF_KEY_VALIDATION_DEADLINE$"):
                with session.open_key(packet):
                    self.fail("Validation deadline bypassed")
        self.assertEqual(len(seen), 2)
        for fd in seen:
            with self.assertRaises(OSError):
                os.fstat(fd)
        self.assertIsNone(session._private)

    def test_malformed_duplicate_unknown_and_oversize_packets_rejected(self):
        inputs = [b'{"version":1,"version":1}', b"not-json", b"x"*(HANDOFF.MAX_ENVELOPE+1),
                  HANDOFF.canonical({"unknown": "do-not-return"})]
        for packet in inputs:
            session = self.session()
            with self.subTest(length=len(packet)), self.assertRaises(ValueError) as caught:
                with session.open_key(packet):
                    self.fail("Malformed input accepted")
            self.assertNotIn("do-not-return", str(caught.exception))
            self.assertIsNone(session._private)

    def test_invalid_context_certificate_and_host_stop_before_wrap_key_generation(self):
        with patch.object(HANDOFF.rsa, "generate_private_key") as generate:
            for context, cert in (({}, self.cert), (dict(self.context, recipientCertificateSha256="0"*64), self.cert),
                                  (self.context, b"invalid-generated-certificate")):
                with self.assertRaises(ValueError):
                    HANDOFF.KeyHandoff(context, cert)
            generate.assert_not_called()
        with patch.object(HANDOFF.MEMORY, "host_checks", side_effect=ValueError("ACTIVE_OR_UNKNOWN_SWAP")):
            with self.assertRaisesRegex(ValueError, "ACTIVE_OR_UNKNOWN_SWAP"):
                HANDOFF.KeyHandoff(self.context, self.cert)

    def test_authenticated_payload_limits_precede_private_key_parser(self):
        payloads = [HANDOFF.canonical({"privateKey": HANDOFF.b64(b"x"*(HANDOFF.MAX_KEY+1)), "passphrase": None}),
                    HANDOFF.canonical({"privateKey": HANDOFF.b64(self.key_pem), "passphrase": HANDOFF.b64(b"x"*(HANDOFF.MAX_PASSWORD+1))}),
                    HANDOFF.canonical({"privateKey": HANDOFF.b64(self.key_pem), "passphrase": None, "unknown": True}),
                    b"x"*(HANDOFF.MAX_PLAINTEXT+1)]
        for payload in payloads:
            session = self.session()
            public = serialization.load_der_public_key(base64.b64decode(json.loads(session.challenge)["wrapPublicKeySpki"]))
            aes_key, iv = os.urandom(32), os.urandom(12)
            wrapped = public.encrypt(aes_key, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(),
                                                         label=bytes.fromhex(session.challenge_sha256)))
            packet = HANDOFF.canonical({"version": 1, "kind": HANDOFF.KIND, "challengeSha256": session.challenge_sha256,
                "wrappedKey": HANDOFF.b64(wrapped), "iv": HANDOFF.b64(iv),
                "ciphertext": HANDOFF.b64(AESGCM(aes_key).encrypt(iv, payload, session.challenge))})
            with patch.object(HANDOFF, "validate_private_descriptor") as parser:
                with self.subTest(length=len(payload)), self.assertRaises(ValueError):
                    with session.open_key(packet):
                        self.fail("Authenticated oversized/unknown payload accepted")
                parser.assert_not_called()

    def test_handoff_descriptors_feed_existing_signed_cms_memory_verification(self):
        memory = HANDOFF.MEMORY
        with tempfile.TemporaryDirectory(prefix="generated-handoff-cms-") as root:
            root = Path(root)
            (root/"recipient.crt").write_bytes(self.cert)
            (root/"signer.key").write_bytes(self.signer.private_bytes(serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
            (root/"signer.key").chmod(0o600)
            (root/"signer.pub").write_bytes(self.signer.public_key().public_bytes(serialization.Encoding.PEM,
                serialization.PublicFormat.SubjectPublicKeyInfo))
            plain = b"PGDMP generated protected-key handoff integration"
            (root/"input.dump").write_bytes(plain)
            memory.FILES.transform("encrypt", root/"input.dump", root/"backup.cms", root/"recipient.crt")
            self.context["cipherSha256"] = hashlib.sha256((root/"backup.cms").read_bytes()).hexdigest()
            self.context["signingPublicKeySha256"] = memory.MANIFEST.fingerprint(root/"signer.pub")
            now = self.context["backupCreatedNotAfter"]
            memory.MANIFEST.sign(root/"backup.cms", root/"manifest.json", root/"signer.pub", root/"signer.key",
                root/"recipient.crt", self.context["backupId"], self.context["applicationSha"], "SYNTHETIC_ONLY", now)
            with zipfile.ZipFile(root/"package.zip", "w") as archive:
                archive.write(root/"backup.cms", "backup.cms")
                archive.write(root/"manifest.json", "manifest.json")
            session = self.session()
            packet = self.envelope(session)
            args = dict(package=root/"package.zip", public_key=root/"signer.pub", max_package_bytes=65536,
                        max_cipher_bytes=32768, max_plaintext_bytes=1024, decrypt_timeout_seconds=10)
            with session.verified_dump(packet, **args) as (dump, manifest, schema):
                self.assertTrue(os.pread(dump, 1024, 0) == plain)
                self.assertEqual(manifest["cipherSha256"], self.context["cipherSha256"])
                self.assertEqual(schema, self.context["schemaReferenceSha256"])
            with self.assertRaises(OSError):
                os.fstat(dump)
            # A genuinely signed package with a different approved receipt hash
            # must fail before the receiving key is opened.
            self.context["cipherSha256"] = "0"*64
            mismatch = self.session()
            with patch.object(mismatch, "open_key") as opened:
                with self.assertRaisesRegex(ValueError, "HANDOFF_APPROVED_CIPHERTEXT_MISMATCH"):
                    with mismatch.verified_dump(b"not-even-a-valid-key-packet", **args):
                        self.fail("Wrong approved ciphertext accepted")
                opened.assert_not_called()
            with patch.object(mismatch, "open_key") as opened:
                (root/"package.zip").write_bytes(b"invalid-generated-package")
                with self.assertRaises(ValueError):
                    with mismatch.verified_dump(b"no-key", **args):
                        self.fail("Untrusted package accepted")
                opened.assert_not_called()

    def test_cli_is_no_action_without_reading_private_arguments(self):
        path = str(Path(__file__).with_name("recovery-key-handoff.py"))
        for args, code in (([], 0), (["--private-key", "never-read"], 2)):
            result = subprocess.run([sys.executable, path, *args], capture_output=True, text=True)
            self.assertEqual(result.returncode, code)
            self.assertIn('"status": "OFFLINE_NO_ACTION"', result.stdout)
            self.assertNotIn("never-read", result.stdout+result.stderr)


if __name__ == "__main__":
    unittest.main()
