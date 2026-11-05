"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID, randomBytes, createHash } = require("node:crypto");
const { execFileSync, spawn } = require("node:child_process");
const { once } = require("node:events");
const { sealFixture, openFixture } = require("./privacy-backup-envelope.cjs");
const APPLICATION = "9c487dc425d157a2a5bb1de9bc48beab63eda90c";
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
  assert.equal(process.env.PRIVACY_RESTORE_APPLICATION, APPLICATION);
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
  async function fixture(
    expiresAt,
    fixtureOwnerId = ownerId,
    matchingStatus = "COMPLETED",
  ) {
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
        matchingStatus,
        matchingRequestId: randomUUID(),
        matchingOutput:
          matchingStatus === "RUNNING"
            ? undefined
            : {
                status: matchingStatus === "NO_MATCH" ? "NO_MATCH" : "MATCHES",
                matches:
                  matchingStatus === "NO_MATCH"
                    ? []
                    : [{ id: "synthetic-private-match" }],
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
  const backupKey = randomBytes(32);
  let openedDump;
  try {
    await source.$connect();
    await source.user.create({
      data: {
        id: ownerId,
        email: `${ownerId}@example.test`,
        passwordHash: "not-a-login-hash",
      },
    });
    const otherOwnerId = `restore-other-${randomUUID()}`;
    await source.user.create({
      data: {
        id: otherOwnerId,
        email: `${otherOwnerId}@example.test`,
        passwordHash: "not-a-login-hash",
      },
    });
    const other = await fixture(future(), otherOwnerId, "NO_MATCH");
    const retained = await fixture(future());
    const expired = await fixture(
      new Date(Date.now() + 2000),
      ownerId,
      "RUNNING",
    );
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
    const plaintext = earlierDump ?? snapshot();
    assert.ok(plaintext.length > 1000);
    const snapshotSha256 = createHash("sha256").update(plaintext).digest("hex");
    const backupContext = {
      application: APPLICATION,
      snapshotBoundary: BOUNDARY,
    };
    const sealed = sealFixture(plaintext, backupKey, backupContext);
    plaintext.fill(0);
    const archivePath = path.join(root, "snapshot.dump.gcm");
    await fs.writeFile(archivePath, sealed, { mode: 0o600, flag: "wx" });
    const persisted = await fs.readFile(archivePath);
    stage = "reject-unauthenticated-backup-before-restore";
    const corrupted = Buffer.from(persisted);
    corrupted[corrupted.length - 1] ^= 1;
    assert.throws(() => openFixture(corrupted, backupKey, backupContext));
    assert.throws(() =>
      openFixture(
        persisted.subarray(0, persisted.length - 1),
        backupKey,
        backupContext,
      ),
    );
    assert.throws(() => openFixture(persisted, randomBytes(32), backupContext));
    assert.throws(() =>
      openFixture(persisted, backupKey, {
        ...backupContext,
        application: "a".repeat(40),
      }),
    );
    assert.throws(() =>
      openFixture(persisted, backupKey, {
        ...backupContext,
        snapshotBoundary: BEFORE_WITHDRAWAL
          ? "AFTER_WITHDRAWAL_COMMIT"
          : "BEFORE_WITHDRAWAL_COMMIT",
      }),
    );
    openedDump = openFixture(persisted, backupKey, backupContext);
    assert.equal(
      createHash("sha256").update(openedDump).digest("hex"),
      snapshotSha256,
    );
    assert.deepEqual(
      (await fs.readdir(root)).filter((name) => name.startsWith("snapshot.")),
      ["snapshot.dump.gcm"],
    );
    console.log(
      "PASS: persisted AES-256-GCM fixture archive authenticated; corruption, truncation, wrong key/source/boundary rejected before database restore",
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
      { input: openedDump },
    );
    openedDump.fill(0);
    openedDump = undefined;
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
      const oldMatch = await restored.mvpPhotoAnalysis.findUniqueOrThrow({
        where: { id: revoked.analysis.id },
      });
      assert.equal(oldMatch.matchingStatus, "COMPLETED");
      assert.ok(oldMatch.matchingOutput);
    }
    {
      // Every restored snapshot stays quarantined, including after a known withdrawal.
      stage = "offline-conservative-quarantine";
      const sql = await fs.readFile("quarantine-restored-photos.sql", "utf8");
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
      // Assert the SQL itself scrubs saved matching BEFORE the worker can mask a regression.
      for (const item of [retained, expired, revoked, other]) {
        const scrubbed = await restored.mvpPhotoAnalysis.findUniqueOrThrow({
          where: { id: item.analysis.id },
        });
        assert.equal(scrubbed.matchingStatus, null);
        assert.equal(scrubbed.matchingRequestId, null);
        assert.equal(scrubbed.matchingOutput, null);
        assert.equal(scrubbed.output, null);
        assert.equal(scrubbed.intent, "");
        assert.equal(scrubbed.target, "");
        assert.deepEqual(scrubbed.answers, []);
      }
      assert.equal(
        await restored.mvpPhotoConsent.count({ where: { revokedAt: null } }),
        0,
      );
      assert.equal(
        await restored.mvpPrivacyEvent.count({
          where: { ownerId, action: "photo.restore.invalidated" },
        }),
        BEFORE_WITHDRAWAL ? 3 : 2,
      );
      assert.equal(
        await restored.mvpPrivacyEvent.count({
          where: { ownerId, action: "photo.consent.withdrawn" },
        }),
        BEFORE_WITHDRAWAL ? 0 : 1,
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
    }
    console.log(
      "PASS: restored read guards deny unavailable sessions before worker cleanup",
    );
    stage = "restored-worker-erasure";
    await cleanupWorker();
    await cleanupWorker();
    for (const item of [retained, expired, revoked, other]) {
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
    assert.equal(await exists(retained.file), false);
    assert.equal(await exists(other.file), false);
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
      {
        const analysis = await restored.mvpPhotoAnalysis.findUniqueOrThrow({
          where: { id: item.analysis.id },
        });
        assert.equal(analysis.intent, "");
        assert.equal(analysis.target, "");
        assert.deepEqual(analysis.answers, []);
        assert.equal(analysis.status, "REVOKED");
        assert.equal(analysis.matchingStatus, null);
        assert.equal(analysis.matchingRequestId, null);
        assert.equal(analysis.matchingOutput, null);
      }
    }
    await hidden(retained);
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
      "privacy-restore-evidence.json",
      JSON.stringify(
        {
          status: "PASS",
          application: APPLICATION,
          harness: process.env.GITHUB_SHA,
          snapshotBoundary: BOUNDARY,
          conservativeInvalidationTested: true,
          productionRecoveryExecuted: false,
          snapshotSha256,
          encryptedFixtureRoundTrip: "AES-256-GCM",
          fixtureKeyPersistence: false,
          tamperedBackupRejectedBeforeRestore: true,
          savedMatchingScrubbed: true,
          actualPgDumpRestore: true,
          separateDatabase: true,
          authoritativeReadQueries: true,
          storage: "LOCAL_FILESYSTEM_FIXTURE",
          cleanupWorkerRuns: 2,
          durableWithdrawalReplayTested: false,
          allRestoredOwnersInvalidated: true,
          productionBackupEncryptionTested: false,
          realS3RecoveryTested: false,
          physicalDeviceAcceptance: false,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    backupKey.fill(0);
    openedDump?.fill(0);
    await source.$disconnect();
    await restored.$disconnect();
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error("FAIL:", stage, error.name);
  process.exitCode = 1;
});

