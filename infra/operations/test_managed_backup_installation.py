import hashlib
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location("installer", Path(__file__).with_name("install-managed-backup.py"))
INSTALLER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(INSTALLER)


class ManagedInstallationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(dir=Path.home())
        self.base = Path(self.temporary.name)
        self.root, self.units = self.base / "backup", self.base / "units"
        (self.root / "trust").mkdir(mode=0o700, parents=True)
        self.root.chmod(0o700)
        self.units.mkdir(mode=0o700)
        cert = self.root / "trust/orzell-recovery-241abc0895734f65.crt"
        cert.write_bytes((Path(__file__).parents[2] / ".github/operations/backup-recipient-20261105.pem").read_bytes()); cert.chmod(0o600)
        self.contents = {name: Path(__file__).with_name(name).read_bytes() for name in INSTALLER.FILES}
        self.manifest = {"source": "b" * 40, "files": {name: hashlib.sha256(value).hexdigest() for name, value in self.contents.items()}}
        self.calls = []
        self.real_run = subprocess.run
        def query(args, *positional, **kwargs):
            if args[:2] == ["systemctl", "is-enabled"]:
                return subprocess.CompletedProcess(args, 1, b"disabled\n", b"")
            if args[:2] == ["systemctl", "is-active"]:
                return subprocess.CompletedProcess(args, 3, b"inactive\n", b"")
            return self.real_run(args, *positional, **kwargs)
        self.query_patch = patch.object(INSTALLER.subprocess, "run", side_effect=query)
        self.query_patch.start()

    def tearDown(self):
        self.query_patch.stop()
        self.temporary.cleanup()

    def execute(self, args):
        self.calls.append(args)
        if args[0] == "openssl":
            result = self.real_run(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=True)
            return result.stdout
        if args[:2] == ["docker", "inspect"]:
            return ("a" * 64 + "|" + INSTALLER.IMAGE + "|0|fixture|true|false").encode()
        if args[:2] in [["systemd-analyze", "verify"], ["systemctl", "daemon-reload"]]:
            return b""
        raise AssertionError("Unexpected installation command")

    def install(self, fetch=None):
        return INSTALLER.install(self.manifest, self.root, self.units,
                                 fetch=fetch or (lambda url: self.contents[url.rsplit('/', 1)[1]]), execute=self.execute)

    def test_real_signer_and_disabled_units_are_prepared_without_backup(self):
        report = self.install()
        self.assertEqual(report["status"], "MANAGED_BACKUP_PREPARED_DISABLED")
        self.assertFalse(report["timersEnabled"])
        self.assertFalse(report["databaseBackupStarted"])
        self.assertNotIn("PRIVATE KEY", report["signerPublicPem"])
        self.assertEqual((self.root / "signing/signer.key").stat().st_mode & 0o777, 0o600)
        self.assertTrue((self.units / "orzell-database-backup.timer").is_file())
        self.assertFalse(any("start" in call or "enable" in call for call in self.calls))
        self.assertFalse(any("pg_dump" in str(call) for call in self.calls))
        self.assertEqual(self.install()["signerPublicSha256"], report["signerPublicSha256"])

    def test_wrong_source_bytes_stop_before_signer_or_units(self):
        with self.assertRaisesRegex(ValueError, "TOOL_BYTES"):
            self.install(fetch=lambda url: b"unexpected")
        self.assertFalse((self.root / "signing").exists())
        self.assertEqual(list(self.units.iterdir()), [])

    def test_unknown_existing_unit_is_never_overwritten(self):
        target = self.units / "orzell-database-backup.timer"
        target.write_text("existing unrelated unit")
        with self.assertRaisesRegex(ValueError, "EXISTING_INSTALLATION"):
            self.install()
        self.assertEqual(target.read_text(), "existing unrelated unit")

    def test_partial_signer_requires_inspection_and_preserves_bytes(self):
        (self.root / "signing").mkdir(mode=0o700)
        key = self.root / "signing/signer.key"
        key.write_text("keep partial key"); key.chmod(0o600)
        with self.assertRaisesRegex(ValueError, "PARTIAL_SIGNER"):
            self.install()
        self.assertEqual(key.read_text(), "keep partial key")

    def test_calendar_and_limits_are_accepted_by_real_systemd_parser(self):
        result = self.real_run(["systemd-analyze", "calendar", "*-*-* 00:00:00 UTC"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.assertEqual(result.returncode, 0)
        definitions = INSTALLER.units(Path("/opt/epifiz/backup/releases/" + "b" * 40))
        self.assertIn("Persistent=true", definitions["orzell-database-backup.timer"])
        self.assertIn("MemoryMax=384M", definitions["orzell-database-backup.service"])
        self.assertIn("KillMode=control-group", definitions["orzell-database-backup.service"])


if __name__ == "__main__":
    unittest.main()
