from datetime import datetime, timezone
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

import test_backup_manifest as fixtures


SPEC = importlib.util.spec_from_file_location("producer", Path(__file__).with_name("produce-backup.py"))
PRODUCER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PRODUCER)
PACKAGE_SPEC = importlib.util.spec_from_file_location("package", Path(__file__).with_name("recover-backup-package.py"))
PACKAGE = importlib.util.module_from_spec(PACKAGE_SPEC)
PACKAGE_SPEC.loader.exec_module(PACKAGE)


class BackupProducerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fixtures.BackupManifestTests.setUpClass()
        cls.root = fixtures.BackupManifestTests.root

    @classmethod
    def tearDownClass(cls):
        fixtures.BackupManifestTests.tearDownClass()

    setUp = fixtures.BackupManifestTests.setUp
    tearDown = fixtures.BackupManifestTests.tearDown
    sign = fixtures.BackupManifestTests.sign

    def create(self, code="import sys;sys.stdout.buffer.write(b'PGDMP synthetic producer fixture')", **changes):
        self.output = self.path / "complete.zip"
        arguments = dict(command=[sys.executable, "-c", code], output=self.output,
                         certificate=self.root / "recipient.crt", signing_public=self.root / "signer.pub",
                         signing_private=self.root / "signer.key", expected_signer=self.context["expected_signer"],
                         expected_recipient=self.context["expected_recipient"], backup_id="producer-fixture",
                         application_sha="a" * 40, boundary="ISOLATED", timeout=10)
        return PRODUCER.produce(**{**arguments, **changes})

    def recover(self):
        recovered = self.path / "recovered.dump"
        ended = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        PACKAGE.recover(self.output, recovered, self.root / "signer.pub", self.root / "recipient.crt",
                        self.root / "recipient.key", self.context["expected_signer"], self.context["expected_recipient"],
                        "producer-fixture", "a" * 40, "ISOLATED", "2026-01-01T00:00:00Z", ended,
                        max_package_bytes=1024 * 1024, max_cipher_bytes=512 * 1024)
        return recovered

    def test_real_stream_encryption_signature_and_atomic_package(self):
        self.create()
        self.assertEqual(self.recover().read_bytes(), b"PGDMP synthetic producer fixture")
        self.assertEqual(self.output.stat().st_mode & 0o777, 0o600)
        self.assertEqual(list(self.path.glob(".backup-producer-*")), [])

    def test_partial_output_then_producer_failure_publishes_nothing(self):
        with self.assertRaisesRegex(ValueError, "PIPELINE_FAILED"):
            self.create("import sys;sys.stdout.buffer.write(b'PGDMP partial');sys.exit(23)")
        self.assertFalse(self.output.exists())
        self.assertEqual(list(self.path.glob(".backup-producer-*")), [])

    def test_empty_and_non_postgres_output_are_rejected(self):
        for code in ["pass", "print('not a custom dump')"]:
            with self.subTest(code=code), self.assertRaisesRegex(ValueError, "PIPELINE_FAILED"):
                self.create(code)
            self.assertFalse(self.output.exists())

    def test_timeout_before_output_and_after_partial_output(self):
        for code in ["import time;time.sleep(30)",
                     "import sys,time;sys.stdout.buffer.write(b'PGDMP partial');sys.stdout.buffer.flush();time.sleep(30)"]:
            with self.subTest(code=code), self.assertRaisesRegex(ValueError, "TIMEOUT"):
                self.create(code, timeout=0.3)
            self.assertFalse(self.output.exists())
            self.assertEqual(list(self.path.glob(".backup-producer-*")), [])

    def test_untrusted_recipient_prevents_producer_execution(self):
        marker = self.path / "should-not-exist"
        with self.assertRaisesRegex(ValueError, "UNTRUSTED_RECIPIENT"):
            self.create("from pathlib import Path;Path(" + repr(str(marker)) + ").touch()", expected_recipient="0" * 64)
        self.assertFalse(marker.exists())

    def test_mismatched_signing_key_publishes_nothing(self):
        with self.assertRaises(ValueError):
            self.create(signing_private=self.root / "attacker.key")
        self.assertFalse(self.output.exists())

    def test_encryptor_failure_terminates_pipeline_without_publication(self):
        original = PRODUCER.subprocess.Popen
        def fail_encryptor(command, **kwargs):
            if command[:2] == ["openssl", "cms"]:
                return original([sys.executable, "-c", "raise SystemExit(7)"], **kwargs)
            return original(command, **kwargs)
        with patch.object(PRODUCER.subprocess, "Popen", side_effect=fail_encryptor):
            with self.assertRaisesRegex(ValueError, "PIPELINE_FAILED"):
                self.create("import sys,time;sys.stdout.buffer.write(b'PGDMP partial');sys.stdout.buffer.flush();time.sleep(30)")
        self.assertFalse(self.output.exists())
        self.assertEqual(list(self.path.glob(".backup-producer-*")), [])

    def test_existing_output_is_not_overwritten(self):
        target = self.path / "complete.zip"
        target.write_bytes(b"previous valid backup")
        with self.assertRaisesRegex(ValueError, "OUTPUT_ALREADY_EXISTS"):
            self.create()
        self.assertEqual(target.read_bytes(), b"previous valid backup")

    def test_missing_command_and_invalid_timeout_are_rejected(self):
        for changes in [dict(command=[]), dict(timeout=0), dict(timeout=float("nan"))]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.create(**changes)

    @unittest.skipUnless(os.environ.get("BACKUP_TEST_POSTGRES_CONTAINER"), "isolated PostgreSQL CI only")
    def test_real_pg_dump_producer_and_separate_pg_restore(self):
        container = os.environ["BACKUP_TEST_POSTGRES_CONTAINER"]
        prefix = ["docker", "exec", container]
        dbname = "producer_backup_fixture"
        restored = "producer_restore_fixture"
        def run(*args, **kwargs):
            return subprocess.run([*prefix, *args], check=True, stdout=subprocess.PIPE,
                                  stderr=subprocess.DEVNULL, **kwargs).stdout
        try:
            run("createdb", "-U", "postgres", dbname)
            run("psql", "-U", "postgres", "-d", dbname, "-v", "ON_ERROR_STOP=1", "-c",
                "CREATE TABLE backup_fixture(id integer PRIMARY KEY, value numeric(12,3)); INSERT INTO backup_fixture VALUES(1,12.345)")
            self.create(command=[*prefix, "pg_dump", "-U", "postgres", "--format=custom", "--no-owner", "--dbname=" + dbname])
            dump = self.recover()
            run("createdb", "-U", "postgres", restored)
            with dump.open("rb") as source:
                subprocess.run(["docker", "exec", "-i", container, "pg_restore", "-U", "postgres", "--exit-on-error",
                                "--no-owner", "--dbname=" + restored], stdin=source, check=True,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            result = run("psql", "-U", "postgres", "-d", restored, "-At", "-c", "SELECT id,value FROM backup_fixture")
            self.assertEqual(result.strip(), b"1|12.345")
        finally:
            for name in [restored, dbname]:
                run("dropdb", "-U", "postgres", "--if-exists", name)


if __name__ == "__main__":
    unittest.main()
