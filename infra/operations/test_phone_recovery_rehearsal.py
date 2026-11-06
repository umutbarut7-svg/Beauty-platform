import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import io
import subprocess
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location("phone", Path(__file__).with_name("phone-recovery-rehearsal.py"))
PHONE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PHONE)
IMAGE_ID = "sha256:" + "a" * 64


def isolated(name):
    return {
        "Name": "/" + name, "Image": IMAGE_ID,
        "Config": {"Labels": {PHONE.LABEL: "true"}, "User": "999:999", "Env": ["PG_MAJOR=17"],
                   "Entrypoint": ["/bin/sh"], "Cmd": ["-ec", PHONE.SQL_PROBE]},
        "HostConfig": {"NetworkMode": "none", "ReadonlyRootfs": True, "Privileged": False,
                       "CapDrop": ["ALL"], "SecurityOpt": ["no-new-privileges:true"],
                       "Memory": PHONE.MEMORY, "MemorySwap": PHONE.MEMORY,
                       "NanoCpus": 1000000000, "PidsLimit": 128, "LogConfig": {"Type": "none"},
                       "RestartPolicy": {"Name": "no"}, "Tmpfs": PHONE.TMPFS, "IpcMode": "private"},
        "Mounts": [], "State": {"Status": "created", "ExitCode": 0},
    }


class FakeDocker:
    def __init__(self, mutate=None, marker=PHONE.MARKER):
        self.calls = []
        self.mutate = mutate
        self.marker = marker
        self.running = False

    def __call__(self, *args, **kwargs):
        self.calls.append(args)
        if args[0] == "info":
            return "/tmp"
        if args[:2] == ("image", "inspect"):
            return json.dumps([{"Id": IMAGE_ID, "RepoDigests": [PHONE.IMAGE]}])
        if args[0] == "inspect":
            value = isolated(args[1])
            if self.running:
                value["State"]["Status"] = "exited"
            if self.mutate:
                self.mutate(value)
            return json.dumps([value])
        if args[0] == "start":
            self.running = True
            return self.marker
        return ""


