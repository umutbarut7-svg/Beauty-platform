from datetime import datetime, timezone
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location("recipient", Path(__file__).with_name("install-backup-recipient.py"))
RECIPIENT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RECIPIENT)
CERTIFICATE = (Path(__file__).parents[2] / ".github/operations/backup-recipient-20261105.pem").read_text()


class RecipientInstallationTests(unittest.TestCase):
    def setUp(self):
        # Avoid permitting the container's writable /workspace ancestor. Home is
        # private to the current user on both the local and GitHub test hosts.
        self.directory = tempfile.TemporaryDirectory(dir=Path.home())
        self.root = Path(self.directory.name) / "backup"

    def tearDown(self):
        self.directory.cleanup()

    def test_exact_public_certificate_install_and_idempotent_retry(self):
        self.assertEqual(RECIPIENT.install(CERTIFICATE, self.root), "PUBLIC_RECIPIENT_INSTALLED")
        target = self.root / "trust" / (RECIPIENT.KEY_ID + ".crt")
        self.assertEqual(target.read_text(), CERTIFICATE)
        self.assertEqual(target.stat().st_mode & 0o777, 0o600)
        self.assertEqual(RECIPIENT.install(CERTIFICATE, self.root), "ALREADY_INSTALLED")
        self.assertEqual(list(target.parent.glob(".recipient-*")), [])

    def test_private_key_or_extra_pem_never_reaches_write(self):
        for content in [CERTIFICATE + "-----BEGIN PRIVATE KEY-----\nAA==\n-----END PRIVATE KEY-----\n", CERTIFICATE + CERTIFICATE]:
            with self.assertRaisesRegex(ValueError, "PUBLIC_CERTIFICATE"):
                RECIPIENT.install(content, self.root)
            self.assertFalse(self.root.exists())

    def test_pin_mismatch_prevents_directory_creation(self):
        with patch.object(RECIPIENT, "PIN", "0" * 64):
            with self.assertRaisesRegex(ValueError, "PIN_MISMATCH"):
                RECIPIENT.install(CERTIFICATE, self.root)
        self.assertFalse(self.root.exists())

    def test_not_yet_valid_and_expired_certificate_are_rejected(self):
        for year in [2020, 2040]:
            with self.assertRaisesRegex(ValueError, "NOT_CURRENT"):
                RECIPIENT.validate(CERTIFICATE, now=datetime(year, 1, 1, tzinfo=timezone.utc))

    def test_symlink_directory_and_final_file_are_never_followed(self):
        real = Path(self.directory.name) / "real"
        real.mkdir()
        self.root.symlink_to(real, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "UNSAFE_DIRECTORY"):
            RECIPIENT.install(CERTIFICATE, self.root)
        self.root.unlink()
        RECIPIENT.install(CERTIFICATE, self.root)
        target = self.root / "trust" / (RECIPIENT.KEY_ID + ".crt")
        target.unlink()
        outside = real / "unchanged"
        outside.write_text("keep")
        target.symlink_to(outside)
        with self.assertRaises(OSError):
            RECIPIENT.install(CERTIFICATE, self.root)
        self.assertEqual(outside.read_text(), "keep")

    def test_changed_or_world_readable_existing_certificate_is_not_overwritten(self):
        RECIPIENT.install(CERTIFICATE, self.root)
        target = self.root / "trust" / (RECIPIENT.KEY_ID + ".crt")
        target.chmod(0o644)
        with self.assertRaisesRegex(ValueError, "EXISTING_RECIPIENT"):
            RECIPIENT.install(CERTIFICATE, self.root)
        target.chmod(0o600)
        target.write_text("changed")
        with self.assertRaisesRegex(ValueError, "EXISTING_RECIPIENT"):
            RECIPIENT.install(CERTIFICATE, self.root)
        self.assertEqual(target.read_text(), "changed")

    def test_unsafe_parent_permission_prevents_installation(self):
        self.root.mkdir(mode=0o777)
        self.root.chmod(0o777)
        with self.assertRaisesRegex(ValueError, "UNSAFE_DIRECTORY"):
            RECIPIENT.install(CERTIFICATE, self.root)

    def test_service_snapshot_reads_no_environment_and_rejects_changed_release(self):
        calls = []
        def read(args):
            calls.append(args)
            return ("a" * 64 + "|" + RECIPIENT.IMAGE + "|0|2026-11-05T00:00:00Z|true|false").encode()
        self.assertEqual(set(RECIPIENT.services(read)), {"api", "worker", "postgres"})
        self.assertTrue(all(call[:2] == ["docker", "inspect"] for call in calls))
        self.assertTrue(all("Env" not in str(call) for call in calls))
        with self.assertRaisesRegex(ValueError, "SERVICES_DIFFER"):
            RECIPIENT.services(lambda args: b"unexpected")


if __name__ == "__main__":
    unittest.main()
