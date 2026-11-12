#!/usr/bin/env python3
"""Generated fixture only: actual signed CMS -> RAM -> isolated PostgreSQL."""

from datetime import datetime, timedelta, timezone
from contextlib import ExitStack
import base64
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
from unittest.mock import patch
import zipfile


SPEC = importlib.util.spec_from_file_location("isolated_restore", Path(__file__).with_name("restore-backup-isolated.py"))
RESTORE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RESTORE)
SPEC = importlib.util.spec_from_file_location("protected_restore", Path(__file__).with_name("restore-protected-handoff.py"))
BRIDGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BRIDGE)
SPEC = importlib.util.spec_from_file_location("owner_session", Path(__file__).with_name("run-recovery-session.py"))
SESSION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SESSION)
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
    psql(Path(__file__).with_name("recovery-domain-fixture.sql").read_text())
    preserved_before = psql(RESTORE.PRESERVED)
    domain_before = psql(RESTORE.DOMAIN_PRESERVED)
    if psql(RESTORE.DOMAIN_CHECK) != b"t\n":
        raise ValueError("GENERATED_DOMAIN_FIXTURE_REJECTED")
    domain_probes = {
        "stockBalance": 'UPDATE "CatalogProduct" SET "stockQuantity"=9.75 WHERE id=\'fixture-ml\';',
        "manualReceipt": 'UPDATE "InventoryOperation" SET response=jsonb_set(response,\'{quantityAfter}\',\'"9"\') WHERE id=\'fixture-in-ml\';',
        "crossTenantImport": 'UPDATE "InventoryOperation" SET response=\'{"ids":["supplier-product"]}\' WHERE id=\'fixture-import\';',
        "crossTenantAppointment": 'UPDATE "InventoryOperation" SET response=jsonb_set(response,\'{appointmentId}\',\'"supplier-appointment"\') WHERE id=\'fixture-parent\';',
        "scalarItems": 'UPDATE "InventoryOperation" SET response=jsonb_set(response,\'{items}\',\'42\') WHERE id=\'fixture-parent\';',
        "emptyItems": 'UPDATE "InventoryOperation" SET response=jsonb_set(response,\'{items}\',\'[]\') WHERE id=\'fixture-parent\';',
        "duplicateLine": 'UPDATE "InventoryOperation" SET response=jsonb_set(response,\'{items}\',jsonb_build_array(response->\'items\'->0,response->\'items\'->0)) WHERE id=\'fixture-parent\';',
        "missingMovement": 'UPDATE "InventoryOperation" SET response=jsonb_set(response,\'{items,0,movementId}\',\'"absent"\') WHERE id=\'fixture-parent\';',
        "orphanChild": 'UPDATE "InventoryOperation" SET response=jsonb_set(response,\'{parentOperationId}\',\'"absent"\') WHERE id=\'fixture-child-ml\';',
        "childKey": 'UPDATE "InventoryOperation" SET "keyHash"=repeat(\'f\',64) WHERE id=\'fixture-child-ml\';',
        "materialAmount": 'UPDATE "InventoryOperation" SET response=jsonb_set(response,\'{quantity}\',\'"1.5"\') WHERE id=\'fixture-child-ml\';',
        "b2bActor": 'UPDATE "B2BQuoteRequest" SET "requestedBy"=\'absent\' WHERE id=\'fixture-quote\';',
        "nonfiniteQuote": 'UPDATE "B2BQuoteRequest" SET "quotedUnitPrice"=\'NaN\'::numeric WHERE id=\'fixture-quote\';',
    }
    for probe, mutation in domain_probes.items():
        if psql("BEGIN;\n" + mutation + "\n" + RESTORE.DOMAIN_CHECK + "\nROLLBACK;\n") != b"f\n":
            raise ValueError("DOMAIN_DRIFT_PROBE_FAILED")
        if psql(RESTORE.DOMAIN_PRESERVED) != domain_before:
            raise ValueError("DOMAIN_PROBE_MODIFIED_SOURCE")
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
    # Independently migrated reference: canonicalization must not hide real
    # schema drift. Each probe rolls back and must leave the reference intact.
    schema_probes = {
        "columnType": 'ALTER TABLE public."Business" ALTER COLUMN name TYPE varchar(255);',
        "constraint": 'ALTER TABLE public."Business" ADD CONSTRAINT synthetic_recovery_name CHECK (name <> \'forbidden\');',
        "reviewedConstraintChanged": 'ALTER TABLE public."BeautyJobSatisfaction" DROP CONSTRAINT "BeautyJobSatisfaction_outcome_check"; ALTER TABLE public."BeautyJobSatisfaction" ADD CONSTRAINT "BeautyJobSatisfaction_outcome_check" CHECK (outcome IN (\'SATISFIED\', \'UNSATISFIED\'));',
        "enumLabel": 'ALTER TYPE public."AppointmentStatus" RENAME VALUE \'PENDING\' TO \'SYNTHETIC_PENDING\';',
        "migrationChecksum": "UPDATE public._prisma_migrations SET checksum = repeat('f', 64) WHERE migration_name = (SELECT min(migration_name) FROM public._prisma_migrations);",
    }
    for probe, ddl in schema_probes.items():
        changed = hashlib.sha256(psql("BEGIN;\n" + ddl + "\n" + RESTORE.CATALOG + "\nROLLBACK;\n")).hexdigest()
        if changed == expected or hashlib.sha256(psql(RESTORE.CATALOG)).hexdigest() != expected:
            raise ValueError("SCHEMA_DRIFT_PROBE_FAILED")
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
        handoff_context = dict(backupId=context["backup_id"], applicationSha=APPLICATION,
            cipherSha256=hashlib.sha256((root / "backup.cms").read_bytes()).hexdigest(),
            recipientCertificateSha256=context["expected_recipient"], signingPublicKeySha256=context["expected_signer"],
            schemaReferenceSha256=expected, snapshotBoundary="SYNTHETIC_ONLY",
            backupCreatedNotBefore=context["not_before"], backupCreatedNotAfter=context["not_after"])
        # Generated private material travels only on stdin to actual Node Web Crypto.
        # It never becomes a subprocess argument or a Docker input.
        wrap_program = '''
import { wrapRecoveryKey } from CLIENT_URL;
let text=''; for await (const c of process.stdin) text+=c;
const i=JSON.parse(text), decode=v=>new Uint8Array(Buffer.from(v,'base64'));
const capsule=await wrapRecoveryKey(decode(i.challenge), i.pin, decode(i.key), null);
process.stdout.write(Buffer.from(capsule));
'''.replace("CLIENT_URL", json.dumps(Path(__file__).with_name("wrap-recovery-handoff.mjs").resolve().as_uri()))
        with patch.object(BRIDGE.HANDOFF.MEMORY, "host_checks"):
            with BRIDGE.HANDOFF.KeyHandoff(handoff_context, (root / "recipient.crt").read_bytes()) as handoff:
                capsule = command(["node", "--input-type=module", "-e", wrap_program], input=json.dumps({
                    "challenge": base64.b64encode(handoff.challenge).decode(), "pin": handoff.challenge_sha256,
                    "key": base64.b64encode((root / "recipient.key").read_bytes()).decode()}).encode())
                encoded = base64.b64encode(capsule).decode()
                frame = ('ORZELL-CAPSULE-V1\n'+'\n'.join(encoded[i:i+256] for i in range(0,len(encoded),256))+'\nEND-ORZELL-CAPSULE\n').encode()
                reports = []
                report = SESSION.drive_session(BRIDGE, handoff, root / "package.zip", root / "signer.pub",
                    package_bytes=(root / "package.zip").stat().st_size, context=handoff_context,
                    reader=lambda deadline: SESSION.decode_frame(frame), output=reports.append)
                if report["actualBackupRestoredToIsolatedDatabase"] or report["productionDataRead"]:
                    raise ValueError("SYNTHETIC_SESSION_MISLABELLED")
                if handoff._private is not None or handoff._used is not True:
                    raise ValueError("HANDOFF_SESSION_NOT_CLOSED")
        with patch.object(memory, "host_checks"):
            try:
                RESTORE.recover_and_restore(context, "0" * 64, 180, acknowledge_invalidation=True)
            except ValueError as exc:
                if str(exc) != "OFFLINE_RESTORE_FAILED_SCHEMA":
                    raise
            else:
                raise ValueError("SCHEMA_DRIFT_WAS_ACCEPTED")
        # New negative boundary: valid schema with inconsistent business data
        # must fail inside the actual offline target and still remove that target.
        try:
            psql('UPDATE "CatalogProduct" SET "stockQuantity"=9.75 WHERE id=\'fixture-ml\';')
            bad_dump = command(["docker", "exec", container, "pg_dump", "-U", "postgres", "-Fc", "--no-owner", DATABASE])
        finally:
            psql('UPDATE "CatalogProduct" SET "stockQuantity"=8.75 WHERE id=\'fixture-ml\';')
        with ExitStack() as stack, tempfile.TemporaryDirectory(prefix="generated-domain-failure-") as config:
            descriptor = memory.VERIFIED.snapshot_stream(stack, io.BytesIO(bad_dump), max_bytes=RESTORE.MAX_DUMP)
            try:
                RESTORE._restore_sealed_dump(RESTORE.Docker(config), descriptor, expected, 180)
            except ValueError as exc:
                if str(exc) != "OFFLINE_RESTORE_FAILED_DOMAIN":
                    raise
            else:
                raise ValueError("DOMAIN_DRIFT_WAS_ACCEPTED")
        if psql(RESTORE.PRESERVED) != preserved_before:
            raise ValueError("SOURCE_FIXTURE_WAS_MODIFIED")
        if psql(RESTORE.DOMAIN_PRESERVED) != domain_before:
            raise ValueError("SOURCE_DOMAIN_FIXTURE_WAS_MODIFIED")
        remaining = command(["docker", "ps", "--all", "--filter", "label=" + RESTORE.LABEL, "--format", "{{.ID}}"])
        if remaining.strip():
            raise ValueError("FAILED_TARGET_WAS_NOT_REMOVED")
        report.update(status="SYNTHETIC_SIGNED_ISOLATED_RESTORE_PASSED", schemaReferenceSha256=expected,
                      domainMismatchRejected=True, domainDriftProbes=list(domain_probes),
                      schemaMismatchRejected=True, schemaDriftProbes=list(schema_probes), sourceUnchanged=True, privateKeyRead=False, productionDataRead=False,
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

