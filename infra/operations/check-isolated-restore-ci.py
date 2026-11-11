#!/usr/bin/env python3
"""Generated fixture only: actual signed CMS -> RAM -> isolated PostgreSQL."""

from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
from unittest.mock import patch
import zipfile
from contextlib import ExitStack
import io


SPEC = importlib.util.spec_from_file_location("isolated_restore", Path(__file__).with_name("restore-backup-isolated.py"))
RESTORE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RESTORE)
APPLICATION = "2e56def282c97a804a2f3d6c9b36a53b42a09df5"
DATABASE = "orzell_recovery_fixture"
FIXTURE = r'''
INSERT INTO "User" (id,email,"passwordHash","updatedAt") VALUES
 ('fixture-owner-a','a@example.test','previous-hash',now()),('fixture-owner-b','b@example.test','previous-hash',now());
INSERT INTO "Business" (id,name,slug,"updatedAt") VALUES ('fixture-business','Synthetic salon','synthetic-salon',now());
INSERT INTO "RefreshSession" (id,"userId","tokenHash","expiresAt","updatedAt") VALUES
 ('fixture-session','fixture-owner-a','synthetic-token-hash',now()+interval '1 day',now());
INSERT INTO "APIApplication" (id,"businessId",name,"createdBy","updatedAt") VALUES
 ('fixture-app','fixture-business','Synthetic API','fixture-owner-a',now());
INSERT INTO "APIClient" (id,"applicationId",name,"updatedAt") VALUES ('fixture-client','fixture-app','Synthetic client',now());
INSERT INTO "APICredential" (id,"clientId","keyId","secretHash",fingerprint) VALUES
 ('fixture-credential','fixture-client','synthetic-key-id','synthetic-secret-hash','synthetic-fingerprint');
INSERT INTO "PushDevice" (id,"businessId","userId",platform,"tokenHash","encryptedToken","updatedAt") VALUES
 ('fixture-device','fixture-business','fixture-owner-a','ios','synthetic-push-hash','synthetic-encrypted-token',now());
INSERT INTO "WebhookEndpoint" (id,"applicationId","businessId",url,events,"secretHash","secretCiphertext","secretIv","secretTag","updatedAt") VALUES
 ('fixture-endpoint','fixture-app','fixture-business','https://example.test/synthetic',ARRAY['synthetic'],'hash','cipher','iv','tag',now());
INSERT INTO "WebhookDelivery" (id,"endpointId","eventId","eventType","eventVersion",payload,"nextAttemptAt") VALUES
 ('fixture-delivery','fixture-endpoint','synthetic-event','synthetic',1,'{}',now());
INSERT INTO "MvpPhotoConsent" (id,"ownerId","policyVersion","noticeHash","expiresAt","auditExpiresAt","revokedAt") VALUES
 ('consent-a','fixture-owner-a','synthetic-policy',repeat('0',64),now()+interval '1 day',now()+interval '90 days',NULL),
 ('consent-b','fixture-owner-b','synthetic-policy',repeat('0',64),now()+interval '1 day',now()+interval '90 days',NULL),
 ('consent-revoked','fixture-owner-a','synthetic-policy',repeat('0',64),now()+interval '1 day',now()+interval '90 days',now()-interval '1 day');
INSERT INTO "MvpPhoto" (id,"ownerId","consentId","objectKey",mime,bytes,"uploadExpiresAt","expiresAt") VALUES
 ('photo-a','fixture-owner-a','consent-a','private/synthetic-a','image/jpeg',12,now(),now()+interval '1 day'),
 ('photo-b','fixture-owner-b','consent-b','private/synthetic-b','image/jpeg',12,now(),now()+interval '1 day'),
 ('photo-revoked','fixture-owner-a','consent-revoked','private/synthetic-c','image/jpeg',12,now(),now()+interval '1 day');
INSERT INTO "MvpPhotoAnalysis" (id,"ownerId","photoId",intent,target,answers,status,output,"matchingStatus","matchingRequestId","matchingOutput","expiresAt","updatedAt") VALUES
 ('analysis-a','fixture-owner-a','photo-a','synthetic intent','synthetic target','["synthetic"]','PLAN','{"synthetic":true}','COMPLETED','synthetic-match','{"synthetic":true}',now()+interval '1 day',now()),
 ('analysis-b','fixture-owner-b','photo-b','','','[]','REVOKED',NULL,'RUNNING','stale-match',NULL,now()+interval '1 day',now()),
 ('analysis-c','fixture-owner-a','photo-revoked','old intent','old target','[]','PLAN','{}',NULL,NULL,NULL,now()+interval '1 day',now());
INSERT INTO "MvpPrivacyEvent" (id,"ownerId","resourceId",action,"correlationId","expiresAt") VALUES
 ('original-withdrawal','fixture-owner-a','consent-revoked','photo.consent.withdrawn','synthetic-correlation',now()+interval '90 days');
'''


