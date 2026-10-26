"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID, randomBytes } = require("node:crypto");
const { spawn, execFileSync } = require("node:child_process");
const { once } = require("node:events");
const { PrismaClient } = require("@prisma/client");
const DATABASE =
  "postgresql://postgres:postgres@127.0.0.1:5432/beauty_privacy_loop_ci?schema=public";
let stage = "isolated-configuration";
let child;
let spawnError;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  assert.equal(process.env.CI, "true");
  assert.match(process.env.PRIVACY_APPLICATION_SHA, /^[0-9a-f]{40}$/);
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    process.env.PRIVACY_APPLICATION_SHA,
  );
  assert.equal(process.env.PRIVACY_LOOP_FIXTURE, "confirmed");
  assert.equal(process.env.DATABASE_URL, DATABASE);
  assert.ok(process.env.RUNNER_TEMP);
  const root = await fs.mkdtemp(
    path.join(process.env.RUNNER_TEMP, "privacy-loop-"),
  );
  const db = new PrismaClient({ datasourceUrl: DATABASE });
  const ownerId = `privacy-loop-${randomUUID()}`;
  const env = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: DATABASE,
    PRIVACY_LOOP_ROOT: root,
    STAGE33_MVP_ENABLED: "false",
    MVP_REDIS_ENABLED: "false",
    MVP_AI_ENABLED: "false",
    MVP_SEMANTIC_ENABLED: "false",
    MVP_S3_ENABLED: "false",
    MVP_PHOTO_POLICY_REVIEWED: "false",
    MVP_VERIFICATION_POLICY_REVIEWED: "false",
    OPENAI_API_KEY: "",
    JWT_ACCESS_SECRET: randomBytes(48).toString("hex"),
    JWT_REFRESH_SECRET: randomBytes(48).toString("hex"),
  };
  const exists = async (file) =>
    fs.access(file).then(
      () => true,
      () => false,
    );
  const count = async (name) =>
    (await fs.readFile(path.join(root, name), "utf8").catch(() => ""))
      .split("\n")
      .filter(Boolean).length;
  async function waitFor(check) {
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      if (
        spawnError ||
        !child ||
        child.exitCode !== null ||
        child.signalCode !== null
      )
        throw new Error("WorkerExitedEarly");
      if (await check()) return;
      await pause(200);
    }
    throw new Error("WorkerEvidenceTimeout");
  }
  function start() {
    spawnError = undefined;
    child = spawn(
      process.execPath,
      [
        "--require",
        "./privacy-loop-preload.cjs",
        "dist/worker.js",
        "--privacy-cleanup",
      ],
      { env, stdio: "ignore" },
    );
    child.on("error", (error) => {
      spawnError = error;
    });
  }
  async function stop(signal = "SIGTERM") {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const current = child;
    const ended = once(current, "exit");
    current.kill(signal);
    const timer = setTimeout(() => current.kill("SIGKILL"), 5000);
    try {
      await ended;
    } finally {
      clearTimeout(timer);
    }
  }
  const future = () => new Date(Date.now() + 86400000);
  async function fixture(expiresAt, revoked = false) {
    const consent = await db.mvpPhotoConsent.create({
      data: {
        ownerId,
        policyVersion: "synthetic-loop-only",
        noticeHash: "0".repeat(64),
        expiresAt,
        auditExpiresAt: new Date(Date.now() + 90 * 86400000),
        revokedAt: revoked ? new Date() : null,
      },
    });
    const keyId = `f33f33f3-${randomUUID().slice(9)}`;
    const file = path.join(root, keyId);
    await fs.writeFile(file, "synthetic non-image fixture");
    const photo = await db.mvpPhoto.create({
      data: {
        ownerId,
        consentId: consent.id,
        objectKey: `private/mvp/${keyId}`,
        mime: "image/jpeg",
        bytes: 27,
        uploadExpiresAt: new Date(Date.now() - 60000),
        expiresAt,
        revokedAt: revoked ? new Date() : null,
      },
    });
    const analysis = await db.mvpPhotoAnalysis.create({
      data: {
        ownerId,
        photoId: photo.id,
        expiresAt,
        status: revoked ? "REVOKED" : "PLAN",
        intent: revoked ? "" : "synthetic intent",
        target: revoked ? "" : "synthetic target",
        answers: revoked ? [] : ["synthetic answer"],
        ...(revoked ? {} : { output: { steps: ["synthetic plan"] } }),
      },
    });
    return { consent, photo, analysis, file };
  }
  async function erased(item) {
    const photo = await db.mvpPhoto.findUniqueOrThrow({
      where: { id: item.photo.id },
    });
    return photo.deletedAt !== null && !(await exists(item.file));
  }
  try {
    await db.$connect();
    await db.user.create({
      data: {
        id: ownerId,
        email: `${ownerId}@example.test`,
        passwordHash: "not-a-login-hash",
      },
    });
    const retained = await fixture(future());
    const expired = await fixture(new Date(Date.now() + 3000));
    stage = "continuous-expiry";
    start();
    await waitFor(
      async () => (await erased(expired)) && (await count("sweeps")) >= 3,
    );
    const scrubbed = await db.mvpPhotoAnalysis.findUniqueOrThrow({
      where: { id: expired.analysis.id },
    });
    assert.equal(scrubbed.status, "EXPIRED");
    assert.equal(scrubbed.intent, "");
    assert.equal(scrubbed.target, "");
    assert.deepEqual(scrubbed.answers, []);
    assert.equal(scrubbed.output, null);
    assert.equal(
      await db.mvpPhotoConsent.count({ where: { id: expired.consent.id } }),
      1,
    );
    console.log(
      "PASS: long-running real worker expires/scrubs content and erases local fixture across repeated sweeps with rollout closed",
    );
    stage = "storage-failure-and-process-crash";
    await fs.writeFile(path.join(root, "blocked"), "synthetic storage outage");
    const attemptsBefore = await count("attempts");
    const revoked = await fixture(future(), true);
    await waitFor(
      async () =>
        (await count("attempts")) > attemptsBefore &&
        (await count("sweeps")) >= 4,
    );
    assert.equal(
      (await db.mvpPhoto.findUniqueOrThrow({ where: { id: revoked.photo.id } }))
        .deletedAt,
      null,
    );
    assert.equal(await exists(revoked.file), true);
    await stop("SIGKILL");
    assert.equal(child.signalCode, "SIGKILL");
    assert.equal(
      (await db.mvpPhoto.findUniqueOrThrow({ where: { id: revoked.photo.id } }))
        .deletedAt,
      null,
    );
    console.log(
      "PASS: injected storage failure leaves durable erasure pending through a real worker process crash",
    );
    stage = "restart-and-retry";
    await fs.rm(path.join(root, "blocked"));
    const sweepsBefore = await count("sweeps");
    start();
    await waitFor(
      async () =>
        (await erased(revoked)) && (await count("sweeps")) >= sweepsBefore + 3,
    );
    for (const item of [expired, revoked]) {
      assert.equal(
        await db.mvpPrivacyEvent.count({
          where: {
            ownerId,
            resourceId: item.photo.id,
            action: "photo.object.erased",
          },
        }),
        1,
      );
      assert.equal(
        await db.mvpPhotoConsent.count({ where: { id: item.consent.id } }),
        1,
      );
    }
    assert.equal(await exists(retained.file), true);
    assert.equal(
      (
        await db.mvpPhoto.findUniqueOrThrow({
          where: { id: retained.photo.id },
        })
      ).deletedAt,
      null,
    );
    assert.equal(
      (
        await db.mvpPhotoAnalysis.findUniqueOrThrow({
          where: { id: retained.analysis.id },
        })
      ).intent,
      "synthetic intent",
    );
    const evidence = {
      status: "PASS",
      application: process.env.PRIVACY_APPLICATION_SHA,
      completedSweeps: await count("sweeps"),
      storage: "LOCAL_FILESYSTEM_FIXTURE",
      database: "DISPOSABLE_POSTGRESQL",
      workerProcessRestarted: true,
      publicPolicyEnabled: false,
      realS3OrBackupRecoveryTested: false,
    };
    await fs.writeFile(
      "privacy-loop-evidence.json",
      JSON.stringify(evidence, null, 2) + "\n",
    );
    console.log(
      "PASS: restarted real worker retries pending erasure exactly once in audit evidence; unexpired content/evidence survives",
    );
  } finally {
    await stop();
    await db.$transaction([
      db.mvpPhotoAnalysis.deleteMany({ where: { ownerId } }),
      db.mvpPhoto.deleteMany({ where: { ownerId } }),
      db.mvpPhotoConsent.deleteMany({ where: { ownerId } }),
      db.mvpPrivacyEvent.deleteMany({ where: { ownerId } }),
      db.user.deleteMany({ where: { id: ownerId } }),
    ]);
    await db.$disconnect();
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error("FAIL:", stage, error.name);
  process.exitCode = 1;
});
