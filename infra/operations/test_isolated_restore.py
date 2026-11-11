import copy
from contextlib import ExitStack
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location("isolated_restore", Path(__file__).with_name("restore-backup-isolated.py"))
RESTORE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RESTORE)


class FakeDocker:
    def __init__(self):
        self.calls = []
        self.name = None
        self.body = None
        self.started = False
        self.removed = False
        self.marker = RESTORE.MARKER
        self.cleanup_error = False
        self.image = {"Id": "sha256:" + "a" * 64, "RepoDigests": [RESTORE.IMAGE], "Config": {"Env": ["LANG=C.UTF-8"]}}

    def value(self):
        return {"Name": "/" + self.name, "Image": self.image["Id"], "Mounts": [],
                "Config": {"Labels": {RESTORE.LABEL: "true"}, "User": "999:999", "OpenStdin": True,
                           "Entrypoint": ["/bin/sh"], "Cmd": ["-ec", self.body], "Env": self.image["Config"]["Env"]},
                "HostConfig": {"NetworkMode": "none", "IpcMode": "private", "ReadonlyRootfs": True, "CapDrop": ["ALL"],
                               "SecurityOpt": ["no-new-privileges:true"], "Tmpfs": RESTORE.TMPFS,
                               "Memory": RESTORE.RAM, "MemorySwap": RESTORE.RAM, "PidsLimit": 128,
                               "NanoCpus": 1000000000, "LogConfig": {"Type": "none"}, "RestartPolicy": {"Name": "no"},
                               "Ulimits": [{"Name": "core", "Soft": 0, "Hard": 0}]},
                "State": {"Status": "exited" if self.started else "created", "ExitCode": 0, "OOMKilled": False}}

    def __call__(self, *args, **kwargs):
        self.calls.append(args)
        if args[:2] == ("image", "inspect"):
            return json.dumps([self.image])
        if args[0] == "create":
            self.name = args[args.index("--name") + 1]
            self.body = args[-1]
            return "generated-id"
        if args[0] == "inspect":
            return json.dumps([self.value()])
        if args[0] == "start":
            self.started = True
            assert kwargs["stdin"].read() == b"PGDMP synthetic dump"
            return self.marker
        if args[0] == "rm":
            if self.cleanup_error:
                raise ValueError("CLEANUP_FAILURE")
            self.removed = True
            return "removed"
        if args[0] == "ps":
            return "" if self.removed else "still-present"
        raise AssertionError("Unexpected operation")


class IsolatedRestoreTests(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.fd = RESTORE.MEMORY.VERIFIED.snapshot_stream(self.stack, io.BytesIO(b"PGDMP synthetic dump"), max_bytes=100)
        self.docker = FakeDocker()

    def tearDown(self):
        self.stack.close()

    def run_restore(self):
        return RESTORE._restore_sealed_dump(self.docker, self.fd, "b" * 64, 10)

    def test_isolation_checked_on_both_sides_and_unique_container_removed(self):
        result = self.run_restore()
        self.assertTrue(result["temporaryDatabaseRemoved"])
        self.assertFalse(result["realRecoveryReady"])
        self.assertTrue(self.docker.removed)
        self.assertEqual(sum(x[0] == "inspect" for x in self.docker.calls), 2)
        self.assertRegex(self.docker.name, r"^orzell-offline-restore-[0-9a-f]{32}$")

    def test_no_false_success_for_missing_marker_or_failed_cleanup(self):
        self.docker.marker = "anything else"
        with self.assertRaisesRegex(ValueError, "OFFLINE_RESTORE_NOT_VERIFIED"):
            self.run_restore()
        self.assertTrue(self.docker.removed)
        self.docker = FakeDocker()
        self.docker.cleanup_error = True
        with self.assertRaisesRegex(ValueError, "CLEANUP_FAILURE"):
            self.run_restore()

    def test_container_mount_ports_memory_credentials_and_core_drift_are_rejected(self):
        self.docker.name, self.docker.body = "test-name", RESTORE.script("b" * 64)
        original = self.docker.value()
        changes = [("HostConfig", "Binds", ["/host:/work"]), ("HostConfig", "PortBindings", {"5432/tcp": [{}]}),
                   ("HostConfig", "MemorySwap", RESTORE.RAM * 2), ("HostConfig", "NetworkMode", "host"),
                   ("HostConfig", "Ulimits", []), ("HostConfig", "LogConfig", {"Type": "json-file"}),
                   ("Config", "Env", ["AWS_SECRET_ACCESS_KEY=never-print"])]
        for area, key, value in changes:
            candidate = copy.deepcopy(original)
            candidate[area][key] = value
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, "RESTORE_ISOLATION_NOT_VERIFIED"):
                RESTORE.inspect_container(candidate, self.docker.name, self.docker.image["Id"], self.docker.body,
                                          self.docker.image["Config"]["Env"])

    def test_independent_schema_acknowledgement_and_budget_required_before_key_read(self):
        with patch.object(RESTORE.MEMORY, "verified_dump") as opened:
            for args in (({}, "invalid", 10, True), ({}, "b" * 64, 10, False),
                         ({"max_plaintext_bytes": 1}, "b" * 64, 0, True),
                         ({"max_plaintext_bytes": RESTORE.MAX_DUMP + 1}, "b" * 64, 10, True)):
                with self.subTest(args=args), self.assertRaises(ValueError):
                    RESTORE.recover_and_restore(*args)
            opened.assert_not_called()

    def test_unsealed_and_bad_magic_descriptors_stop_before_docker(self):
        descriptor = os.memfd_create("unsealed")
        try:
            os.write(descriptor, b"PGDMP unsealed")
            with self.assertRaisesRegex(ValueError, "SEALED_DUMP_REQUIRED"):
                RESTORE._restore_sealed_dump(self.docker, descriptor, "b" * 64, 10)
        finally:
            os.close(descriptor)
        self.assertEqual(self.docker.calls, [])

    def test_timeout_and_output_flood_do_not_return_private_output(self):
        for program, error in (("import os,time; os.write(1,b'private-value'); time.sleep(30)", "RESTORE_COMMAND_DEADLINE"),
                               ("import os;\nwhile True: os.write(1,b'private-value'*1024)", "RESTORE_OUTPUT_LIMIT")):
            with self.subTest(error=error), self.assertRaisesRegex(ValueError, "^" + error + "$"):
                RESTORE.bounded([sys.executable, "-c", program], {"PATH": "/usr/bin:/bin"}, timeout=1, cap=100)

    def test_cli_accepts_no_private_material_and_default_is_no_action(self):
        script = str(Path(__file__).with_name("restore-backup-isolated.py"))
        for args, code in (([], 0), (["--private-key", "do-not-read"], 2)):
            result = subprocess.run([sys.executable, script, *args], capture_output=True, text=True)
            self.assertEqual(result.returncode, code)
            self.assertIn('"status": "OFFLINE_NO_ACTION"', result.stdout)
            self.assertNotIn("do-not-read", result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
