from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

SPEC = importlib.util.spec_from_file_location("public_inspection", Path(__file__).with_name("inspect-recovery-package.py"))
INSPECT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(INSPECT)


class PublicPackageInspectionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = tempfile.TemporaryDirectory(prefix="generated-public-package-")
        root = cls.root = Path(cls.fixture.name)
        for name in ("recipient", "signer"):
            subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:3072", "-nodes", "-keyout", str(root/(name+".key")),
                            "-out", str(root/(name+".crt")), "-subj", "/CN=generated-public-inspection", "-days", "1"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True, timeout=30)
            (root/(name+".key")).chmod(0o600)
            with (root/(name+".pub")).open("wb") as stream:
                subprocess.run(["openssl", "pkey", "-in", str(root/(name+".key")), "-pubout"],
                               stdout=stream, stderr=subprocess.DEVNULL, check=True, timeout=10)
        (root/"fixture.dump").write_bytes(b"PGDMP generated public verification fixture")
        INSPECT.FILES.transform("encrypt", root/"fixture.dump", root/"backup.cms", root/"recipient.crt")
        cls.reference = json.loads((INSPECT.ROOT/".github/operations/recovery-schema-reference-2e56def.json").read_text())
        now = datetime.now(timezone.utc).replace(microsecond=0)
        stamp = lambda d: d.strftime("%Y-%m-%dT%H:%M:%SZ")
        INSPECT.MANIFEST.sign(root/"backup.cms", root/"manifest.json", root/"signer.pub", root/"signer.key",
            root/"recipient.crt", "generated-public-inspection", cls.reference["applicationSha"], "SYNTHETIC_ONLY", stamp(now))
        with zipfile.ZipFile(root/"package.zip", "w") as archive:
            archive.write(root/"backup.cms", "backup.cms")
            archive.write(root/"manifest.json", "manifest.json")
        cls.binding = {"version": 1, "kind": "ENCRYPTED_SNAPSHOT_METADATA_ONLY", "independentRecoveryApproval": False,
                       "privateKeyRead": False, "backupBodyRead": False, "restoreVerified": False,
                       "backupId": "generated-public-inspection", "applicationSha": cls.reference["applicationSha"],
                       "sourceImage": cls.reference["sourceImage"], "snapshotBoundary": "SYNTHETIC_ONLY",
                       "expectedSigner": INSPECT.MANIFEST.fingerprint(root/"signer.pub"),
                       "expectedRecipient": INSPECT.MANIFEST.fingerprint(root/"recipient.crt", certificate=True),
                       "packageBytes": (root/"package.zip").stat().st_size,
                       "packageSha256": hashlib.sha256((root/"package.zip").read_bytes()).hexdigest(),
                       "notBefore": stamp(now-timedelta(minutes=5)), "notAfter": stamp(now)}

    @classmethod
    def tearDownClass(cls):
        cls.fixture.cleanup()

    def setUp(self):
        self.work = tempfile.TemporaryDirectory(prefix="generated-inspection-boundary-")
        self.addCleanup(self.work.cleanup)
        self.package = Path(self.work.name)/"package.zip"
        shutil.copyfile(self.root/"package.zip", self.package)
        self.receipt = dict(self.binding)

    def inspect(self, **changes):
        args = dict(package=self.package, public_key=self.root/"signer.pub", certificate=self.root/"recipient.crt",
                    binding=self.receipt, reference=self.reference)
        args.update(changes)
        # This public verifier must never invoke the encryption/decryption entry.
        with patch.object(INSPECT.FILES, "transform", side_effect=AssertionError("Unexpected transform")):
            return INSPECT.inspect_package(**args)

    def match_changed_package(self):
        self.receipt.update(packageBytes=self.package.stat().st_size,
                            packageSha256=hashlib.sha256(self.package.read_bytes()).hexdigest())

    def test_signed_encrypted_package_produces_context_without_private_key_or_plaintext(self):
        result = self.inspect()
        self.assertEqual(result["status"], "ENCRYPTED_PACKAGE_AUTHENTICATED_NO_RESTORE")
        self.assertEqual(result["context"]["schemaReferenceSha256"], self.reference["schemaSha256"])
        self.assertEqual(result["context"]["cipherSha256"], hashlib.sha256((self.root/"backup.cms").read_bytes()).hexdigest())
        for name in ("plaintextRead", "privateKeyRead", "productionSchemaVerified", "productionRestoreVerified", "realRecoveryReady"):
            self.assertFalse(result[name])
        self.assertNotIn("PRIVATE KEY", json.dumps(result))

    def test_exact_receipt_size_hash_truncation_and_symlink_boundaries(self):
        for change in ({"packageBytes": self.receipt["packageBytes"]+1}, {"packageSha256": "0"*64}, {"packageBytes": True}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.inspect(binding=dict(self.receipt, **change))
        self.package.write_bytes(self.package.read_bytes()[:-1])
        with self.assertRaisesRegex(ValueError, "PACKAGE_RECEIPT_SIZE_MISMATCH"):
            self.inspect()
        self.package.unlink()
        self.package.symlink_to(self.root/"package.zip")
        with self.assertRaises((ValueError, OSError)):
            self.inspect()

    def test_source_image_query_and_schema_reference_are_independent(self):
        for change in ({"applicationSha": "0"*40}, {"sourceImage": "sha256:"+"0"*64},
                       {"catalogQuerySha256": "0"*64}, {"schemaSha256": "invalid"}, {"productionSchemaVerified": True}):
            with patch.object(INSPECT.FILES, "regular_file") as opened:
                with self.subTest(change=change), self.assertRaisesRegex(ValueError, "REVIEWED_SOURCE_SCHEMA_REFERENCE_REQUIRED"):
                    self.inspect(reference=dict(self.reference, **change))
                opened.assert_not_called()

    def test_wrong_signer_recipient_and_time_window_rejected(self):
        for change in ({"expectedSigner": "0"*64}, {"expectedRecipient": "0"*64},
                       {"notBefore": "2000-01-01T00:00:00Z", "notAfter": "2000-01-02T00:00:00Z"}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.inspect(binding=dict(self.receipt, **change))

    def test_signature_corruption_detected_even_when_zip_receipt_matches(self):
        metadata = json.loads((self.root/"manifest.json").read_bytes())
        metadata["signature"] = ("0" if metadata["signature"][0] != "0" else "1") + metadata["signature"][1:]
        with zipfile.ZipFile(self.package, "w") as archive:
            archive.write(self.root/"backup.cms", "backup.cms")
            archive.writestr("manifest.json", INSPECT.MANIFEST.canonical(metadata))
        self.match_changed_package()
        with self.assertRaises(ValueError):
            self.inspect()

    def test_archive_extra_member_is_not_accepted_as_public_metadata(self):
        with zipfile.ZipFile(self.package, "a") as archive:
            archive.writestr("unexpected.txt", "generated-only")
        self.match_changed_package()
        with self.assertRaisesRegex(ValueError, "FIXED_PACKAGE_DIRECTORY_REQUIRED"):
            self.inspect()

    def test_cli_default_and_unknown_private_arguments_do_not_echo_values(self):
        for args, code, status in (([], 0, "OFFLINE_NO_ACTION"), (["--private-key", "never-echo"], 2, "UNSUPPORTED_PUBLIC_INSPECTION_ARGUMENTS")):
            result = subprocess.run([sys.executable, str(Path(__file__).with_name("inspect-recovery-package.py")), *args],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, code)
            self.assertEqual(json.loads(result.stdout)["status"], status)
            self.assertNotIn("never-echo", result.stdout+result.stderr)


if __name__ == "__main__":
    unittest.main()
