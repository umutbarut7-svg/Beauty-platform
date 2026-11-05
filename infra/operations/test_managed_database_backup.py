import base64
import copy
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import test_backup_manifest as fixtures


SPEC = importlib.util.spec_from_file_location("managed", Path(__file__).with_name("managed-database-backup.py"))
MANAGED = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MANAGED)
PACKAGE_SPEC = importlib.util.spec_from_file_location("package", Path(__file__).with_name("recover-backup-package.py"))
PACKAGE = importlib.util.module_from_spec(PACKAGE_SPEC)
PACKAGE_SPEC.loader.exec_module(PACKAGE)


def lifecycle():
    return {"Rules": [
        {"ID": "ApprovedThirtyDayBackupRetention", "Status": "Enabled", "Filter": {"Prefix": "encrypted/v1/"},
         "Expiration": {"Days": 30}, "NoncurrentVersionExpiration": {"NoncurrentDays": 1}, "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 1}},
        {"ID": "RemoveExpiredBackupDeleteMarkers", "Status": "Enabled", "Filter": {"Prefix": "encrypted/v1/"}, "Expiration": {"ExpiredObjectDeleteMarker": True}},
    ]}


class ManagedBackupTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(dir=Path.home())
        self.root = Path(self.temporary.name)
        (self.root / "state").mkdir(mode=0o700)
        self.patch = patch.object(MANAGED, "ROOT", self.root)
        self.patch.start()
        self.settings = {"version": 1, "recipient": MANAGED.PIN, "signer": "a" * 64, "application": MANAGED.APPLICATION, "image": MANAGED.IMAGE, "release": "b" * 40}
        MANAGED.atomic_json(self.root / "managed-config.json", self.settings)
        self.now = datetime.now(timezone.utc).replace(microsecond=0)
        self.calls, self.created = [], 0
        self.remote = None
        self.corrupt = False
        self.retention = lifecycle()

    def tearDown(self):
        self.patch.stop()
        self.temporary.cleanup()

    def aws(self, service, operation, *args):
        self.calls.append((service, operation, args))
        if operation == "get-caller-identity":
            return {"Account": MANAGED.ACCOUNT, "Arn": "arn:aws:sts::" + MANAGED.ACCOUNT + ":assumed-role/" + MANAGED.ROLE + "/fixture"}
        if operation == "get-bucket-versioning":
            return {"Status": "Enabled"}
        if operation == "get-public-access-block":
            return {"PublicAccessBlockConfiguration": {key: True for key in ["BlockPublicAcls", "IgnorePublicAcls", "BlockPublicPolicy", "RestrictPublicBuckets"]}}
        if operation == "get-bucket-lifecycle-configuration":
            return copy.deepcopy(self.retention)
        if operation == "put-object":
            self.assertEqual(args[args.index("--if-none-match") + 1], "*")
            self.remote = Path(args[args.index("--body") + 1]).read_bytes()
        if operation in ["put-object", "get-object"]:
            checksum = base64.b64encode(hashlib.sha256(self.remote).digest()).decode()
            if operation == "get-object":
                Path(args[-1]).write_bytes(self.remote + (b"changed" if self.corrupt else b""))
            return {"VersionId": "fixture-version", "ETag": '"fixture-etag"', "ChecksumSHA256": checksum, "ServerSideEncryption": "AES256"}
        if operation == "put-metric-data":
            return {}
        raise AssertionError("Unexpected operation")

    def create(self, output, backup_id, settings):
        self.created += 1
        output.write_bytes(b"synthetic encrypted signed package fixture")
        output.chmod(0o600)

    def backup(self, **changes):
        return MANAGED.backup(**{**dict(call=self.aws, create=self.create, snapshot=lambda: {"source": "unchanged"}, now=self.now), **changes})

    def test_verified_daily_upload_receipt_and_staging_cleanup(self):
        report = self.backup()
        self.assertEqual(report["status"], "BACKUP_VERIFIED")
        self.assertFalse(report["privateRecoveryKeyUsed"])
        self.assertEqual(report["retentionDays"], 30)
        self.assertTrue(MANAGED.status()["healthy"])
        self.assertEqual(list((self.root / "runs").rglob("*.zip")), [])
        self.assertTrue(next((self.root / "runs").rglob("result.json")).is_file())

    def test_same_day_does_not_dump_or_upload_twice(self):
        self.backup()
        again = self.backup()
        self.assertTrue(again["alreadyComplete"])
        self.assertEqual(self.created, 1)
        self.assertEqual(sum(item[1] == "put-object" for item in self.calls), 1)

    def test_ambiguous_upload_keeps_marker_and_refuses_blind_retry(self):
        original = self.aws
        def uncertain(service, operation, *args):
            result = original(service, operation, *args)
            if operation == "put-object":
                raise TimeoutError("synthetic ambiguous request")
            return result
        with self.assertRaises(TimeoutError):
            self.backup(call=uncertain)
        with self.assertRaisesRegex(ValueError, "NO_RETRY"):
            self.backup()
        self.assertEqual(self.created, 1)

    def test_bad_retention_fails_before_database_producer(self):
        self.retention["Rules"][0]["Expiration"]["Days"] = 7
        with self.assertRaisesRegex(ValueError, "RETENTION_DAYS"):
            self.backup()
        self.assertEqual(self.created, 0)

    def test_corrupt_readback_never_sets_success(self):
        self.corrupt = True
        with self.assertRaisesRegex(ValueError, "READBACK"):
            self.backup()
        self.assertFalse(MANAGED.status()["healthy"])
        self.assertEqual(list((self.root / "runs").rglob("result.json")), [])

    def test_changed_source_stops_before_upload(self):
        snapshots = iter([{"source": "old"}, {"source": "new"}])
        with self.assertRaisesRegex(ValueError, "SOURCE_CHANGED"):
            self.backup(snapshot=lambda: next(snapshots))
        self.assertFalse(any(item[1] == "put-object" for item in self.calls))

    def test_disk_reserve_and_size_limits_prevent_publication(self):
        with patch.object(MANAGED.shutil, "disk_usage", return_value=type("Disk", (), {"free": 1})()):
            with self.assertRaisesRegex(ValueError, "DISK_RESERVE"):
                self.backup()
        self.assertEqual(self.created, 0)
        path = self.root / "oversized"
        with path.open("wb") as stream:
            stream.truncate(MANAGED.LIMIT + 1)
        path.chmod(0o600)
        with self.assertRaisesRegex(ValueError, "SIZE_LIMIT"):
            MANAGED.file_digest(path)

    def test_health_detects_stale_failed_and_abandoned_runs(self):
        for status, delta, expected in [("SUCCESS", 100, True), ("FAILED", 100, False), ("RUNNING", 100, True), ("RUNNING", 1000, False)]:
            MANAGED.atomic_json(self.root / "state/state.json", {"lastSuccessAt": MANAGED.timestamp(self.now - timedelta(hours=1)),
                "lastAttemptAt": MANAGED.timestamp(self.now - timedelta(seconds=delta)), "lastAttemptStatus": status}, replace=True)
            self.assertIs(MANAGED.status(self.now)["healthy"], expected)
        MANAGED.atomic_json(self.root / "state/state.json", {"lastSuccessAt": MANAGED.timestamp(self.now - timedelta(hours=27)), "lastAttemptStatus": "SUCCESS"}, replace=True)
        self.assertFalse(MANAGED.status(self.now)["healthy"])

    def test_unsafe_config_and_extra_lifecycle_filter_are_rejected(self):
        (self.root / "managed-config.json").chmod(0o644)
        with self.assertRaisesRegex(ValueError, "UNSAFE"):
            self.backup()
        changed = lifecycle()
        changed["Rules"][0]["Filter"]["Tag"] = {"Key": "hidden", "Value": "subset"}
        with self.assertRaisesRegex(ValueError, "PREFIX"):
            MANAGED.approved_lifecycle(changed)

    @unittest.skipUnless(os.environ.get("BACKUP_TEST_POSTGRES_CONTAINER"), "isolated PostgreSQL CI only")
    def test_actual_pg_dump_managed_package_decrypt_and_separate_restore(self):
        fixtures.BackupManifestTests.setUpClass()
        keys = fixtures.BackupManifestTests.root
        container = os.environ["BACKUP_TEST_POSTGRES_CONTAINER"]
        def docker(*args, **kwargs):
            return subprocess.run(["docker", "exec", container, *args], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                  check=True, **kwargs).stdout
        try:
            (self.root / "trust").mkdir(mode=0o700)
            (self.root / "signing").mkdir(mode=0o700)
            for source, destination in [(keys / "recipient.crt", self.root / "trust/orzell-recovery-241abc0895734f65.crt"),
                                        (keys / "signer.pub", self.root / "signing/signer.pub"), (keys / "signer.key", self.root / "signing/signer.key")]:
                destination.write_bytes(source.read_bytes()); destination.chmod(0o600)
            recipient = PACKAGE.VERIFIED.MANIFEST.fingerprint(keys / "recipient.crt", certificate=True)
            signer = PACKAGE.VERIFIED.MANIFEST.fingerprint(keys / "signer.pub")
            self.settings.update({"recipient": recipient, "signer": signer})
            MANAGED.atomic_json(self.root / "managed-config.json", self.settings, replace=True)
            docker("createdb", "-U", "postgres", "managed_backup_fixture")
            docker("psql", "-U", "postgres", "-d", "managed_backup_fixture", "-v", "ON_ERROR_STOP=1", "-c",
                   "CREATE TABLE sample(id integer PRIMARY KEY, value numeric(12,3)); INSERT INTO sample VALUES(1,12.345)")
            start = MANAGED.timestamp(datetime.now(timezone.utc) - timedelta(minutes=1))
            with patch.object(MANAGED, "PIN", recipient), patch.object(MANAGED, "dump_command", return_value=["docker", "exec", container, "pg_dump", "-U", "postgres", "--format=custom", "--no-owner", "--dbname=managed_backup_fixture"]):
                report = self.backup(create=MANAGED.produce)
            encrypted = self.root / "retrieved.zip"
            encrypted.write_bytes(self.remote); encrypted.chmod(0o600)
            dump = self.root / "restored.dump"
            end = MANAGED.timestamp(datetime.now(timezone.utc))
            PACKAGE.recover(encrypted, dump, keys / "signer.pub", keys / "recipient.crt", keys / "recipient.key", signer, recipient,
                            report["backupId"], MANAGED.APPLICATION, "LIVE_DAILY_SNAPSHOT", start, end,
                            max_package_bytes=16 * 1024 * 1024, max_cipher_bytes=15 * 1024 * 1024)
            docker("createdb", "-U", "postgres", "managed_restore_fixture")
            with dump.open("rb") as source:
                subprocess.run(["docker", "exec", "-i", container, "pg_restore", "-U", "postgres", "--exit-on-error", "--no-owner", "--dbname=managed_restore_fixture"],
                               stdin=source, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
            self.assertEqual(docker("psql", "-U", "postgres", "-d", "managed_restore_fixture", "-At", "-c", "SELECT id,value FROM sample").strip(), b"1|12.345")
        finally:
            for name in ["managed_restore_fixture", "managed_backup_fixture"]:
                docker("dropdb", "-U", "postgres", "--if-exists", name)
            fixtures.BackupManifestTests.tearDownClass()


if __name__ == "__main__":
    unittest.main()
