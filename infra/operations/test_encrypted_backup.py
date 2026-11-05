import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SPEC = importlib.util.spec_from_file_location("backup", Path(__file__).with_name("encrypted-backup.py"))
BACKUP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BACKUP)


class EncryptedBackupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        cls.root = Path(cls.directory.name)
        for name, bits in [("owner", 3072), ("other", 3072), ("weak", 2048)]:
            subprocess.run(
                ["openssl", "req", "-x509", "-newkey", f"rsa:{bits}", "-nodes",
                 "-keyout", str(cls.root / (name + ".key")), "-out", str(cls.root / (name + ".crt")),
                 "-subj", "/CN=synthetic-offline-fixture", "-days", "1"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True,
            )

    @classmethod
    def tearDownClass(cls):
        cls.directory.cleanup()

    def setUp(self):
        self.work = tempfile.TemporaryDirectory()
        self.path = Path(self.work.name)
        self.source = self.path / "source.dump"
        self.source.write_bytes(b"PGDMP" + os.urandom(2 * 1024 * 1024))
        self.encrypted = self.path / "snapshot.cms"
        self.output = self.path / "restored.dump"

    def tearDown(self):
        self.work.cleanup()

    def encrypt(self, cert="owner"):
        BACKUP.transform("encrypt", self.source, self.encrypted, self.root / (cert + ".crt"))

    def decrypt(self, key="owner"):
        BACKUP.transform("decrypt", self.encrypted, self.output, self.root / "owner.crt", self.root / (key + ".key"))

    def assert_no_plaintext(self):
        self.assertFalse(self.output.exists())
        self.assertEqual(list(self.path.glob(".backup-private-*")), [])

    def test_streamed_round_trip_and_private_permissions(self):
        self.encrypt()
        self.decrypt()
        self.assertEqual(self.output.read_bytes(), self.source.read_bytes())
        self.assertNotIn(self.source.read_bytes()[:64], self.encrypted.read_bytes())
        self.assertEqual(self.output.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.encrypted.stat().st_mode & 0o777, 0o600)

    def test_fresh_random_encryption(self):
        self.encrypt()
        first = self.encrypted.read_bytes()
        self.encrypted.unlink()
        self.encrypt()
        self.assertNotEqual(first, self.encrypted.read_bytes())

    def test_ciphertext_tampering_publishes_nothing(self):
        self.encrypt()
        data = bytearray(self.encrypted.read_bytes())
        data[len(data) // 2] ^= 1
        self.encrypted.write_bytes(data)
        with self.assertRaises(ValueError):
            self.decrypt()
        self.assert_no_plaintext()

    def test_truncation_publishes_nothing(self):
        self.encrypt()
        self.encrypted.write_bytes(self.encrypted.read_bytes()[:-30])
        with self.assertRaises(ValueError):
            self.decrypt()
        self.assert_no_plaintext()

    def test_wrong_private_key_publishes_nothing(self):
        self.encrypt()
        with self.assertRaises(ValueError):
            self.decrypt("other")
        self.assert_no_plaintext()

    def test_existing_destination_is_preserved(self):
        self.encrypt()
        self.output.write_bytes(b"existing recovery")
        with self.assertRaises(ValueError):
            self.decrypt()
        self.assertEqual(self.output.read_bytes(), b"existing recovery")

    def test_symlink_destination_is_preserved(self):
        self.encrypt()
        self.output.symlink_to(self.source)
        before = self.source.read_bytes()
        with self.assertRaises(ValueError):
            self.decrypt()
        self.assertEqual(self.source.read_bytes(), before)

    def test_symlink_input_is_rejected(self):
        link = self.path / "link"
        link.symlink_to(self.source)
        with self.assertRaises(OSError):
            BACKUP.transform("encrypt", link, self.encrypted, self.root / "owner.crt")
        self.assertFalse(self.encrypted.exists())

    def test_weak_recipient_is_rejected(self):
        with self.assertRaises(ValueError):
            self.encrypt("weak")
        self.assertFalse(self.encrypted.exists())

    def test_group_readable_private_key_is_rejected(self):
        self.encrypt()
        key = self.path / "unsafe.key"
        key.write_bytes((self.root / "owner.key").read_bytes())
        key.chmod(0o640)
        with self.assertRaises(ValueError):
            BACKUP.transform("decrypt", self.encrypted, self.output, self.root / "owner.crt", key)
        self.assert_no_plaintext()

    def test_unauthenticated_cbc_is_rejected(self):
        subprocess.run(
            ["openssl", "cms", "-encrypt", "-aes-256-cbc", "-binary", "-outform", "DER",
             "-in", str(self.source), "-out", str(self.encrypted), str(self.root / "owner.crt")],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        with self.assertRaisesRegex(ValueError, "AUTHENTICATED_CMS_REQUIRED"):
            self.decrypt()
        self.assert_no_plaintext()

    def test_encrypted_private_key(self):
        self.encrypt()
        password = self.path / "passphrase"
        password.write_text("synthetic-fixture-passphrase\n")
        password.chmod(0o600)
        key = self.path / "protected.key"
        subprocess.run(
            ["openssl", "pkey", "-in", str(self.root / "owner.key"), "-aes-256-cbc",
             "-passout", "file:" + str(password), "-out", str(key)],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        key.chmod(0o600)
        BACKUP.transform("decrypt", self.encrypted, self.output, self.root / "owner.crt", key, password)
        self.assertEqual(self.output.read_bytes(), self.source.read_bytes())


if __name__ == "__main__":
    unittest.main()
