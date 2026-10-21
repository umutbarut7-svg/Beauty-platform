"use strict";
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
require("reflect-metadata");
const sharp = require("sharp");
const { PrismaClient } = require("@prisma/client");
const { S3Client, ListObjectsV2Command } = require("@aws-sdk/client-s3");
const {
  PrivatePhotoStore,
} = require("./dist/mvp/providers/private-photo-store.js");

const DATABASE =
  "postgresql://postgres:postgres@127.0.0.1:5432/beauty_platform_live_ci?schema=public";
const BUCKET = "beautyplatform-private-photos-dev";
const KEY_PATTERN = /^private\/mvp\/f33f33f3-[0-9a-f-]{27}$/;
const base = "http://127.0.0.1:3001";
let stage = "isolated-configuration";
let app;
let ownerId;
const keys = new Set();

async function main() {
  assert.equal(process.env.STAGE33_LIVE_JOURNEY_TEST, "confirmed");
  assert.equal(process.env.DATABASE_URL, DATABASE);
  assert.equal(process.env.MVP_S3_BUCKET, BUCKET);
  assert.equal(process.env.AWS_REGION, "eu-north-1");
  assert.ok(process.env.OPENAI_API_KEY?.trim());
  assert.ok(!process.env.MVP_S3_TEST_ENDPOINT);
  const db = new PrismaClient({ datasourceUrl: DATABASE });
  const s3 = new S3Client({
    region: "eu-north-1",
    maxAttempts: 1,
    requestHandler: { connectionTimeout: 3000, requestTimeout: 15000 },
  });
  const store = new PrivatePhotoStore();
  const environment = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: DATABASE,
    PORT: "3001",
    STAGE33_MVP_ENABLED: "true",
    MVP_REDIS_ENABLED: "false",
    MVP_AI_ENABLED: "true",
    MVP_SEMANTIC_ENABLED: "true",
    MVP_AI_DAILY_REQUEST_LIMIT: "10",
    MVP_AI_GLOBAL_DAILY_REQUEST_LIMIT: "10",
    MVP_PHOTO_POLICY_REVIEWED: "true",
    MVP_PHOTO_POLICY_VERSION: "synthetic-live-ci-not-approved-for-users",
    MVP_PHOTO_NOTICE:
      "Synthetic fixture only; no real people or approved product policy",
    MVP_PHOTO_RETENTION_HOURS: "24",
    MVP_PHOTO_AUDIT_RETENTION_DAYS: "90",
    JWT_ACCESS_SECRET: randomBytes(48).toString("hex"),
    JWT_REFRESH_SECRET: randomBytes(48).toString("hex"),
    CORS_ORIGINS: "http://localhost:8081",
    RATE_LIMIT_DEFAULT: "10000",
  };
  async function stop() {
    if (!app || app.exitCode !== null) return;
    const child = app;
    const ended = once(child, "exit");
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    try {
      await ended;
    } finally {
      clearTimeout(timer);
    }
  }
  async function start(overrides = {}) {
    app = spawn(
      "node",
      ["--require", "./stage33-live-fixture-preload.cjs", "dist/main.js"],
      { env: { ...environment, ...overrides }, stdio: "ignore" },
    );
    let spawnFailed = false;
    app.on("error", () => {
      spawnFailed = true;
    });
    for (let i = 0; i < 100; i++) {
      if (spawnFailed || app.exitCode !== null)
        throw new Error("ApiStartupFailed");
      try {
        const r = await fetch(`${base}/health/ready`, {
          signal: AbortSignal.timeout(1000),
        });
        await r.body?.cancel();
        if (r.ok) return;
      } catch {
        /* bounded local startup polling */
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("ApiReadinessTimeout");
  }
  async function request(path, token, method = "GET", body, expected = 200) {
    const multipart = body instanceof FormData;
    const response = await fetch(base + path, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(45000),
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body && !multipart ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: multipart ? body : JSON.stringify(body) } : {}),
    });
    if (response.status !== expected) {
      await response.body?.cancel();
      const error = new Error("UnexpectedHttpStatus");
      error.httpStatus = response.status;
      throw error;
    }
    const result = await response.json();
    assert.ok(
      !/objectKey|noticeHash|ownerId|Bearer |sk-proj-/.test(
        JSON.stringify(result),
      ),
    );
    return result;
  }
  async function worker(cleanupOnly, overrides = {}) {
    const child = spawn(
      "node",
      [
        "--require",
        "./stage33-live-fixture-preload.cjs",
        "dist/worker.js",
        ...(cleanupOnly ? ["--privacy-cleanup"] : []),
        "--once",
      ],
      { env: { ...environment, ...overrides }, stdio: "ignore" },
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
  async function present(key) {
    assert.match(key, KEY_PATTERN);
    const result = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: key }),
    );
    return result.KeyCount > 0;
  }
  async function remember(photoId) {
    const row = await db.mvpPhoto.findUniqueOrThrow({ where: { id: photoId } });
    assert.match(row.objectKey, KEY_PATTERN);
    keys.add(row.objectKey);
    return row;
  }
  const closed = {
    STAGE33_MVP_ENABLED: "false",
    MVP_AI_ENABLED: "false",
    OPENAI_API_KEY: "",
    MVP_PHOTO_POLICY_REVIEWED: "false",
    MVP_SEMANTIC_ENABLED: "false",
  };
  try {
    await db.$connect();
    stage = "real-api-startup";
    await start();
    const register = async () =>
      request(
        "/auth/register",
        "",
        "POST",
        {
          email: `synthetic-${randomUUID()}@example.test`,
          password: randomBytes(32).toString("hex"),
        },
        201,
      );
    const owner = await register();
    ownerId = owner.user.id;
    const stranger = await register();
    const token = owner.accessToken;
    stage = "consent-and-owner-scoped-upload";
    const policy = await request("/mvp/v1/photos/policy", token);
    assert.equal(policy.available, true);
    assert.equal(policy.policy.retentionHours, 24);
    const consent = await request(
      "/mvp/v1/photos/consents",
      token,
      "POST",
      {
        policyVersion: environment.MVP_PHOTO_POLICY_VERSION,
        accepted: true,
      },
      201,
    );
    const png = await sharp({
      create: { width: 64, height: 64, channels: 3, background: "#808080" },
    })
      .withExif({ IFD0: { Copyright: "Synthetic live journey" } })
      .png()
      .toBuffer();
    const upload = async (id) => {
      const form = new FormData();
      form.append(
        "photo",
        new Blob([png], { type: "image/png" }),
        "synthetic.png",
      );
      return request(`/mvp/v1/photos/upload/${id}`, token, "POST", form, 201);
    };
    const photo = await upload(consent.id);
    const row = await remember(photo.id);
    assert.equal(await present(row.objectKey), true);
    assert.equal(
      (
        await sharp(
          await store.sanitizedJpeg(row.objectKey, row.bytes, row.mime),
        ).metadata()
      ).exif,
      undefined,
    );
    const session = await request(
      "/mvp/v1/visual/sessions",
      token,
      "POST",
      {
        photoId: photo.id,
        intent: "sac danismanligi",
        target: "uygun bakim",
      },
      201,
    );
    await request(
      `/mvp/v1/visual/sessions/${session.id}`,
      stranger.accessToken,
      "GET",
      undefined,
      404,
    );
    console.log(
      "PASS: real HTTP consent, private upload, EXIF stripping and cross-user denial",
    );
    stage = "live-http-vision-analysis";
    const analyzed = await request(
      `/mvp/v1/visual/sessions/${session.id}/analyze`,
      token,
      "POST",
      { answers: [], expectedAttempt: 0 },
      201,
    );
    assert.equal(analyzed.status, "NEEDS_INFORMATION");
    assert.equal(analyzed.provider, "OPENAI");
    assert.equal(analyzed.attempts, 1);
    assert.ok(analyzed.output.questions.length >= 1);
    const persisted = await db.mvpPhotoAnalysis.findUniqueOrThrow({
      where: { id: session.id },
    });
    assert.equal(persisted.status, "NEEDS_INFORMATION");
    console.log(
      "PASS: live OpenAI structured vision response committed through real HTTP/DB path",
    );
    stage = "withdrawal-and-retryable-erasure";
    const withdrawn = await request(
      `/mvp/v1/photos/consents/${consent.id}/withdraw`,
      token,
      "POST",
      undefined,
      201,
    );
    assert.equal(withdrawn.physicalErasure, "PENDING_WORKER");
    await request(
      `/mvp/v1/visual/sessions/${session.id}`,
      token,
      "GET",
      undefined,
      404,
    );
    const revoked = await db.mvpPhotoAnalysis.findUniqueOrThrow({
      where: { id: session.id },
    });
    assert.equal(revoked.status, "REVOKED");
    assert.equal(revoked.output, null);
    assert.equal(revoked.intent, "");
    assert.equal(revoked.target, "");
    assert.deepEqual(revoked.answers, []);
    await db.mvpPhoto.update({
      where: { id: photo.id },
      data: { uploadExpiresAt: new Date(Date.now() - 180000) },
    });
    await worker(true, {
      ...closed,
      STAGE33_TEST_FAIL_ERASE_ONCE: "confirmed",
    });
    assert.equal((await remember(photo.id)).deletedAt, null);
    assert.equal(await present(row.objectKey), true);
    await worker(true, closed);
    assert.ok((await remember(photo.id)).deletedAt);
    assert.equal(await present(row.objectKey), false);
    console.log(
      "PASS: withdrawal blocks access; injected first erasure failure stays pending; real worker retry erases object",
    );
    stage = "expiry-and-evidence-retention";
    const expConsent = await request(
      "/mvp/v1/photos/consents",
      token,
      "POST",
      {
        policyVersion: environment.MVP_PHOTO_POLICY_VERSION,
        accepted: true,
      },
      201,
    );
    const expPhoto = await upload(expConsent.id);
    const expRow = await remember(expPhoto.id);
    const expSession = await request(
      "/mvp/v1/visual/sessions",
      token,
      "POST",
      {
        photoId: expPhoto.id,
        intent: "sac bakimi",
        target: "danismanlik",
      },
      201,
    );
    await db.mvpPhotoConsent.update({
      where: { id: expConsent.id },
      data: { expiresAt: new Date(0) },
    });
    await db.mvpPhoto.update({
      where: { id: expPhoto.id },
      data: { expiresAt: new Date(0), uploadExpiresAt: new Date(0) },
    });
    await db.mvpPhotoAnalysis.update({
      where: { id: expSession.id },
      data: { expiresAt: new Date(0) },
    });
    await worker(true, closed);
    assert.ok((await remember(expPhoto.id)).deletedAt);
    assert.equal(await present(expRow.objectKey), false);
    const expired = await db.mvpPhotoAnalysis.findUniqueOrThrow({
      where: { id: expSession.id },
    });
    assert.equal(expired.status, "EXPIRED");
    assert.equal(expired.intent, "");
    assert.equal(expired.target, "");
    assert.equal(expired.output, null);
    const evidence = await db.mvpPhotoConsent.findUniqueOrThrow({
      where: { id: expConsent.id },
    });
    assert.ok(evidence.auditExpiresAt > new Date(Date.now() + 89 * 86400000));
    assert.equal(
      await db.mvpPrivacyEvent.count({
        where: { resourceId: expPhoto.id, action: "photo.object.erased" },
      }),
      1,
    );
    console.log(
      "PASS: forced-expiry worker erases S3 and analysis text while preserving unexpired 90-day evidence",
    );
    stage = "live-catalog-index-and-pgvector-match";
    const business = await db.business.create({
      data: {
        name: "Synthetic live catalog",
        slug: randomUUID(),
        isPublic: true,
      },
    });
    await db.businessMember.create({
      data: {
        businessId: business.id,
        userId: ownerId,
        role: "BUSINESS_OWNER",
      },
    });
    const category = await db.serviceCategory.create({
      data: { businessId: business.id, name: "Synthetic", slug: randomUUID() },
    });
    const service = await db.service.create({
      data: {
        businessId: business.id,
        categoryId: category.id,
        name: "Profesyonel sac kesimi",
        description: "Profesyonel sac kesimi ve renklendirme",
        slug: randomUUID(),
        durationMinutes: 30,
        price: "100",
      },
    });
    const indexPath = `/mvp/v1/businesses/${business.id}/services/${service.id}/semantic-index`;
    const indexKey = randomUUID();
    const queued = await request(
      indexPath,
      token,
      "POST",
      { idempotencyKey: indexKey },
      201,
    );
    assert.equal(
      (
        await request(
          indexPath,
          token,
          "POST",
          { idempotencyKey: indexKey },
          201,
        )
      ).jobId,
      queued.jobId,
    );
    await worker(false);
    assert.equal(
      (
        await db.backgroundJob.findUniqueOrThrow({
          where: { id: queued.jobId },
        })
      ).status,
      "SUCCEEDED",
    );
    const matches = await request(
      `/mvp/v1/businesses/${business.id}/ai-match`,
      token,
      "POST",
      { query: "Profesyonel sac kesimi" },
      201,
    );
    assert.equal(matches.status, "MATCHED");
    assert.ok(
      matches.items.some(
        (item) =>
          item.serviceId === service.id && item.businessId === business.id,
      ),
    );
    const vectorRows = await db.$queryRawUnsafe(
      'SELECT embedding::text AS vector FROM "MvpCatalogVector" WHERE "serviceId"=$1 AND model=$2',
      service.id,
      "text-embedding-3-small",
    );
    const vector = JSON.parse(vectorRows[0].vector);
    assert.equal(vector.length, 1536);
    const { SemanticService } = require("./dist/mvp/semantic.service.js");
    const semantic = new SemanticService(db, {}, {}, {}, {}, {});
    await db.service.update({
      where: { id: service.id },
      data: { isBookable: false },
    });
    assert.equal(
      (await semantic.nearest(vector, "text-embedding-3-small")).items.length,
      0,
    );
    await db.service.update({
      where: { id: service.id },
      data: { isBookable: true, updatedAt: service.updatedAt },
    });
    const delayed = await request(
      indexPath,
      token,
      "POST",
      { idempotencyKey: randomUUID() },
      201,
    );
    await db.businessMember.delete({
      where: {
        userId_businessId: { userId: ownerId, businessId: business.id },
      },
    });
    await worker(false);
    assert.equal(
      (
        await db.backgroundJob.findUniqueOrThrow({
          where: { id: delayed.jobId },
        })
      ).status,
      "DEAD_LETTER",
    );
    console.log(
      "PASS: live embedding worker, idempotent indexing, real HTTP pgvector match, bookability filter and revoked-member denial",
    );
    stage = "closed-rollout-withdrawal";
    await stop();
    await start(closed);
    await request(
      "/mvp/v1/photos/consents",
      token,
      "POST",
      {
        policyVersion: environment.MVP_PHOTO_POLICY_VERSION,
        accepted: true,
      },
      503,
    );
    await request(
      `/mvp/v1/photos/consents/${consent.id}/withdraw`,
      token,
      "POST",
      undefined,
      201,
    );
    assert.equal(
      await db.mvpPrivacyEvent.count({
        where: { resourceId: consent.id, action: "photo.consent.withdrawn" },
      }),
      1,
    );
    console.log(
      "PASS: closed rollout rejects new consent but permits idempotent withdrawal with AI disabled",
    );
  } catch (error) {
    console.error(
      `FAIL: ${stage}${Number.isInteger(error.httpStatus) ? ` HTTP ${error.httpStatus}` : ""}`,
    );
    process.exitCode = 1;
  } finally {
    await stop().catch(() => {
      process.exitCode = 1;
    });
    try {
      if (ownerId) {
        const rows = await db.mvpPhoto.findMany({
          where: { ownerId },
          select: { objectKey: true },
        });
        for (const row of rows) {
          assert.match(row.objectKey, KEY_PATTERN);
          keys.add(row.objectKey);
        }
      }
      for (const key of keys) {
        await store.erase(key);
        assert.equal(await present(key), false);
      }
      console.log(
        "PASS: all owned synthetic S3 objects absent after final cleanup",
      );
    } catch {
      console.error("FAIL: final synthetic cleanup requires review");
      process.exitCode = 1;
    }
    store.onModuleDestroy();
    s3.destroy();
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error("FAIL: isolated fixture configuration");
  process.exitCode = 1;
});
