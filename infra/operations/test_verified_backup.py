import importlib.util
import os
from pathlib import Path
import unittest
from unittest.mock import patch

import test_backup_manifest as fixtures


SPEC = importlib.util.spec_from_file_location("verified", Path(__file__).with_name("verified-backup.py"))
VERIFIED = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFIED)


class VerifiedBackupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixtures.BackupManifestTests.setUpClass()
        cls.root = fixtures.BackupManifestTests.root

    @classmethod
    def tearDownClass(cls):
        fixtures.BackupManifestTests.tearDownClass()

    setUp = fixtures.BackupManifestTests.setUp
    tearDown = fixtures.BackupManifestTests.tearDown
    sign = fixtures.BackupManifestTests.sign

    def recover(self, **changes):
        self.output = self.path / "recovered.dump"
        return VERIFIED.decrypt(**{**self.context, "certificate": self.root / "recipient.crt",
                                   "private_key": self.root / "recipient.key", "output": self.output, **changes})

    def test_round_trip_and_private_output(self):
        self.recover()
        self.assertEqual(self.output.read_bytes(), self.source.read_bytes())
        self.assertEqual(self.output.stat().st_mode & 0o777, 0o600)

    def test_path_replacement_after_verification_cannot_change_consumed_bytes(self):
        original_verify = VERIFIED.MANIFEST.verify
        def replace_after_verify(*args, **kwargs):
            result = original_verify(*args, **kwargs)
            self.ciphertext.unlink()
            self.ciphertext.write_bytes(b"replacement after successful verification")
            return result
        with patch.object(VERIFIED.MANIFEST, "verify", side_effect=replace_after_verify):
            self.recover()
        self.assertEqual(self.output.read_bytes(), self.source.read_bytes())

    def test_kernel_rejects_writes_and_truncation_before_decryption(self):
        original_transform = VERIFIED.MANIFEST.FILES.transform
        def inspect(mode, source, *args):
            with self.assertRaises(OSError):
                os.write(source, b"tamper")
            with self.assertRaises(OSError):
                os.ftruncate(source, 0)
            return original_transform(mode, source, *args)
        with patch.object(VERIFIED.MANIFEST.FILES, "transform", side_effect=inspect):
            self.recover()
        self.assertEqual(self.output.read_bytes(), self.source.read_bytes())

    def test_invalid_trust_never_decrypts_or_publishes(self):
        with patch.object(VERIFIED.MANIFEST.FILES, "transform") as transform:
            with self.assertRaises(ValueError):
                self.recover(expected_signer="0" * 64)
            transform.assert_not_called()
        self.assertFalse(self.output.exists())

    def test_actual_recipient_certificate_must_match_pin(self):
        with patch.object(VERIFIED.MANIFEST.FILES, "transform") as transform:
            with self.assertRaisesRegex(ValueError, "UNTRUSTED_RECIPIENT"):
                self.recover(certificate=self.root / "attacker.crt")
            transform.assert_not_called()
        self.assertFalse(self.output.exists())

    def test_wrong_key_publishes_no_plaintext_and_cleans_temporary_file(self):
        with self.assertRaises(ValueError):
            self.recover(private_key=self.root / "attacker.key")
        self.assertFalse(self.output.exists())
        self.assertEqual(list(self.path.glob(".backup-private-*")), [])

    def test_fifo_is_rejected_without_waiting_for_writer(self):
        fifo = self.path / "fifo"
        os.mkfifo(fifo)
        with self.assertRaisesRegex(ValueError, "UNSAFE_INPUT"):
            self.recover(ciphertext=fifo)

    def test_unsafe_original_private_key_is_rejected_before_snapshot(self):
        key = self.path / "unsafe.key"
        key.write_bytes((self.root / "recipient.key").read_bytes())
        key.chmod(0o644)
        with self.assertRaisesRegex(ValueError, "UNSAFE_INPUT"):
            self.recover(private_key=key)


if __name__ == "__main__":
    unittest.main()
