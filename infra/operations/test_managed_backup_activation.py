import importlib.util
import json
from pathlib import Path
import tempfile
import types
import unittest


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(path))
    result = importlib.util.module_from_spec(spec); spec.loader.exec_module(result)
    return result


ACT = module("activation", "activate-managed-backup.py")
INSTALLER = module("helper", "install-managed-backup.py")


class ManagedActivationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(dir=Path.home())
        self.root = Path(self.temporary.name)
        self.request = {"request_id": "orzell-managed-backup-activation-20261106-1", "mode": "first-backup-and-enable-timers", "release": "a" * 40, "signer": "b" * 64}
        settings = {"version": 1, "recipient": INSTALLER.PIN, "signer": self.request["signer"], "application": INSTALLER.APPLICATION, "image": INSTALLER.IMAGE, "release": self.request["release"]}
        definitions = INSTALLER.units(self.root / "releases" / self.request["release"], self.root)
        self.helper = types.SimpleNamespace(PIN=INSTALLER.PIN, APPLICATION=INSTALLER.APPLICATION, IMAGE=INSTALLER.IMAGE,
            units=INSTALLER.units, directory=INSTALLER.directory, publish=INSTALLER.publish,
            services=lambda execute: {"source": "same"},
            existing=lambda path, **kwargs: json.dumps(settings).encode() if path.name == "managed-config.json" else definitions[path.name].encode())
        self.calls, self.healthy, self.active = [], True, True

    def tearDown(self):
        self.temporary.cleanup()

    def execute(self, args, **kwargs):
        self.calls.append(args)
        if args[0] == "/usr/bin/python3":
            return json.dumps({"healthy": self.healthy, "lastAttemptStatus": "SUCCESS" if self.healthy else "FAILED", "lastSuccessAt": "synthetic"}).encode()
        if args[:2] == ["systemctl", "is-enabled"]:
            return b"enabled"
        if args[:2] == ["systemctl", "is-active"]:
            return b"active" if self.active else b"inactive"
        return b""

    def test_successful_first_backup_precedes_timer_activation(self):
        result = ACT.activate(self.request, self.helper, execute=self.execute, root=self.root)
        self.assertEqual(result["status"], "MANAGED_BACKUP_ACTIVE")
        first = self.calls.index(["systemctl", "start", "orzell-database-backup.service"])
        enabled = next(i for i, call in enumerate(self.calls) if call[:2] == ["systemctl", "enable"])
        self.assertLess(first, enabled)
        with self.assertRaisesRegex(ValueError, "NO_RETRY"):
            ACT.activate(self.request, self.helper, execute=self.execute, root=self.root)

    def test_failed_first_backup_never_enables_timers(self):
        self.healthy = False
        with self.assertRaisesRegex(ValueError, "NOT_HEALTHY"):
            ACT.activate(self.request, self.helper, execute=self.execute, root=self.root)
        self.assertFalse(any(call[:2] == ["systemctl", "enable"] for call in self.calls))

    def test_partial_timer_failure_disables_only_new_backup_timers(self):
        self.active = False
        with self.assertRaisesRegex(ValueError, "NOT_ENABLED"):
            ACT.activate(self.request, self.helper, execute=self.execute, root=self.root)
        self.assertIn(["systemctl", "disable", "--now", *ACT.TIMERS], self.calls)


if __name__ == "__main__":
    unittest.main()
