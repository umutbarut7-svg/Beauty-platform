from contextlib import ExitStack
import importlib.util
import io
from pathlib import Path
import stat
import struct
import unittest
from unittest.mock import patch
import warnings
import zipfile

import test_backup_manifest as fixtures


SPEC = importlib.util.spec_from_file_location("package", Path(__file__).with_name("recover-backup-package.py"))
PACKAGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PACKAGE)


class BackupPackageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixtures.BackupManifestTests.setUpClass()
        cls.root = fixtures.BackupManifestTests.root

    @classmethod
    def tearDownClass(cls):
        fixtures.BackupManifestTests.tearDownClass()

    tearDown = fixtures.BackupManifestTests.tearDown
    sign = fixtures.BackupManifestTests.sign

    def setUp(self):
        fixtures.BackupManifestTests.setUp(self)
        self.package = self.path / "package.zip"
        self.output = self.path / "recovered.dump"
        self.write()

    def write(self, entries=None, compression=zipfile.ZIP_STORED, comment=b""):
        if entries is None:
            entries = [("backup.cms", self.ciphertext.read_bytes()), ("manifest.json", self.manifest.read_bytes())]
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            with zipfile.ZipFile(self.package, "w", compression=compression) as archive:
                archive.comment = comment
                for name, content in entries:
                    archive.writestr(name, content)

    def recover(self, **changes):
        context = {key: value for key, value in self.context.items() if key not in ["ciphertext", "manifest_path"]}
        return PACKAGE.recover(**{**context, "package": self.package, "output": self.output,
                                  "certificate": self.root / "recipient.crt", "private_key": self.root / "recipient.key",
                                  "max_package_bytes": 1024 * 1024, "max_cipher_bytes": 512 * 1024, **changes})

    def rejected_before_decrypt(self, **changes):
        with patch.object(PACKAGE.VERIFIED, "decrypt") as decrypt:
            with self.assertRaises((ValueError, zipfile.BadZipFile)):
                self.recover(**changes)
            decrypt.assert_not_called()
        self.assertFalse(self.output.exists())

    def test_real_signed_cms_package_decrypts_in_private_directory(self):
        self.recover()
        self.assertEqual(self.output.read_bytes(), self.source.read_bytes())
        self.assertEqual(self.output.stat().st_mode & 0o777, 0o600)

    def test_traversal_extra_missing_and_duplicate_names_are_rejected(self):
        good = [("backup.cms", self.ciphertext.read_bytes()), ("manifest.json", self.manifest.read_bytes())]
        for entries in [good + [("../escaped.dump", b"bad")], good[:1], good + [good[0]],
                        [("../backup.cms", good[0][1]), good[1]]]:
            self.write(entries)
            self.rejected_before_decrypt()

    def test_nul_filename_is_rejected(self):
        self.package.write_bytes(self.package.read_bytes().replace(b"backup.cms", b"backup.cm\x00"))
        self.rejected_before_decrypt()

    def test_compressed_archive_comments_and_symlinks_are_rejected(self):
        self.write(compression=zipfile.ZIP_DEFLATED)
        self.rejected_before_decrypt()
        self.write(comment=b"unexpected archive comment")
        self.rejected_before_decrypt()
        link = zipfile.ZipInfo("backup.cms")
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        self.write([(link, b"target"), ("manifest.json", self.manifest.read_bytes())])
        self.rejected_before_decrypt()

    def test_actual_package_and_declared_member_limits_are_enforced(self):
        self.rejected_before_decrypt(max_package_bytes=100, max_cipher_bytes=100)
        self.rejected_before_decrypt(max_cipher_bytes=1)
        self.write([("backup.cms", self.ciphertext.read_bytes()), ("manifest.json", b"x" * (PACKAGE.MAX_MANIFEST + 1))])
        self.rejected_before_decrypt()

    def test_malformed_large_directory_and_crc_failure_are_rejected(self):
        original = self.package.read_bytes()
        malformed = bytearray(original)
        struct.pack_into("<L", malformed, len(malformed) - 10, 5000)
        self.package.write_bytes(malformed)
        self.rejected_before_decrypt()
        self.package.write_bytes(original)
        with zipfile.ZipFile(self.package) as archive:
            entry = archive.getinfo("backup.cms")
            offset = entry.header_offset + 30 + len(entry.filename)
        malformed = bytearray(original)
        malformed[offset + 10] ^= 1
        self.package.write_bytes(malformed)
        self.rejected_before_decrypt()

    def test_signature_or_context_failure_publishes_no_plaintext(self):
        with self.assertRaises(ValueError):
            self.recover(expected_signer="0" * 64)
        self.assertFalse(self.output.exists())
        self.assertEqual(list(self.path.glob(".backup-private-*")), [])
        self.write([("backup.cms", self.ciphertext.read_bytes()), ("manifest.json", b"{}")])
        with self.assertRaises(ValueError):
            self.recover()
        self.assertFalse(self.output.exists())

    def test_private_directory_and_existing_output_are_required(self):
        self.path.chmod(0o755)
        self.rejected_before_decrypt()
        self.path.chmod(0o700)
        self.output.write_bytes(b"keep")
        with self.assertRaisesRegex(ValueError, "OUTPUT_ALREADY_EXISTS"):
            self.recover()
        self.assertEqual(self.output.read_bytes(), b"keep")

    def test_input_path_replacement_does_not_change_sealed_package(self):
        original_members = PACKAGE.members
        def replace(stream, limit):
            self.package.unlink()
            self.package.write_bytes(b"replacement")
            return original_members(stream, limit)
        with patch.object(PACKAGE, "members", side_effect=replace):
            self.recover()
        self.assertEqual(self.output.read_bytes(), self.source.read_bytes())

    def test_stream_cap_applies_to_actual_bytes_and_invalid_limits(self):
        with ExitStack() as stack:
            with self.assertRaisesRegex(ValueError, "SIZE_LIMIT"):
                PACKAGE.VERIFIED.snapshot_stream(stack, io.BytesIO(b"abcdef"), max_bytes=5)
        for value in [0, -1, True, PACKAGE.HARD_PACKAGE_LIMIT + 1]:
            self.rejected_before_decrypt(max_package_bytes=value)


if __name__ == "__main__":
    unittest.main()
