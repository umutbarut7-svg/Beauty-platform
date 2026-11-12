from contextlib import contextmanager, ExitStack
import importlib.util
import io
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("protected_restore_test", Path(__file__).with_name("restore-protected-handoff.py"))
BRIDGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BRIDGE)


class ProtectedRestoreTests(unittest.TestCase):
    def setUp(self):
        # A fake instance of the actual class exercises caller resource lifetime;
        # real Web Crypto / CMS / PostgreSQL integration is a separate CI boundary.
        self.session = object.__new__(BRIDGE.HANDOFF.KeyHandoff)
        self.closed = False
        self.opened = False
        self.descriptor = None
        self.session.close = lambda: setattr(self, "closed", True)
        self.session.verified_dump = self.dump
        self.args = dict(max_package_bytes=4096, max_cipher_bytes=4096,
                         max_plaintext_bytes=4096, decrypt_timeout_seconds=10,
                         restore_timeout_seconds=10, acknowledge_invalidation=True)

    @contextmanager
    def dump(self, *args, **kwargs):
        self.opened = True
        with ExitStack() as stack:
            self.descriptor = BRIDGE.HANDOFF.MEMORY.VERIFIED.snapshot_stream(stack, io.BytesIO(b"PGDMP generated"), max_bytes=100)
            yield self.descriptor, {"applicationSha": "a"*40}, "b"*64

    def run_bridge(self, **changes):
        return BRIDGE.restore_protected(self.session, b"synthetic-ciphertext", "unused-encrypted-package", "unused-public-signer", **dict(self.args, **changes))

    def test_policy_and_limits_reject_before_package_or_key_read_and_close_session(self):
        for change in ({"acknowledge_invalidation": False}, {"restore_timeout_seconds": True},
                       {"restore_timeout_seconds": 301}, {"max_package_bytes": 16*1024*1024+1},
                       {"max_plaintext_bytes": BRIDGE.RESTORE.MAX_DUMP+1}):
            self.closed = False
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.run_bridge(**change)
            self.assertFalse(self.opened)
            self.assertTrue(self.closed)

    def test_only_sealed_dump_and_independent_schema_cross_restore_boundary(self):
        def restore(docker, fd, schema, timeout):
            self.assertEqual(fd, self.descriptor)
            self.assertEqual(os.pread(fd, 100, 0), b"PGDMP generated")
            self.assertEqual(schema, "b"*64)
            self.assertEqual(timeout, 10)
            return {"status": "OFFLINE_RESTORE_QUARANTINED", "temporaryDatabaseRemoved": True}
        with patch.object(BRIDGE.RESTORE, "_restore_sealed_dump", side_effect=restore):
            report = self.run_bridge()
        self.assertTrue(self.closed)
        with self.assertRaises(OSError):
            os.fstat(self.descriptor)
        self.assertTrue(report["protectedHandoffConsumed"])
        for key in ("productionRestoreVerified", "realRecoveryReady", "reopenAuthorized"):
            self.assertFalse(report[key])
        self.assertNotIn("synthetic-ciphertext", str(report))

    def test_restore_failure_closes_session_and_dump_without_success_report(self):
        with patch.object(BRIDGE.RESTORE, "_restore_sealed_dump", side_effect=ValueError("OFFLINE_RESTORE_FAILED_DOMAIN")):
            with self.assertRaisesRegex(ValueError, "^OFFLINE_RESTORE_FAILED_DOMAIN$"):
                self.run_bridge()
        self.assertTrue(self.closed)
        with self.assertRaises(OSError):
            os.fstat(self.descriptor)

    def test_unverified_session_and_envelope_boundaries_do_not_reach_restore(self):
        with patch.object(BRIDGE.RESTORE, "_restore_sealed_dump") as restore:
            with self.assertRaisesRegex(ValueError, "PROTECTED_HANDOFF_SESSION_REQUIRED"):
                BRIDGE.restore_protected(object(), b"cipher", None, None, **self.args)
            for packet in (b"", b"x"*(BRIDGE.HANDOFF.MAX_ENVELOPE+1), "not-bytes"):
                with self.assertRaisesRegex(ValueError, "HANDOFF_INPUT_LIMIT"):
                    BRIDGE.restore_protected(self.session, packet, None, None, **self.args)
                self.assertTrue(self.closed)
            restore.assert_not_called()

    def test_cli_has_no_private_file_or_receiver_mode(self):
        path = str(Path(__file__).with_name("restore-protected-handoff.py"))
        for args, code in (([], 0), (["--private-key", "never-read"], 2)):
            p = subprocess.run([sys.executable, path, *args], capture_output=True, text=True)
            self.assertEqual(p.returncode, code)
            self.assertIn('"status": "OFFLINE_NO_ACTION"', p.stdout)
            self.assertNotIn("never-read", p.stdout+p.stderr)


if __name__ == "__main__":
    unittest.main()
