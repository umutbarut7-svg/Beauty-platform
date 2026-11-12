import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import test_start_small_recovery as fixtures

HERE = Path(__file__).parent
SPEC = importlib.util.spec_from_file_location("prepared_recovery", HERE / "prepare-protected-recovery-host.py")
HOST = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HOST)


class PreparedRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.legacy, self.base = HOST.modules()
        self.fixture_scope = patch.object(fixtures, "SMALL", self.legacy)
        self.fixture_scope.start()
        self.addCleanup(self.fixture_scope.stop)
        self.fake = fixtures.Fake()

    def test_default_has_no_provider_or_download_action(self):
        with patch.object(HOST, "modules", side_effect=AssertionError), patch.object(sys, "argv", ["prepare"]):
            self.assertEqual(HOST.main(), 0)

    def test_template_retains_reviewed_infrastructure_and_scopes_only_new_runtime(self):
        original = self.base.template()
        result = HOST.template(self.base)
        self.assertEqual(self.base.template(), original)
        old_host = copy.deepcopy(original["Resources"]["RecoveryHost"])
        new_host = copy.deepcopy(result["Resources"]["RecoveryHost"])
        for key in ("UserData", "Tags"):
            old_host["Properties"].pop(key)
            new_host["Properties"].pop(key)
        self.assertEqual(old_host, new_host)
        for name in original["Resources"].keys() - {"RecoveryHost"}:
            self.assertEqual(result["Resources"][name], original["Resources"][name])
        self.assertEqual(HOST.STACK, "orzell-protected-runtime-v1")
        self.assertNotEqual(HOST.STACK, "orzell-recovery-rehearsal-v1")
        self.assertEqual(result["Outputs"]["Purpose"]["Value"], "PUBLIC_RUNTIME_PREPARATION_ONLY_REAL_INTAKE_CLOSED")

    def test_pinned_bytes_and_bootstrap_are_valid_without_reading_owner_material(self):
        self.assertEqual(len(HOST.RUNTIME_PINS), 17)
        for name, digest in HOST.RUNTIME_PINS.items():
            body = (HERE.parents[1] / name).read_bytes()
            self.assertEqual(hashlib.sha256(body).hexdigest(), digest, name)
            self.assertNotIn(b"-----BEGIN PRIVATE KEY-----", body)
            self.assertNotIn(b"-----BEGIN ENCRYPTED PRIVATE KEY-----", body)
        body = HOST.bootstrap()
        subprocess.run(["bash", "-n"], input=body.encode(), check=True)
        self.assertLessEqual(len(body.encode()), 16384)
        self.assertLess(body.index("--on-active=120min"), body.index("dnf -y install"))
        self.assertLess(body.rindex("sha256sum -c"), body.index("spec_from_file_location"))
        self.assertIn("python3-cryptography", body)
        self.assertNotIn("synthetic-probe.py", body)
        self.assertNotIn("get-object", body)
        self.assertNotIn("open_key(", body)

    def test_preflight_uses_new_stack_and_changes_no_resources(self):
        body, plan = HOST.prepare(self.fake.call, self.legacy, self.base)
        self.assertEqual(plan["dataScope"], "PreparationOnly")
        self.assertEqual(plan["templateSha256"], hashlib.sha256(body.encode()).hexdigest())
        self.assertFalse(plan["realKeyIntakeEnabled"])
        self.assertFalse(plan["hardBillingCap"])
        self.assertTrue(all(HOST.STACK in c[2] for c in self.fake.calls if c[1] == "describe-stacks"))
        self.assertFalse(any(c[1] in ("create-stack", "validate-template") for c in self.fake.calls))

    def test_new_scope_budget_and_existing_or_orphan_resources_block_create(self):
        self.fake.price = "0.023"
        with self.assertRaisesRegex(ValueError, "NEW_SCOPE_ESTIMATE_LIMIT_EXCEEDED"):
            HOST.prepare(self.fake.call, self.legacy, self.base)
        for field, value in (("stack", "CREATE_COMPLETE"), ("orphan", True), ("pagination", True), ("eligible_type", False), ("eligible_image", False), ("account", "wrong")):
            fake = fixtures.Fake()
            setattr(fake, field, value)
            with self.subTest(field=field), self.assertRaises(ValueError):
                HOST.prepare(fake.call, self.legacy, self.base)
            self.assertFalse(any(c[1] == "create-stack" for c in fake.calls))

    def test_single_create_has_new_identity_template_receipt_and_minimum_role_only(self):
        with tempfile.TemporaryDirectory() as parent:
            directory = self.fake.root = Path(parent) / "attempt"
            result = HOST.create(self.fake.call, self.legacy, self.base, directory)
            self.assertEqual(result["status"], "RUNTIME_PREPARATION_SUBMITTED_NOT_READY")
            calls = [c for c in self.fake.calls if c[1] == "create-stack"]
            self.assertEqual(len(calls), 1)
            args = calls[0][2]
            for flag, value in (("--stack-name", HOST.STACK), ("--client-request-token", HOST.TOKEN), ("--on-failure", "DELETE")):
                self.assertEqual(args[args.index(flag)+1], value)
            receipt = json.loads((directory / "attempt.json").read_text())
            self.assertEqual(receipt["plan"]["templateSha256"], result["templateSha256"])
            self.assertEqual(directory.stat().st_mode & 0o777, 0o700)
            for name in ("template.json", "attempt.json", "submitted.json"):
                self.assertEqual((directory/name).stat().st_mode & 0o777, 0o600)

    def test_ambiguous_submission_and_local_attempt_are_never_automatically_retried(self):
        with tempfile.TemporaryDirectory() as parent:
            directory = self.fake.root = Path(parent) / "attempt"
            self.fake.timeout_create = True
            with self.assertRaises(subprocess.TimeoutExpired):
                HOST.create(self.fake.call, self.legacy, self.base, directory)
            with self.assertRaisesRegex(ValueError, "LOCAL_ATTEMPT_EXISTS"):
                HOST.create(self.fake.call, self.legacy, self.base, directory)
            self.assertEqual(sum(c[1] == "create-stack" for c in self.fake.calls), 1)

    def test_resource_race_and_symlink_attempt_stop_before_mutation(self):
        self.fake.race = True
        with tempfile.TemporaryDirectory() as parent:
            directory = self.fake.root = Path(parent) / "race"
            with self.assertRaisesRegex(ValueError, "RECOVERY_APPEARED_DURING_PREFLIGHT"):
                HOST.create(self.fake.call, self.legacy, self.base, directory)
            self.assertFalse(any(c[1] == "create-stack" for c in self.fake.calls))
            link = Path(parent) / "link"
            link.symlink_to(Path(parent) / "absent")
            with self.assertRaisesRegex(ValueError, "LOCAL_ATTEMPT_EXISTS"):
                HOST.create(self.fake.call, self.legacy, self.base, link)


if __name__ == "__main__":
    unittest.main()
