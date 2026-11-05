import base64
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location("probe", Path(__file__).with_name("probe-backup-storage.py"))
PROBE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROBE)


class StorageProbeTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(dir=Path.home())
        self.root = Path(self.directory.name) / "operation"
        self.certificate = Path(self.directory.name) / "recipient.crt"
        source = Path(__file__).parents[2] / ".github/operations/backup-recipient-20261105.pem"
        self.certificate.write_bytes(source.read_bytes())
        self.certificate.chmod(0o600)
        self.calls = []
        self.cipher = None
        self.corrupt = False
        self.deny = True

    def tearDown(self):
        self.directory.cleanup()

    def call(self, service, operation, *arguments, denied=False):
        self.calls.append((service, operation, arguments, denied))
        if operation == "get-caller-identity":
            return {"Account": PROBE.ACCOUNT, "Arn": "arn:aws:sts::" + PROBE.ACCOUNT + ":assumed-role/" + PROBE.ROLE + "/fixture"}
        if operation == "get-bucket-versioning":
            return {"Status": "Enabled"}
        if operation == "get-public-access-block":
            return {"PublicAccessBlockConfiguration": {name: True for name in ["BlockPublicAcls", "IgnorePublicAcls", "BlockPublicPolicy", "RestrictPublicBuckets"]}}
        if operation == "put-object" and "--generate-cli-skeleton" in arguments:
            return {"IfNoneMatch": "", "ChecksumSHA256": ""}
        if operation == "put-object":
            self.cipher = Path(arguments[arguments.index("--body") + 1]).read_bytes()
            self.assertEqual(arguments[arguments.index("--if-none-match") + 1], "*")
            self.assertEqual(arguments[arguments.index("--server-side-encryption") + 1], "AES256")
        if operation in ["put-object", "get-object"]:
            checksum = base64.b64encode(hashlib.sha256(self.cipher).digest()).decode()
            if operation == "get-object":
                Path(arguments[-1]).write_bytes(self.cipher + (b"corrupt" if self.corrupt else b""))
            return {"VersionId": "fixture-version", "ETag": '"fixture-etag"', "ChecksumSHA256": checksum, "ServerSideEncryption": "AES256"}
        if operation == "delete-object":
            self.assertTrue(denied)
            return {"accessDenied": True} if self.deny else {}
        raise AssertionError("Unexpected test operation")

    def probe(self, **changes):
        return PROBE.probe(**{**dict(root=self.root, certificate_path=self.certificate, call=self.call, service_snapshot=lambda: {"services": "unchanged"}), **changes})

    def puts(self):
        return [call for call in self.calls if call[1] == "put-object" and "--generate-cli-skeleton" not in call[2]]

    def test_real_cms_probe_write_read_checksum_and_both_delete_denials(self):
        report = self.probe()
        self.assertEqual(report["status"], "STORAGE_PROBE_COMPLETE")
        self.assertFalse(report["productionBackupCreated"])
        self.assertFalse(report["privateKeyUsed"])
        self.assertNotIn(b"ORZELL SYNTHETIC", self.cipher)
        self.assertTrue(self.cipher.startswith(b"\x30"))
        self.assertEqual(len(self.puts()), 1)
        self.assertEqual(sum(call[1] == "delete-object" for call in self.calls), 2)
        for _, _, args, _ in self.calls:
            if "--key" in args:
                self.assertEqual(args[args.index("--key") + 1], PROBE.OBJECT)
        self.assertEqual((self.root / "result.json").stat().st_mode & 0o777, 0o600)

    def test_repeated_or_ambiguous_operation_does_not_upload_again(self):
        original = self.call
        def timeout(service, operation, *args, **kwargs):
            result = original(service, operation, *args, **kwargs)
            if operation == "put-object" and "--generate-cli-skeleton" not in args:
                raise TimeoutError("synthetic uncertain upload")
            return result
        with self.assertRaises(TimeoutError):
            self.probe(call=timeout)
        self.assertEqual(len(self.puts()), 1)
        with self.assertRaisesRegex(ValueError, "NO_RETRY"):
            self.probe()
        self.assertEqual(len(self.puts()), 1)

    def test_corrupt_readback_never_claims_success_or_attempts_delete(self):
        self.corrupt = True
        with self.assertRaisesRegex(ValueError, "READBACK"):
            self.probe()
        self.assertFalse((self.root / "result.json").exists())
        self.assertFalse(any(call[1] == "delete-object" for call in self.calls))

    def test_missing_delete_protection_is_failure(self):
        self.deny = False
        with self.assertRaisesRegex(ValueError, "DELETE_PROTECTION"):
            self.probe()
        self.assertFalse((self.root / "result.json").exists())

    def test_wrong_runtime_or_disabled_versioning_prevents_upload(self):
        original = self.call
        for target, response in [("get-caller-identity", {"Account": "wrong"}), ("get-bucket-versioning", {"Status": "Suspended"})]:
            def changed(service, operation, *args, **kwargs):
                return response if operation == target else original(service, operation, *args, **kwargs)
            with self.assertRaises(ValueError):
                self.probe(call=changed)
            self.assertEqual(self.puts(), [])

    def test_wrong_pin_or_unsafe_certificate_prevents_upload(self):
        with patch.object(PROBE.RECIPIENT, "PIN", "0" * 64):
            with self.assertRaisesRegex(ValueError, "PIN"):
                self.probe()
        self.certificate.chmod(0o644)
        with self.assertRaisesRegex(ValueError, "UNSAFE"):
            self.probe()
        self.assertEqual(self.puts(), [])

    def test_old_cli_without_conditional_upload_never_writes(self):
        original = self.call
        def old(service, operation, *args, **kwargs):
            return {} if "--generate-cli-skeleton" in args else original(service, operation, *args, **kwargs)
        with self.assertRaisesRegex(ValueError, "CLI_CONDITIONAL"):
            self.probe(call=old)
        self.assertEqual(self.puts(), [])

    def test_live_aws_wrapper_treats_only_access_denied_as_expected(self):
        import subprocess
        with patch.object(PROBE.subprocess, "run", return_value=subprocess.CompletedProcess([], 1, "", "secret (ExpiredToken)")):
            with self.assertRaisesRegex(ValueError, "ExpiredToken"):
                PROBE.aws("s3api", "delete-object", denied=True)
        with patch.object(PROBE.subprocess, "run", return_value=subprocess.CompletedProcess([], 1, "", "secret (AccessDenied)")):
            self.assertEqual(PROBE.aws("s3api", "delete-object", denied=True), {"accessDenied": True})


if __name__ == "__main__":
    unittest.main()
