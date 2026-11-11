from contextlib import contextmanager
import fcntl
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch
import zipfile

import test_backup_manifest as fixtures


SPEC = importlib.util.spec_from_file_location("memory_backup", Path(__file__).with_name("recover-backup-memory.py"))
MEMORY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MEMORY)


class MemoryBackupTests(unittest.TestCase):
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
        self.write_package()
        self.args = {k: v for k, v in self.context.items() if k not in ("ciphertext", "manifest_path")}
        self.args.update(package=self.package, certificate=self.root / "recipient.crt",
                         private_key=self.root / "recipient.key", max_package_bytes=1024 * 1024,
                         max_cipher_bytes=512 * 1024, max_plaintext_bytes=1024 * 1024,
                         decrypt_timeout_seconds=5)

    def write_package(self):
        with zipfile.ZipFile(self.package, "w", compression=zipfile.ZIP_STORED) as archive:
            archive.writestr("backup.cms", self.ciphertext.read_bytes())
            archive.writestr("manifest.json", self.manifest.read_bytes())

    @contextmanager
    def opened(self, **changes):
        # Only synthetic crypto fixtures. Production API has no swap bypass.
        # Host gates are tested separately; CI is not an approved recovery host.
        with patch.object(MEMORY, "host_checks"), MEMORY.verified_dump(**{**self.args, **changes}) as value:
            yield value

    def rejected(self, code, **changes):
        before = set(self.path.iterdir())
        descriptors = len(os.listdir("/proc/self/fd"))
        with self.assertRaisesRegex(ValueError, code):
            with self.opened(**changes):
                self.fail("Unauthenticated descriptor escaped")
        self.assertEqual(set(self.path.iterdir()), before)
        self.assertEqual(len(os.listdir("/proc/self/fd")), descriptors)

    def test_signed_cms_opens_only_sealed_fd_and_closes_at_context_exit(self):
        before = set(self.path.iterdir())
        with self.opened(max_plaintext_bytes=len(self.source.read_bytes())) as (fd, manifest):
            self.assertEqual(os.read(fd, 1024), self.source.read_bytes())
            self.assertEqual(os.fstat(fd).st_mode & 0o777, 0o600)
            self.assertEqual(fcntl.fcntl(fd, 1034), MEMORY.SEALS)
            self.assertEqual(manifest["backupId"], self.context["backup_id"])
            with self.assertRaises(OSError):
                os.write(fd, b"modified")
            with self.assertRaises(OSError):
                os.ftruncate(fd, 0)
        with self.assertRaises(OSError):
            os.fstat(fd)
        self.assertEqual(set(self.path.iterdir()), before)

    def test_actual_plaintext_cap_rejects_without_named_output_or_fd_leak(self):
        self.rejected("PLAINTEXT_SIZE_LIMIT", max_plaintext_bytes=len(self.source.read_bytes()) - 1)

    def test_caller_failure_still_closes_authenticated_plaintext(self):
        fd = None
        with self.assertRaisesRegex(RuntimeError, "caller failed"):
            with self.opened() as (fd, _):
                raise RuntimeError("caller failed")
        with self.assertRaises(OSError):
            os.fstat(fd)

    def test_authenticated_non_dump_is_rejected_before_caller_receives_it(self):
        self.source.write_bytes(b"other authenticated content")
        self.ciphertext.unlink()
        MEMORY.FILES.transform("encrypt", self.source, self.ciphertext, self.root / "recipient.crt")
        self.manifest.unlink()
        self.sign()
        self.write_package()
        self.rejected("POSTGRES_CUSTOM_DUMP_REQUIRED")

    def test_invalid_limits_stop_before_any_input_or_private_key_is_opened(self):
        for field, bad in (("max_plaintext_bytes", True), ("max_plaintext_bytes", 0),
                           ("max_plaintext_bytes", MEMORY.MAX_PLAINTEXT + 1),
                           ("decrypt_timeout_seconds", True), ("decrypt_timeout_seconds", 0),
                           ("decrypt_timeout_seconds", MEMORY.MAX_DECRYPT_SECONDS + 1),
                           ("max_cipher_bytes", 2 * 1024 * 1024)):
            with self.subTest(field=field, bad=bad), patch.object(MEMORY.VERIFIED, "snapshot") as snapshot:
                self.rejected("INVALID_", **{field: bad})
                snapshot.assert_not_called()

    def test_wrong_signer_or_source_rejects_before_private_key_access(self):
        for change in ({"expected_signer": "0" * 64}, {"application_sha": "b" * 40}):
            with self.subTest(change=change), patch.object(MEMORY.VERIFIED, "snapshot", wraps=MEMORY.VERIFIED.snapshot) as snap:
                self.rejected("UNTRUSTED_SIGNER|BACKUP_CONTEXT_MISMATCH", **change)
                self.assertFalse(any(c.kwargs.get("private") for c in snap.call_args_list))

    def test_wrong_recipient_certificate_rejects_before_private_key_access(self):
        with patch.object(MEMORY.VERIFIED, "snapshot", wraps=MEMORY.VERIFIED.snapshot) as snap:
            self.rejected("UNTRUSTED_RECIPIENT_CERTIFICATE", certificate=self.root / "attacker.crt")
            self.assertFalse(any(c.kwargs.get("private") for c in snap.call_args_list))

    def test_wrong_private_key_authenticates_nothing(self):
        self.rejected("BACKUP_AUTHENTICATION_OR_TRANSFORM_FAILED", private_key=self.root / "attacker.key")

    def test_resigned_corrupt_ciphertext_still_requires_successful_gcm_authentication(self):
        data = bytearray(self.ciphertext.read_bytes())
        data[len(data) // 2] ^= 1
        self.ciphertext.write_bytes(data)
        self.manifest.unlink()
        self.sign()
        self.write_package()
        self.rejected("BACKUP_AUTHENTICATION_OR_TRANSFORM_FAILED")

    def test_private_key_mode_and_symlink_are_rejected(self):
        unsafe = self.path / "unsafe.key"
        unsafe.write_bytes((self.root / "recipient.key").read_bytes())
        unsafe.chmod(0o640)
        self.rejected("UNSAFE_INPUT_FILE", private_key=unsafe)
        unsafe.unlink()
        unsafe.symlink_to(self.root / "recipient.key")
        with self.assertRaises(OSError):
            with self.opened(private_key=unsafe):
                self.fail("Symlink accepted")

    def test_password_protected_private_key_uses_fd_not_argv_secret(self):
        password = self.path / "password"
        password.write_text("synthetic-memory-passphrase\n")
        password.chmod(0o600)
        protected = self.path / "protected.key"
        subprocess.run(["openssl", "pkey", "-in", str(self.root / "recipient.key"), "-aes-256-cbc",
                        "-passout", "file:" + str(password), "-out", str(protected)],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        protected.chmod(0o600)
        original = subprocess.Popen
        def launch(args, **kwargs):
            self.assertNotIn("synthetic-memory-passphrase", str(args))
            self.assertNotIn(str(password), str(args))
            self.assertEqual(kwargs["env"], {"PATH": "/usr/bin:/bin", "LANG": "C", "OPENSSL_CONF": "/dev/null"})
            return original(args, **kwargs)
        # Popen is also used by public manifest verification. Scope only decrypt.
        decrypt = MEMORY.decrypt_memory
        def checked(*args):
            with patch.object(MEMORY.subprocess, "Popen", side_effect=launch):
                return decrypt(*args)
        with patch.object(MEMORY, "decrypt_memory", side_effect=checked):
            with self.opened(private_key=protected, passphrase=password) as (fd, _):
                self.assertEqual(os.read(fd, 1024), self.source.read_bytes())

    def fake_child(self, program):
        original = subprocess.Popen
        children = []
        def launch(args, **kwargs):
            child = original([sys.executable, "-c", program], **kwargs)
            children.append(child)
            return child
        return launch, children

    def test_stalled_child_is_killed_reaped_and_partial_plaintext_is_not_released(self):
        launch, children = self.fake_child("import os,time; os.write(1,b'partial private output'); time.sleep(30)")
        decrypt = MEMORY.decrypt_memory
        def stalled(*args):
            with patch.object(MEMORY.subprocess, "Popen", side_effect=launch):
                return decrypt(*args)
        with patch.object(MEMORY, "decrypt_memory", side_effect=stalled):
            self.rejected("DECRYPT_DEADLINE_EXCEEDED", decrypt_timeout_seconds=1)
        self.assertEqual(len(children), 1)
        self.assertLess(children[0].returncode, 0)

    def test_nonzero_exit_after_output_or_empty_success_never_releases_fd(self):
        decrypt = MEMORY.decrypt_memory
        for program in ("import os; os.write(1,b'private output'); raise SystemExit(7)", "pass"):
            launch, _ = self.fake_child(program)
            def failed(*args):
                with patch.object(MEMORY.subprocess, "Popen", side_effect=launch):
                    return decrypt(*args)
            with self.subTest(program=program), patch.object(MEMORY, "decrypt_memory", side_effect=failed):
                self.rejected("BACKUP_AUTHENTICATION_OR_TRANSFORM_FAILED")

    def test_closed_stdout_does_not_bypass_process_exit_deadline(self):
        launch, children = self.fake_child("import os,time; os.write(1,b'partial'); os.close(1); time.sleep(30)")
        decrypt = MEMORY.decrypt_memory
        def stalled(*args):
            with patch.object(MEMORY.subprocess, "Popen", side_effect=launch):
                return decrypt(*args)
        with patch.object(MEMORY, "decrypt_memory", side_effect=stalled):
            self.rejected("DECRYPT_DEADLINE_EXCEEDED", decrypt_timeout_seconds=1)
        self.assertLess(children[0].returncode, 0)

    def test_flooding_process_is_killed_at_actual_byte_limit(self):
        launch, children = self.fake_child("import os;\nwhile True: os.write(1,b'x'*65536)")
        decrypt = MEMORY.decrypt_memory
        def flooding(*args):
            with patch.object(MEMORY.subprocess, "Popen", side_effect=launch):
                return decrypt(*args)
        with patch.object(MEMORY, "decrypt_memory", side_effect=flooding):
            self.rejected("PLAINTEXT_SIZE_LIMIT", max_plaintext_bytes=100)
        self.assertLess(children[0].returncode, 0)

    def test_swap_unknown_or_active_stops_before_inputs_and_core_limit_is_zeroed(self):
        for swaps in ("", "Filename\tType\tSize\tUsed\tPriority\n/swap file 1 0 -2\n"):
            with self.subTest(swaps=swaps), patch.object(Path, "read_text", return_value=swaps), \
                 patch.object(MEMORY.VERIFIED, "snapshot") as snapshot:
                with self.assertRaisesRegex(ValueError, "ACTIVE_OR_UNKNOWN_SWAP"):
                    with MEMORY.verified_dump(**self.args):
                        self.fail("Host gate bypassed")
                snapshot.assert_not_called()
        with patch.object(Path, "read_text", return_value="Filename\tType\tSize\tUsed\tPriority\n"), \
             patch.object(MEMORY.resource, "setrlimit") as limit:
            MEMORY.host_checks()
            limit.assert_called_once_with(MEMORY.resource.RLIMIT_CORE, (0, 0))

    def test_cli_default_and_unknown_args_accept_no_material(self):
        script = str(Path(__file__).with_name("recover-backup-memory.py"))
        for args, code in (([], 0), (["--private-key", "never-read-this"], 2)):
            result = subprocess.run([sys.executable, script, *args], capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, code)
            self.assertIn('"status": "OFFLINE_NO_ACTION"', result.stdout)
            self.assertNotIn("never-read-this", result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