class PhoneRecoveryTests(unittest.TestCase):
    def run_probe(self, docker, pull=False):
        with patch.object(PHONE.shutil, "disk_usage") as usage, patch.object(PHONE, "progress"):
            usage.return_value.free = 3 * 1024**3
            return PHONE.rehearse(docker, pull)

    def test_synthetic_success_never_claims_real_recovery_and_always_removes(self):
        docker = FakeDocker()
        result = self.run_probe(docker)
        self.assertTrue(result["syntheticRestoreVerified"])
        for name in ["realRecoveryReady", "productionRestoreVerified", "productionDataRead", "privateKeyRead", "awsApiCalled"]:
            self.assertIs(result[name], False)
        removals = [c for c in docker.calls if c[0] == "rm"]
        self.assertEqual(len(removals), 1)
        self.assertTrue(removals[0][-1].startswith("orzell-synthetic-recovery-"))
        self.assertFalse(any(c[0] == "pull" for c in docker.calls))

    def test_public_pull_is_explicit_and_pinned(self):
        docker = FakeDocker()
        self.run_probe(docker, True)
        self.assertIn(("pull", PHONE.IMAGE), docker.calls)

    def test_unsafe_container_is_rejected_before_start_and_still_cleaned(self):
        changes = [
            ("HostConfig", "NetworkMode", "host"), ("HostConfig", "Privileged", True),
            ("HostConfig", "Binds", ["/home:/host"]), ("HostConfig", "MemorySwap", -1),
            ("HostConfig", "LogConfig", {"Type": "json-file"}),
            ("HostConfig", "PortBindings", {"5432/tcp": [{"HostPort": "5432"}]}),
            ("HostConfig", "PidMode", "host"), ("HostConfig", "IpcMode", "host"),
            ("HostConfig", "ReadonlyRootfs", False), ("HostConfig", "SecurityOpt", []),
            ("HostConfig", "Tmpfs", {}), ("Config", "Env", ["AWS_SECRET_ACCESS_KEY=synthetic"]),
            ("Config", "User", "0"), ("Config", "Cmd", ["-c", "unexpected"]),
        ]
        for group, field, value in changes:
            with self.subTest(field=field):
                docker = FakeDocker(lambda v: v[group].__setitem__(field, value))
                with self.assertRaisesRegex(PHONE.Rejected, "CONTAINER_ISOLATION"):
                    self.run_probe(docker)
                self.assertFalse(any(c[0] == "start" for c in docker.calls))
                self.assertTrue(any(c[0] == "rm" for c in docker.calls))
        value = isolated("test")
        value["Mounts"] = [{"Type": "volume"}]
        with self.assertRaises(PHONE.Rejected):
            PHONE.check_container(value, "test", IMAGE_ID)

    def test_missing_success_marker_or_nonzero_exit_cannot_pass(self):
        for docker in [FakeDocker(marker=""), FakeDocker(marker="extra\n" + PHONE.MARKER),
                       FakeDocker(lambda v: v["State"].__setitem__("ExitCode", 1))]:
            with self.assertRaises(PHONE.Rejected):
                self.run_probe(docker)
            self.assertTrue(any(c[0] == "rm" for c in docker.calls))

    def test_cleanup_failure_cannot_pass(self):
        docker = FakeDocker()
        def fail_cleanup(*args, **kwargs):
            if args[0] == "rm":
                raise PHONE.Rejected("CLEANUP_FAILED")
            return docker(*args, **kwargs)
        with self.assertRaisesRegex(PHONE.Rejected, "CLEANUP_FAILED"):
            self.run_probe(fail_cleanup)

    def test_host_swap_and_memory_fail_before_docker(self):
        with tempfile.TemporaryDirectory() as root:
            proc = Path(root)
            (proc / "swaps").write_text("Filename Type Size Used Priority\n/dev/swap file 1 0 -1\n")
            (proc / "meminfo").write_text("MemAvailable: 1000000 kB\n")
            with self.assertRaisesRegex(PHONE.Rejected, "ACTIVE_SWAP"):
                PHONE.host_checks(proc)
            self.assertTrue(PHONE.host_checks(proc, allow_synthetic_swap=True))
            (proc / "swaps").write_text("Filename Type Size Used Priority\n")
            (proc / "meminfo").write_text("MemAvailable: 1 kB\n")
            with self.assertRaisesRegex(PHONE.Rejected, "MEMORY"):
                PHONE.host_checks(proc)

    def test_explicit_swap_mode_keeps_production_blocked_and_reports_swap(self):
        with patch("sys.argv", ["phone-recovery-rehearsal.py", "--synthetic-only-allow-host-swap"]), \
                patch.object(PHONE, "host_checks", return_value=True) as host, \
                patch.object(PHONE, "Docker", return_value=FakeDocker()), \
                patch.object(PHONE.shutil, "disk_usage") as usage, \
                patch("sys.stdout", new_callable=io.StringIO) as output:
            usage.return_value.free = 3 * 1024**3
            self.assertEqual(PHONE.main(), 0)
            host.assert_called_once_with(allow_synthetic_swap=True)
            report = json.loads(output.getvalue().splitlines()[-1])
        self.assertEqual(report["status"], "SYNTHETIC_PROBE_PASSED_HOST_SWAP_REVIEW_REQUIRED")
        self.assertTrue(report["hostSwapActive"])
        self.assertFalse(report["productionRestoreVerified"])
        self.assertFalse(report["realRecoveryReady"])
        self.assertFalse(report["privateKeyRead"])
        self.assertFalse(report["productionDataRead"])
        self.assertIn("ACTIVE_HOST_SWAP_NOT_APPROVED_FOR_REAL_DATA", report["productionRecoveryBlockers"])

    def test_timeout_reports_only_operation_without_raw_exception_data(self):
        with patch.object(PHONE.subprocess, "run", side_effect=subprocess.TimeoutExpired(
                "synthetic-sensitive-placeholder", 1, output="not-for-log", stderr="not-for-log")), \
                patch("sys.stdout", new_callable=io.StringIO) as output:
            with self.assertRaisesRegex(PHONE.Rejected, "^DOCKER_PULL_TIMEOUT$"):
                PHONE.Docker("/tmp/public-config")("pull", PHONE.IMAGE)
        self.assertEqual(json.loads(output.getvalue()), {"step": "DOCKER_PULL"})

    def test_missing_docker_binary_is_classified_without_raw_path(self):
        with patch.object(PHONE.subprocess, "run", side_effect=FileNotFoundError(2, "not-for-log")), \
                patch.object(PHONE, "progress"):
            with self.assertRaisesRegex(PHONE.Rejected, "^DOCKER_INFO_OSERROR_2$"):
                PHONE.Docker("/tmp/public-config")("info")

    def test_docker_cli_drops_inherited_cloud_credentials_and_remote_context(self):
        with patch.dict(PHONE.os.environ, {"AWS_SECRET_ACCESS_KEY": "synthetic", "DOCKER_HOST": "tcp://bad:2375"}):
            docker = PHONE.Docker("/tmp/public-config")
        self.assertNotIn("AWS_SECRET_ACCESS_KEY", docker.env)
        self.assertNotIn("DOCKER_HOST", docker.env)
        self.assertEqual(docker.prefix[1:3], ["--host", "unix:///var/run/docker.sock"])


if __name__ == "__main__":
    unittest.main()
