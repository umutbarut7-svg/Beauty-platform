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
const POLICY = "synthetic-restore-fixture-not-public-policy";
let stage = "isolated-configuration";
async function main() {
  assert.equal(process.env.CI, "true");
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
  async function fixture(expiresAt) {
    const consent = await source.mvpPhotoConsent.create({
      data: {
        ownerId,
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
        ownerId,
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
        ownerId,
        photoId: photo.id,
        expiresAt,
        status: "PLAN",
        intent: "synthetic intent",
        target: "synthetic target",
        answers: ["synthetic answer"],
        output: { steps: ["synthetic plan"] },
      },
    });
    return { consent, photo, analysis, file };
  }
  async function hidden(item) {
    await assert.rejects(
      () => restoredVisual.get(owner, item.analysis.id),
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
    const retained = await fixture(future());
    const expired = await fixture(new Date(Date.now() + 2000));
    const revoked = await fixture(future());
    stage = "authoritative-withdrawal-before-backup";
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
    const dump = docker([
      container,
      "pg_dump",
      "-U",
      "postgres",
      "--format=custom",
      "--no-owner",
      "--dbname=beauty_privacy_backup_ci",
    ]);
    assert.ok(dump.length > 1000);
    await fs.writeFile(path.join(root, "snapshot.dump"), dump, { mode: 0o600 });
    await source.$disconnect();
    console.log(
      "PASS: actual pg_dump snapshot captured after authoritative withdrawal; source connection closed",
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
      { input: dump },
    );
    await restored.$connect();
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
      true,
    );
    assert.equal(
      (
        await restored.mvpPhotoAnalysis.findUniqueOrThrow({
          where: { id: revoked.analysis.id },
        })
      ).output,
      null,
    );
    console.log(
      "PASS: real pg_restore into separate PostgreSQL database preserved withdrawn consent and scrubbed result",
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
    await hidden(revoked);
    assert.equal(
      (await restoredVisual.get(owner, retained.analysis.id)).status,
      "PLAN",
    );
    console.log(
      "PASS: actual restored read query denies expired/withdrawn sessions before cleanup while valid owner plan remains readable",
    );
    stage = "restored-worker-erasure";
    await cleanupWorker();
    await cleanupWorker();
    for (const item of [expired, revoked]) {
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
            ownerId,
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
    assert.equal(await exists(retained.file), true);
    assert.equal(
      (await restoredVisual.get(owner, retained.analysis.id)).status,
      "PLAN",
    );
    assert.equal(
      await restored.mvpPrivacyEvent.count({
        where: { ownerId, action: "photo.consent.withdrawn" },
      }),
      1,
    );
    console.log(
      "PASS: restored real worker erases only eligible local fixtures; replay is idempotent and unexpired content/audit evidence survives",
    );
    await fs.writeFile(
      "privacy-restore-evidence.json",
      JSON.stringify(
        {
          status: "PASS",
          application: "123e7339e2ab2a9e8e94f391a8431b73afc28efe",
          snapshotBoundary: "AFTER_WITHDRAWAL_COMMIT",
          snapshotSha256: createHash("sha256").update(dump).digest("hex"),
          actualPgDumpRestore: true,
          separateDatabase: true,
          authoritativeReadQueries: true,
          storage: "LOCAL_FILESYSTEM_FIXTURE",
          cleanupWorkerRuns: 2,
          earlierSnapshotsReconciled: false,
          productionBackupEncryptionTested: false,
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
