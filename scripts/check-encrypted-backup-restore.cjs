"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID, randomBytes, createHash } = require("node:crypto");
const { execFileSync, spawn } = require("node:child_process");
const { once } = require("node:events");
require("reflect-metadata");
const { PrismaClient } = require("@prisma/client");
const { VisualService } = require("./dist/mvp/visual.service.js");
const SOURCE =
  "postgresql://postgres:postgres@127.0.0.1:5432/beauty_privacy_backup_ci?schema=public";
const TARGET =
  "postgresql://postgres:postgres@127.0.0.1:5432/beauty_privacy_restore_ci?schema=public";
const BOUNDARY = process.env.PRIVACY_SNAPSHOT_BOUNDARY;
const BEFORE_WITHDRAWAL = BOUNDARY === "BEFORE_WITHDRAWAL_COMMIT";
const POLICY = "synthetic-restore-fixture-not-public-policy";
let stage = "isolated-configuration";
async function main() {
  assert.equal(process.env.CI, "true");
  assert.ok(
    ["BEFORE_WITHDRAWAL_COMMIT", "AFTER_WITHDRAWAL_COMMIT"].includes(BOUNDARY),
  );
  assert.equal(process.env.PRIVACY_RESTORE_FIXTURE, "confirmed");
  assert.equal(process.env.NODE_ENV, "test");
  assert.equal(process.env.DATABASE_URL, SOURCE);
  assert.equal(process.env.MVP_S3_ENABLED, "false");
  assert.equal(process.env.MVP_AI_ENABLED, "false");
  const container = process.env.PRIVACY_POSTGRES_CONTAINER;
  assert.match(container, /^[0-9a-f]{64}$/);
  const containerConfig = execFileSync(
    "docker",
    ["inspect", "--format", "{{json .Config.Env}}", container],
    { encoding: "utf8" },
  );
  assert.ok(
    JSON.parse(containerConfig).includes(
      "POSTGRES_DB=beauty_privacy_backup_ci",
    ),
  );
  const root = await fs.mkdtemp(
    path.join(process.env.RUNNER_TEMP, "privacy-restore-"),
  );
  const source = new PrismaClient({ datasourceUrl: SOURCE });
  const restored = new PrismaClient({ datasourceUrl: TARGET });
  const ownerId = `restore-${randomUUID()}`;
  const owner = { id: ownerId, role: "CUSTOMER" };
  const sourceVisual = new VisualService(source, null, null, null, null);
  const restoredVisual = new VisualService(restored, null, null, null, null);
  const future = () => new Date(Date.now() + 86400000);
  const exists = (file) =>
    fs.access(file).then(
      () => true,
      () => false,
    );
  const docker = (args, options = {}) =>
    execFileSync("docker", ["exec", ...args], {
      timeout: 60000,
      maxBuffer: 64 * 1024 * 1024,
      ...options,
    });
  async function fixture(expiresAt, fixtureOwnerId = ownerId) {
    const consent = await source.mvpPhotoConsent.create({
      data: {
        ownerId: fixtureOwnerId,
        policyVersion: POLICY,
        noticeHash: "0".repeat(64),
        expiresAt,
        auditExpiresAt: new Date(Date.now() + 90 * 86400000),
      },
    });
    const keyId = `f33f33f3-${randomUUID().slice(9)}`;
    const file = path.join(root, keyId);
    await fs.writeFile(file, "synthetic restore fixture");
    const photo = await source.mvpPhoto.create({
      data: {
        ownerId: fixtureOwnerId,
        consentId: consent.id,
        objectKey: `private/mvp/${keyId}`,
        mime: "image/jpeg",
        bytes: 25,
        uploadExpiresAt: new Date(Date.now() - 60000),
        expiresAt,
      },
    });
    const analysis = await source.mvpPhotoAnalysis.create({
      data: {
        ownerId: fixtureOwnerId,
        photoId: photo.id,
        expiresAt,
        status: "PLAN",
        intent: "synthetic intent",
        target: "synthetic target",
        answers: ["synthetic answer"],
        output: { steps: ["synthetic plan"] },
        matchingStatus: "COMPLETED",
        matchingRequestId: randomUUID(),
        matchingOutput: {
          results: ["synthetic saved matching content"],
          revision: 0,
        },
      },
    });
    return { consent, photo, analysis, file };
  }
  async function hidden(item) {
    await assert.rejects(
      () =>
        restoredVisual.get(
          { id: item.photo.ownerId, role: "CUSTOMER" },
          item.analysis.id,
        ),
      (error) => error.getStatus?.() === 404,
    );
  }
  async function cleanupWorker() {
    const child = spawn(
      process.execPath,
      [
        "--require",
        "./privacy-restore-preload.cjs",
        "dist/worker.js",
        "--privacy-cleanup",
        "--once",
      ],
      {
        env: {
          ...process.env,
          DATABASE_URL: TARGET,
          PRIVACY_RESTORE_ROOT: root,
          STAGE33_MVP_ENABLED: "false",
          MVP_PHOTO_POLICY_REVIEWED: "false",
          MVP_VERIFICATION_POLICY_REVIEWED: "false",
          MVP_SEMANTIC_ENABLED: "false",
          MVP_REDIS_ENABLED: "false",
          OPENAI_API_KEY: "",
          JWT_ACCESS_SECRET: randomBytes(48).toString("hex"),
          JWT_REFRESH_SECRET: randomBytes(48).toString("hex"),
        },
        stdio: "ignore",
      },
    );
    const ended = once(child, "exit");
    const timer = setTimeout(() => child.kill("SIGKILL"), 60000);
    try {
      const [code] = await ended;
      assert.equal(code, 0);
    } finally {
      clearTimeout(timer);
    }
  }
  try {
    await source.$connect();
    await source.user.create({
      data: {
        id: ownerId,
        email: `${ownerId}@example.test`,
        passwordHash: "not-a-login-hash",
      },
    });
    const buyer = await source.business.create({
      data: {
        name: "Synthetic recovery buyer",
        slug: `recovery-${randomUUID()}`,
      },
    });
    const supplier = await source.business.create({
      data: {
        name: "Synthetic recovery supplier",
        slug: `recovery-${randomUUID()}`,
      },
    });
    const product = await source.catalogProduct.create({
      data: {
        businessId: supplier.id,
        sku: "RECOVERY-ML",
        name: "Synthetic material",
        price: "123.45",
        currency: "TRY",
        unit: "ML",
        stockQuantity: "9.125",
        lowStockThreshold: "1.500",
        b2bAvailable: true,
      },
    });
    const operation = await source.inventoryOperation.create({
      data: {
        businessId: supplier.id,
        actorId: ownerId,
        keyHash: "a".repeat(64),
        requestHash: "b".repeat(64),
        type: "MOVEMENT",
        response: {
          kind: "APPOINTMENT_CONSUMPTION",
          fixtureOnly: true,
          materials: [{ productId: product.id, quantity: "0.875" }],
        },
      },
    });
    await source.inventoryMovement.create({
      data: {
        businessId: supplier.id,
        productId: product.id,
        operationId: operation.id,
        direction: "OUT",
        quantity: "0.875",
        quantityAfter: "9.125",
        reason: "Synthetic recovery snapshot",
      },
    });
    await source.supplierProfile.create({
      data: {
        businessId: supplier.id,
        kind: "WHOLESALER",
        description: "Synthetic offline recovery fixture",
      },
    });
    await source.b2BQuoteRequest.create({
      data: {
        buyerBusinessId: buyer.id,
        supplierBusinessId: supplier.id,
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        unit: "ML",
        quantity: "2.125",
        buyerNote: "Synthetic recovery fixture",
        requestedBy: ownerId,
        keyHash: "c".repeat(64),
        requestHash: "d".repeat(64),
      },
    });
    const catalogSnapshot = async (db) =>
      JSON.parse(
        JSON.stringify({
          products: await db.catalogProduct.findMany({
            orderBy: { id: "asc" },
          }),
          operations: await db.inventoryOperation.findMany({
            orderBy: { id: "asc" },
          }),
          movements: await db.inventoryMovement.findMany({
            orderBy: { id: "asc" },
          }),
          suppliers: await db.supplierProfile.findMany({
            orderBy: { businessId: "asc" },
          }),
          quotes: await db.b2BQuoteRequest.findMany({ orderBy: { id: "asc" } }),
        }),
      );
    const expectedCatalog = await catalogSnapshot(source);
    const otherOwnerId = `restore-other-${randomUUID()}`;
    await source.user.create({
      data: {
        id: otherOwnerId,
        email: `${otherOwnerId}@example.test`,
        passwordHash: "not-a-login-hash",
      },
    });
    const other = await fixture(future(), otherOwnerId);
    const retained = await fixture(future());
    const expired = await fixture(new Date(Date.now() + 2000));
    const revoked = await fixture(future());
    const snapshot = () =>
      docker([
        container,
        "pg_dump",
        "-U",
        "postgres",
        "--format=custom",
        "--no-owner",
        "--dbname=beauty_privacy_backup_ci",
      ]);
    stage = "snapshot-before-withdrawal";
    const earlierDump = BEFORE_WITHDRAWAL ? snapshot() : null;
    stage = "authoritative-withdrawal";
    const withdrawal = await sourceVisual.withdraw(owner, revoked.consent.id);
    assert.equal(withdrawal.physicalErasure, "PENDING_WORKER");
    assert.equal(
      (
        await source.mvpPhoto.findUniqueOrThrow({
          where: { id: revoked.photo.id },
        })
      ).deletedAt,
      null,
    );
    stage = "postgres-custom-backup";
    const dump = earlierDump ?? snapshot();
    assert.ok(dump.length > 1000);
    const plaintext = path.join(root, "snapshot.dump");
    const encrypted = path.join(root, "snapshot.cms");
    const recovered = path.join(root, "authenticated.dump");
    const key = path.join(root, "fixture.key");
    const certificate = path.join(root, "fixture.crt");
    await fs.writeFile(plaintext, dump, { mode: 0o600 });
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:3072",
        "-nodes",
        "-keyout",
        key,
        "-out",
        certificate,
        "-subj",
        "/CN=synthetic-restore-fixture",
        "-days",
        "1",
      ],
      { stdio: "ignore", timeout: 30000 },
    );
    execFileSync(
      "python3",
      [
        "encrypted-backup.py",
        "encrypt",
        "--input",
        plaintext,
        "--output",
        encrypted,
        "--certificate",
        certificate,
      ],
      { stdio: "ignore", timeout: 60000 },
    );
    await fs.rm(plaintext);
    assert.equal(await exists(plaintext), false);
    execFileSync(
      "python3",
      [
        "encrypted-backup.py",
        "decrypt",
        "--input",
        encrypted,
        "--output",
        recovered,
        "--certificate",
        certificate,
        "--private-key",
        key,
      ],
      { stdio: "ignore", timeout: 60000 },
    );
    const authenticatedDump = await fs.readFile(recovered);
    assert.deepEqual(authenticatedDump, dump);
    assert.equal((await fs.stat(encrypted)).mode & 0o777, 0o600);
    assert.equal((await fs.stat(recovered)).mode & 0o777, 0o600);
    console.log(
      "PASS: AES-256-GCM CMS encrypted dump; RSA-OAEP recipient; plaintext published only after authentication",
    );
    await source.$disconnect();
    console.log(
      `PASS: actual pg_dump snapshot boundary ${BOUNDARY}; source withdrawal committed and source connection closed`,
    );
    stage = "restore-into-separate-database";
    docker([
      container,
      "createdb",
      "-U",
      "postgres",
      "beauty_privacy_restore_ci",
    ]);
    docker(
      [
        "-i",
        container,
        "pg_restore",
        "-U",
        "postgres",
        "--no-owner",
        "--exit-on-error",
        "--dbname=beauty_privacy_restore_ci",
      ],
      { input: authenticatedDump },
    );
    await restored.$connect();
    assert.deepEqual(await catalogSnapshot(restored), expectedCatalog);
    const database = await restored.$queryRawUnsafe(
      "SELECT current_database() AS name",
    );
    assert.equal(database[0].name, "beauty_privacy_restore_ci");
    assert.equal(await restored.mvpPhoto.count({ where: { ownerId } }), 3);
    assert.equal(
      (
        await restored.mvpPhotoConsent.findUniqueOrThrow({
          where: { id: revoked.consent.id },
        })
      ).revokedAt instanceof Date,
      !BEFORE_WITHDRAWAL,
    );
    const recoveredOutput = (
      await restored.mvpPhotoAnalysis.findUniqueOrThrow({
        where: { id: revoked.analysis.id },
      })
    ).output;
    if (BEFORE_WITHDRAWAL)
      assert.deepEqual(recoveredOutput, { steps: ["synthetic plan"] });
    else assert.equal(recoveredOutput, null);
    console.log(
      "PASS: real pg_restore into separate PostgreSQL database matched its actual snapshot boundary",
    );
    // Enable only the local read-query fixture, without an API listener, provider or cloud storage.
    process.env.STAGE33_MVP_ENABLED = "true";
    process.env.MVP_PHOTO_POLICY_REVIEWED = "true";
    process.env.MVP_PHOTO_POLICY_VERSION = POLICY;
    process.env.MVP_PHOTO_NOTICE =
      "Synthetic restore fixture only; no public policy approval";
    process.env.MVP_PHOTO_RETENTION_HOURS = "24";
    process.env.MVP_PHOTO_AUDIT_RETENTION_DAYS = "90";
    while (Date.now() <= expired.photo.expiresAt.getTime())
      await new Promise((resolve) => setTimeout(resolve, 100));
    stage = "read-guards-before-cleanup";
    await hidden(expired);
    if (BEFORE_WITHDRAWAL) {
      // No listener exists: deliberately show why an old backup MUST stay offline.
      assert.equal(
        (await restoredVisual.get(owner, revoked.analysis.id)).status,
        "PLAN",
      );
      stage = "offline-conservative-quarantine";
      const sql = await fs.readFile("quarantine-current-photos.sql", "utf8");
      const psql = (input) =>
        docker(
          [
            "-i",
            container,
            "psql",
            "-X",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "postgres",
            "--dbname=beauty_privacy_restore_ci",
            "--file=-",
          ],
          { input, stdio: ["pipe", "pipe", "pipe"] },
        );
      assert.throws(() => psql(sql));
      assert.equal(
        (await restoredVisual.get(owner, retained.analysis.id)).status,
        "PLAN",
      );
      assert.equal(
        await restored.mvpPrivacyEvent.count({
          where: { action: "photo.restore.invalidated" },
        }),
        0,
      );
      assert.throws(() =>
        psql(
          "SET orzell.restore_quarantine = 'confirmed-offline';\nSET orzell.restore_database = 'wrong_database';\n" +
            sql,
        ),
      );
      const acknowledged =
        "SET orzell.restore_quarantine = 'confirmed-offline';\nSET orzell.restore_database = 'beauty_privacy_restore_ci';\n" +
        sql;
      psql(acknowledged);
      psql(acknowledged);
      // Verify the SQL before worker cleanup can hide a regression.
      for (const item of [retained, expired, revoked, other]) {
        const quarantined = await restored.mvpPhotoAnalysis.findUniqueOrThrow({
          where: { id: item.analysis.id },
        });
        assert.equal(quarantined.matchingStatus, null);
        assert.equal(quarantined.matchingRequestId, null);
        assert.equal(quarantined.matchingOutput, null);
        assert.equal(quarantined.output, null);
      }
      assert.equal(
        await restored.mvpPhotoConsent.count({ where: { revokedAt: null } }),
        0,
      );
      assert.equal(
        await restored.mvpPrivacyEvent.count({
          where: { ownerId, action: "photo.restore.invalidated" },
        }),
        3,
      );
      assert.equal(
        await restored.mvpPrivacyEvent.count({
          where: { ownerId, action: "photo.consent.withdrawn" },
        }),
        0,
      );
      assert.equal(
        await restored.mvpPrivacyEvent.count({
          where: { ownerId: otherOwnerId, action: "photo.restore.invalidated" },
        }),
        1,
      );
      for (const item of [retained, expired, revoked, other])
        await hidden(item);
      console.log(
        "PASS: old snapshot stayed offline; guarded quarantine invalidated all restored consents and scrubbed plans; replay emitted no duplicate or fabricated user-withdrawal events",
      );
    } else await hidden(revoked);
    if (!BEFORE_WITHDRAWAL)
      assert.equal(
        (await restoredVisual.get(owner, retained.analysis.id)).status,
        "PLAN",
      );
    console.log(
      "PASS: restored read guards deny unavailable sessions before worker cleanup",
    );
    stage = "restored-worker-erasure";
    await cleanupWorker();
    await cleanupWorker();
    assert.deepEqual(await catalogSnapshot(restored), expectedCatalog);
    console.log(
      "PASS: product decimals, stock movements/receipts and supplier/quote snapshots preserved before and after privacy quarantine/cleanup",
    );
    for (const item of BEFORE_WITHDRAWAL
      ? [retained, expired, revoked, other]
      : [expired, revoked]) {
      assert.equal(await exists(item.file), false);
      assert.ok(
        (
          await restored.mvpPhoto.findUniqueOrThrow({
            where: { id: item.photo.id },
          })
        ).deletedAt,
      );
      assert.equal(
        (
          await restored.mvpPhotoAnalysis.findUniqueOrThrow({
            where: { id: item.analysis.id },
          })
        ).output,
        null,
      );
      assert.equal(
        await restored.mvpPrivacyEvent.count({
          where: {
            ownerId: item.photo.ownerId,
            resourceId: item.photo.id,
            action: "photo.object.erased",
          },
        }),
        1,
      );
      assert.equal(
        await restored.mvpPhotoConsent.count({
          where: { id: item.consent.id },
        }),
        1,
      );
      await hidden(item);
    }
    assert.equal(await exists(retained.file), !BEFORE_WITHDRAWAL);
    assert.equal(await exists(other.file), !BEFORE_WITHDRAWAL);
    assert.equal(
      await restored.user.count({
        where: { id: { in: [ownerId, otherOwnerId] } },
      }),
      2,
    );
    for (const item of [retained, expired, revoked, other]) {
      assert.equal(
        (
          await restored.mvpPhotoConsent.findUniqueOrThrow({
            where: { id: item.consent.id },
          })
        ).auditExpiresAt.getTime(),
        item.consent.auditExpiresAt.getTime(),
      );
      if (BEFORE_WITHDRAWAL || [expired, revoked].includes(item)) {
        const analysis = await restored.mvpPhotoAnalysis.findUniqueOrThrow({
          where: { id: item.analysis.id },
        });
        assert.equal(analysis.intent, "");
        assert.equal(analysis.target, "");
        assert.deepEqual(analysis.answers, []);
        assert.equal(analysis.matchingStatus, null);
        assert.equal(analysis.matchingRequestId, null);
        assert.equal(analysis.matchingOutput, null);
        if (BEFORE_WITHDRAWAL) assert.equal(analysis.status, "REVOKED");
      }
    }
    if (!BEFORE_WITHDRAWAL)
      assert.equal(
        (await restoredVisual.get(owner, retained.analysis.id)).status,
        "PLAN",
      );
    assert.equal(
      await restored.mvpPrivacyEvent.count({
        where: { ownerId, action: "photo.consent.withdrawn" },
      }),
      BEFORE_WITHDRAWAL ? 0 : 1,
    );
    console.log(
      "PASS: restored real worker erases only eligible local fixtures; replay is idempotent and audit evidence survives",
    );
    await fs.writeFile(
      "encrypted-restore-evidence.json",
      JSON.stringify(
        {
          status: "PASS",
          application: "2e56def282c97a804a2f3d6c9b36a53b42a09df5",
          snapshotBoundary: BOUNDARY,
          conservativeInvalidationTested: BEFORE_WITHDRAWAL,
          productionRecoveryExecuted: false,
          snapshotSha256: createHash("sha256").update(dump).digest("hex"),
          actualPgDumpRestore: true,
          separateDatabase: true,
          authoritativeReadQueries: true,
          storage: "LOCAL_FILESYSTEM_FIXTURE",
          cleanupWorkerRuns: 2,
          durableWithdrawalReplayTested: false,
          allRestoredOwnersInvalidated: BEFORE_WITHDRAWAL,
          productionBackupEncryptionTested: false,
          isolatedAuthenticatedEncryptionTested: true,
          encryptionFormat: "CMS AuthEnvelopedData AES-256-GCM RSA-OAEP-SHA256",
          restoredSavedMatchingScrubbed: true,
          catalogInventoryB2BSnapshotsPreserved: true,
          appointmentConsumptionFixture: "IMMUTABLE_RECEIPT_SNAPSHOT_ONLY",
          realS3RecoveryTested: false,
          physicalDeviceAcceptance: false,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    await source.$disconnect();
    await restored.$disconnect();
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error("FAIL:", stage, error.name);
  process.exitCode = 1;
});