def command(args, **kwargs):
    return subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                          timeout=60, check=True, **kwargs).stdout


def main():
    if os.environ.get("CI") != "true" or os.environ.get("ISOLATED_RESTORE_APPLICATION") != APPLICATION:
        raise ValueError("EXPLICIT_GENERATED_CI_FIXTURE_REQUIRED")
    container = os.environ.get("ISOLATED_RESTORE_POSTGRES_CONTAINER", "")
    if not re.fullmatch(r"[0-9a-f]{64}", container):
        raise ValueError("FIXTURE_CONTAINER_REQUIRED")
    config = json.loads(command(["docker", "inspect", container]))[0]
    env = config["Config"]["Env"]
    if "POSTGRES_DB=" + DATABASE not in env or "POSTGRES_USER=postgres" not in env:
        raise ValueError("FIXTURE_DATABASE_BINDING_REQUIRED")
    if config["HostConfig"]["PortBindings"]["5432/tcp"][0]["HostIp"] != "127.0.0.1":
        raise ValueError("FIXTURE_LOOPBACK_BINDING_REQUIRED")

    def psql(sql):
        return command(["docker", "exec", "-i", container, "psql", "-X", "-qAt", "-U", "postgres",
                        "-d", DATABASE, "-v", "ON_ERROR_STOP=1"], input=sql.encode())

    password_hash = command(["node", "-e", "const b=require('./application/apps/api/node_modules/bcryptjs'); process.stdout.write(b.hashSync('synthetic-fixture-password',12));"]).decode()
    if not re.fullmatch(r"\$2[aby]\$12\$[./A-Za-z0-9]{53}", password_hash):
        raise ValueError("SYNTHETIC_PASSWORD_FIXTURE_REQUIRED")
    command(["node", "-e", "const b=require('./application/apps/api/node_modules/bcryptjs'); if(b.compareSync('synthetic-fixture-password','!orzell-recovery-disabled!')) process.exit(1);"])
    psql(FIXTURE.replace("previous-hash", password_hash))
    preserved_before = psql(RESTORE.PRESERVED)
    for prefix in ("", "SET orzell.restore_quarantine='confirmed-offline'; SET orzell.auth_quarantine='confirmed-offline-reset'; SET orzell.restore_database='wrong';\n"):
        try:
            psql(prefix + RESTORE.QUARANTINE)
        except subprocess.CalledProcessError:
            pass
        else:
            raise ValueError("QUARANTINE_GUARD_FAILED")
    if psql(RESTORE.PRESERVED) != preserved_before:
        raise ValueError("GUARD_MODIFIED_FIXTURE")
    # Independent reference comes from the separately migrated reviewed source,
    # never from the restored target that is about to be checked.
    expected = hashlib.sha256(psql(RESTORE.CATALOG)).hexdigest()
    with tempfile.TemporaryDirectory(prefix="orzell-generated-restore-") as directory:
        root = Path(directory)
        dump = command(["docker", "exec", container, "pg_dump", "-U", "postgres", "-Fc", "--no-owner", DATABASE])
        (root / "fixture.dump").write_bytes(dump)
        for name in ("recipient", "signer"):
            command(["openssl", "req", "-x509", "-newkey", "rsa:3072", "-nodes", "-keyout", str(root / (name + ".key")),
                     "-out", str(root / (name + ".crt")), "-subj", "/CN=synthetic-offline-restore", "-days", "1"])
            command(["openssl", "pkey", "-in", str(root / (name + ".key")), "-pubout", "-out", str(root / (name + ".pub"))])
        memory = RESTORE.MEMORY
        memory.FILES.transform("encrypt", root / "fixture.dump", root / "backup.cms", root / "recipient.crt")
        now = datetime.now(timezone.utc)
        stamp = lambda d: d.strftime("%Y-%m-%dT%H:%M:%SZ")
        memory.MANIFEST.sign(root / "backup.cms", root / "manifest.json", root / "signer.pub", root / "signer.key",
                             root / "recipient.crt", "synthetic-isolated-restore", APPLICATION, "SYNTHETIC_ONLY", stamp(now))
        with zipfile.ZipFile(root / "package.zip", "w", compression=zipfile.ZIP_STORED) as archive:
            archive.write(root / "backup.cms", "backup.cms")
            archive.write(root / "manifest.json", "manifest.json")
        context = dict(package=root / "package.zip", public_key=root / "signer.pub", certificate=root / "recipient.crt",
                       private_key=root / "recipient.key", expected_signer=memory.MANIFEST.fingerprint(root / "signer.pub"),
                       expected_recipient=memory.MANIFEST.fingerprint(root / "recipient.crt", certificate=True),
                       backup_id="synthetic-isolated-restore", application_sha=APPLICATION, boundary="SYNTHETIC_ONLY",
                       not_before=stamp(now - timedelta(minutes=5)), not_after=stamp(now),
                       max_package_bytes=RESTORE.MAX_DUMP, max_cipher_bytes=RESTORE.MAX_DUMP,
                       max_plaintext_bytes=RESTORE.MAX_DUMP, decrypt_timeout_seconds=30)
        # Only generated synthetic material. CI is NOT a real-data host approval.
        with patch.object(memory, "host_checks"):
            try:
                report = RESTORE.recover_and_restore(context, expected, 180, acknowledge_invalidation=True)
            except ValueError as failure:
                if str(failure) == "OFFLINE_RESTORE_FAILED_SCHEMA":
                    # Diagnostics are restricted to this locally generated CI
                    # fixture. No owner-input mode or production data route.
                    observed = []
                    original_script = RESTORE.script
                    def diagnostic_script(value):
                        body = original_script(value)
                        marker = "stage=schema\ntest \"$(fingerprint)\" = '" + value + "'"
                        return body.replace(marker, "stage=schema\nquery /work/catalog.sql /work/catalog.json\ncat /work/catalog.json\nexit 0")
                    class DiagnosticDocker(RESTORE.Docker):
                        def __call__(self, *args, **kwargs):
                            output = super().__call__(*args, **kwargs)
                            if args[0] == "start":
                                observed.extend(json.loads(output))
                                return RESTORE.MARKER
                            return output
                    with ExitStack() as stack, tempfile.TemporaryDirectory() as config, patch.object(RESTORE, "script", side_effect=diagnostic_script):
                        descriptor = memory.VERIFIED.snapshot_stream(stack, io.BytesIO(dump), max_bytes=RESTORE.MAX_DUMP)
                        RESTORE._restore_sealed_dump(DiagnosticDocker(config), descriptor, expected, 180)
                    reference = json.loads(psql(RESTORE.CATALOG))
                    canonical = lambda v: json.dumps(v, sort_keys=True, ensure_ascii=True)
                    expected_set = {canonical(v) for v in reference}
                    observed_set = {canonical(v) for v in observed}
                    missing = [json.loads(v)[:3] for v in sorted(expected_set - observed_set)]
                    extra = [json.loads(v)[:3] for v in sorted(observed_set - expected_set)]
                    print(json.dumps({"generatedFixtureCatalogDiff": True, "referenceItems": len(reference),
                                      "targetItems": len(observed), "missing": missing[:20], "extra": extra[:20]}))
                raise
            try:
                RESTORE.recover_and_restore(context, "0" * 64, 180, acknowledge_invalidation=True)
            except ValueError as exc:
                if str(exc) != "OFFLINE_RESTORE_FAILED_SCHEMA":
                    raise
            else:
                raise ValueError("SCHEMA_DRIFT_WAS_ACCEPTED")
        if psql(RESTORE.PRESERVED) != preserved_before:
            raise ValueError("SOURCE_FIXTURE_WAS_MODIFIED")
        remaining = command(["docker", "ps", "--all", "--filter", "label=" + RESTORE.LABEL, "--format", "{{.ID}}"])
        if remaining.strip():
            raise ValueError("FAILED_TARGET_WAS_NOT_REMOVED")
        report.update(status="SYNTHETIC_SIGNED_ISOLATED_RESTORE_PASSED", schemaReferenceSha256=expected,
                      schemaMismatchRejected=True, sourceUnchanged=True, privateKeyRead=False, productionDataRead=False,
                      productionRestoreVerified=False, realRecoveryReady=False, physicalObjectErasureVerified=False)
        Path("isolated-restore-evidence.json").write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"status": "SYNTHETIC_RESTORE_FAILED", "errorType": type(exc).__name__,
                          "reason": str(exc) if isinstance(exc, ValueError) and re.fullmatch(r"[A-Z_]+", str(exc)) else "FIXTURE_FAILED"}))
        raise SystemExit(1)
