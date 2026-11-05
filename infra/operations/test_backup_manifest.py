import copy
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest


SPEC = importlib.util.spec_from_file_location("manifest", Path(__file__).with_name("backup-manifest.py"))
MANIFEST = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MANIFEST)


class BackupManifestTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        cls.root = Path(cls.directory.name)
        for name in ["recipient", "signer", "attacker"]:
            subprocess.run(
                ["openssl", "req", "-x509", "-newkey", "rsa:3072", "-nodes",
                 "-keyout", str(cls.root / (name + ".key")), "-out", str(cls.root / (name + ".crt")),
                 "-subj", "/CN=synthetic-manifest-fixture", "-days", "1"],
                check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            subprocess.run(
                ["openssl", "pkey", "-in", str(cls.root / (name + ".key")), "-pubout",
                 "-out", str(cls.root / (name + ".pub"))],
                check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )

    @classmethod
    def tearDownClass(cls):
        cls.directory.cleanup()

    def setUp(self):
        self.work = tempfile.TemporaryDirectory()
        self.path = Path(self.work.name)
        self.source = self.path / "fixture.dump"
        self.source.write_bytes(b"PGDMP synthetic isolated fixture")
        self.ciphertext = self.path / "fixture.cms"
        MANIFEST.FILES.transform("encrypt", self.source, self.ciphertext, self.root / "recipient.crt")
        self.manifest = self.path / "manifest.json"
        self.sign()
        self.context = dict(
            ciphertext=self.ciphertext, manifest_path=self.manifest, public_key=self.root / "signer.pub",
            expected_signer=MANIFEST.fingerprint(self.root / "signer.pub"),
            expected_recipient=MANIFEST.fingerprint(self.root / "recipient.crt", certificate=True),
            backup_id="fixture-20261105-001", application_sha="a" * 40,
            boundary="BEFORE_WITHDRAWAL_COMMIT", not_before="2026-11-05T08:00:00Z",
            not_after="2026-11-05T09:00:00Z", now=datetime(2026, 11, 5, 10, tzinfo=timezone.utc),
        )

    def tearDown(self):
        self.work.cleanup()

    def sign(self, signer="signer", created_at="2026-11-05T08:30:00Z", private_key=None, passphrase=None):
        return MANIFEST.sign(
            self.ciphertext, self.manifest, self.root / (signer + ".pub"),
            private_key or self.root / (signer + ".key"), self.root / "recipient.crt",
            "fixture-20261105-001", "a" * 40, "BEFORE_WITHDRAWAL_COMMIT", created_at, passphrase,
        )

    def verify(self, **changes):
        return MANIFEST.verify(**{**self.context, **changes})

    def envelope(self):
        return json.loads(self.manifest.read_bytes())

    def test_real_signature_context_and_ciphertext_round_trip(self):
        verified = self.verify()
        self.assertEqual(verified["backupId"], self.context["backup_id"])
        self.assertEqual(self.manifest.stat().st_mode & 0o777, 0o600)
        recovered = self.path / "verified.dump"
        MANIFEST.FILES.transform("decrypt", self.ciphertext, recovered,
                                 self.root / "recipient.crt", self.root / "recipient.key")
        self.assertEqual(recovered.read_bytes(), self.source.read_bytes())

    def test_metadata_tampering_is_rejected(self):
        original = self.envelope()
        for field, value in [("backupId", "different"), ("createdAt", "2026-11-05T08:45:00Z"),
                             ("cipherSha256", "b" * 64), ("cipherBytes", 1)]:
            with self.subTest(field=field):
                changed = copy.deepcopy(original)
                changed["manifest"][field] = value
                self.manifest.write_text(json.dumps(changed))
                with self.assertRaises(ValueError):
                    self.verify()

    def test_signature_tampering_is_rejected(self):
        envelope = self.envelope()
        signature = bytearray.fromhex(envelope["signature"])
        signature[0] ^= 1
        envelope["signature"] = signature.hex()
        self.manifest.write_text(json.dumps(envelope))
        with self.assertRaises(ValueError):
            self.verify()

    def test_valid_attacker_signature_cannot_replace_pinned_signer(self):
        self.manifest.unlink()
        self.sign(signer="attacker")
        with self.assertRaisesRegex(ValueError, "UNTRUSTED_SIGNER"):
            self.verify(public_key=self.root / "attacker.pub")

    def test_independent_context_is_required_even_with_valid_signature(self):
        for field, value in [("backup_id", "other-backup"), ("application_sha", "b" * 40),
                             ("boundary", "AFTER_WITHDRAWAL_COMMIT"), ("expected_recipient", "0" * 64)]:
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "BACKUP_CONTEXT_MISMATCH"):
                self.verify(**{field: value})

    def test_signed_old_or_future_backup_and_inverted_window_are_rejected(self):
        for created_at in ["2026-11-04T08:30:00Z", "2026-11-06T08:30:00Z"]:
            self.manifest.unlink()
            self.sign(created_at=created_at)
            with self.assertRaisesRegex(ValueError, "TIME_WINDOW"):
                self.verify()
        with self.assertRaises(ValueError):
            self.verify(not_before="2026-11-07T08:00:00Z")

    def test_future_approval_window_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "TIME_WINDOW"):
            self.verify(not_after="2026-11-06T08:00:00Z")

    def test_ciphertext_swap_corruption_and_truncation_are_rejected(self):
        original = self.ciphertext.read_bytes()
        for data in [original[:-1], original + b"unexpected", original[:100] + b"changed" + original[107:]]:
            self.ciphertext.write_bytes(data)
            with self.assertRaisesRegex(ValueError, "CIPHERTEXT_MISMATCH"):
                self.verify()

    def test_duplicate_unknown_and_oversized_manifest_are_rejected(self):
        original = self.manifest.read_text()
        envelope = self.envelope()
        envelope["manifest"]["unexpected"] = True
        for text in [original.replace('"version":1', '"version":1,"version":1'),
                     json.dumps(envelope), " " * 65537]:
            self.manifest.write_text(text)
            with self.assertRaises(ValueError):
                self.verify()

    def test_unrecognized_signature_algorithm_and_boolean_version_are_rejected(self):
        for field in ["algorithm", "version"]:
            envelope = self.envelope()
            if field == "algorithm":
                envelope[field] = "RSA-PKCS1"
            else:
                envelope["algorithm"] = MANIFEST.ALGORITHM
                envelope["manifest"][field] = True
            self.manifest.write_text(json.dumps(envelope))
            with self.assertRaises(ValueError):
                self.verify()

    def test_missing_files_and_symlinks_are_rejected(self):
        link = self.path / "link.json"
        link.symlink_to(self.manifest)
        with self.assertRaises(OSError):
            self.verify(manifest_path=link)
        with self.assertRaises(OSError):
            self.verify(public_key=self.path / "missing.pub")

    def test_existing_output_is_preserved(self):
        original = self.manifest.read_bytes()
        with self.assertRaises(ValueError):
            self.sign()
        self.assertEqual(self.manifest.read_bytes(), original)
        self.assertEqual(list(self.path.glob(".manifest-private-*")), [])

    def test_mismatched_or_unsafe_signing_key_publishes_nothing(self):
        self.manifest.unlink()
        with self.assertRaises(ValueError):
            self.sign(private_key=self.root / "attacker.key")
        unsafe = self.path / "unsafe.key"
        unsafe.write_bytes((self.root / "signer.key").read_bytes())
        unsafe.chmod(0o640)
        with self.assertRaisesRegex(ValueError, "UNSAFE_INPUT_FILE"):
            self.sign(private_key=unsafe)
        self.assertFalse(self.manifest.exists())

    def test_password_protected_signing_key(self):
        self.manifest.unlink()
        password = self.path / "password"
        password.write_text("synthetic-manifest-passphrase\n")
        password.chmod(0o600)
        protected = self.path / "protected.key"
        subprocess.run(
            ["openssl", "pkey", "-in", str(self.root / "signer.key"), "-aes-256-cbc",
             "-passout", "file:" + str(password), "-out", str(protected)],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        protected.chmod(0o600)
        self.sign(private_key=protected, passphrase=password)
        self.verify()

    def test_weak_signer_is_rejected(self):
        self.manifest.unlink()
        key = self.path / "weak.key"
        public = self.path / "weak.pub"
        subprocess.run(
            ["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048", "-out", str(key)],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        subprocess.run(
            ["openssl", "pkey", "-in", str(key), "-pubout", "-out", str(public)],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        key.chmod(0o600)
        with self.assertRaisesRegex(ValueError, "RSA_3072_SIGNER_REQUIRED"):
            MANIFEST.sign(self.ciphertext, self.manifest, public, key, self.root / "recipient.crt",
                          "fixture", "a" * 40, "BEFORE_WITHDRAWAL_COMMIT", "2026-11-05T08:30:00Z")
        self.assertFalse(self.manifest.exists())

    def test_unauthenticated_ciphertext_cannot_be_signed(self):
        self.manifest.unlink()
        self.ciphertext.write_bytes(b"not an authenticated CMS envelope")
        with self.assertRaisesRegex(ValueError, "AUTHENTICATED_CMS_REQUIRED"):
            self.sign()
        self.assertFalse(self.manifest.exists())

    def test_cli_refuses_missing_trust_inputs_without_creating_a_receipt(self):
        result = subprocess.run(
            ["python3", str(Path(__file__).with_name("backup-manifest.py")), "verify", "--input", str(self.ciphertext),
             "--manifest", str(self.manifest), "--public-key", str(self.root / "signer.pub"),
             "--backup-id", "fixture-20261105-001", "--application-sha", "a" * 40,
             "--snapshot-boundary", "BEFORE_WITHDRAWAL_COMMIT"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stdout, b"")


if __name__ == "__main__":
    unittest.main()
