/** Real PostgreSQL/pgvector and S3-compatible SDK integration.
 * OpenAI transport is an explicit contract double: this is NOT live provider acceptance. */
import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  S3Client,
  CreateBucketCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrivatePhotoStore } from "../src/mvp/providers/private-photo-store.js";
import { OpenAiBeautyProvider } from "../src/mvp/providers/openai-beauty.provider.js";
import { VisualService, MvpExternalGuard } from "../src/mvp/visual.service.js";
import { PhotoMaintenanceService } from "../src/mvp/photo-maintenance.service.js";
import { SemanticService } from "../src/mvp/semantic.service.js";
import { VisualMatchesService } from "../src/mvp/visual-matches.service.js";
import { AbuseProtectionService } from "../src/infrastructure/abuse-protection.service.js";
import { MetricsService } from "../src/infrastructure/metrics.service.js";
import { BackgroundJobsService } from "../src/infrastructure/background-jobs.service.js";
import { AISafetyEngine } from "../src/ai/ai-safety.service.js";
import { PermissionsService } from "../src/auth/permissions.service.js";
import type { AuthenticatedUser } from "../src/auth/auth.types.js";
const url =
  "postgresql://postgres:postgres@localhost:5432/beauty_platform_ci?schema=public";
if (
  process.env.STAGE32_TEST_DATABASE_URL !== url ||
  process.env.STAGE33_TEST_S3_ENDPOINT !== "http://127.0.0.1:9000"
)
  throw new Error(
    "Provider tests require isolated CI PostgreSQL and S3-compatible storage",
  );
const db = new PrismaClient({ datasourceUrl: url });
const store = new PrivatePhotoStore();
let s3: S3Client;
let bytes: Buffer;
const plan = {
  status: "PLAN",
  observations: ["Sentetik test görüntüsü"],
  questions: [],
  steps: ["Profesyonel danışmanlığı"],
  searchQuery: "saç bakımı",
  limitations: ["Yerinde değerlendirme gerekir"],
};
function response() {
  return new Response(
    JSON.stringify({
      status: "completed",
      model: "synthetic-contract-model",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(plan) }],
        },
      ],
    }),
  );
}
async function owner(): Promise<AuthenticatedUser> {
  const user = await db.user.create({
    data: {
      email: `${randomUUID()}@provider-fixture.test`,
      passwordHash: "synthetic-never-used-for-login",
    },
  });
  return { id: user.id, email: user.email, role: user.role };
}
function service(transport: typeof fetch) {
  const abuse = new AbuseProtectionService(db as never);
  const guard = new MvpExternalGuard(db as never, abuse, new AISafetyEngine());
  return new VisualService(
    db as never,
    store,
    new OpenAiBeautyProvider(new MetricsService(), transport),
    guard,
    abuse,
  );
}
beforeAll(async () => {
  for (const [name, value] of Object.entries({
    NODE_ENV: "test",
    STAGE33_MVP_ENABLED: "true",
    MVP_S3_ENABLED: "true",
    MVP_S3_BUCKET: "stage33-private-fixtures",
    MVP_S3_TEST_ENDPOINT: "http://127.0.0.1:9000",
    AWS_REGION: "us-east-1",
    AWS_ACCESS_KEY_ID: "stage33-test-root",
    AWS_SECRET_ACCESS_KEY: "stage33-isolated-test-password",
    MVP_AI_ENABLED: "true",
    MVP_AI_DAILY_REQUEST_LIMIT: "20",
    MVP_AI_GLOBAL_DAILY_REQUEST_LIMIT: "50",
    OPENAI_API_KEY: "contract-double-not-a-real-key",
    OPENAI_VISION_MODEL: "synthetic-contract-model",
    OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
    MVP_PHOTO_POLICY_REVIEWED: "true",
    MVP_PHOTO_POLICY_VERSION: "synthetic-ci-not-approved-for-users",
    MVP_PHOTO_NOTICE: "Synthetic CI purpose and consent fixture only",
    MVP_PHOTO_RETENTION_HOURS: "24",
    MVP_PHOTO_AUDIT_RETENTION_DAYS: "90",
    MVP_SEMANTIC_ENABLED: "true",
  }))
    vi.stubEnv(name, value);
  s3 = new S3Client({
    region: "us-east-1",
    endpoint: "http://127.0.0.1:9000",
    forcePathStyle: true,
    maxAttempts: 1,
  });
  await s3.send(
    new CreateBucketCommand({ Bucket: "stage33-private-fixtures" }),
  );
  bytes = await sharp({
    create: { width: 20, height: 20, channels: 3, background: "#666666" },
  })
    .png()
    .toBuffer();
}, 30000);
afterAll(async () => {
  store.onModuleDestroy();
  s3?.destroy();
  await db.$disconnect();
  vi.unstubAllEnvs();
});

describe("platform-owned private photo journey with real DB/S3 and explicit OpenAI contract doubles", () => {
  it("honors the real Prisma global and agent kill switches without calling the provider", async () => {
    const user = await owner();
    const abuse = new AbuseProtectionService(db as never);
    const guard = new MvpExternalGuard(
      db as never,
      abuse,
      new AISafetyEngine(),
    );
    for (const config of [
      { scope: "GLOBAL" as const, target: "*" },
      { scope: "AGENT_TYPE" as const, target: "MVP_VISUAL" },
    ]) {
      const toggle = await db.aIKillSwitch.create({
        data: { ...config, enabled: true },
      });
      try {
        await expect(guard.consume(user.id, "saç bakımı")).rejects.toThrow(
          "AI_CAPABILITY_DISABLED",
        );
      } finally {
        await db.aIKillSwitch.delete({ where: { id: toggle.id } });
      }
    }
  });
  it("keeps SDK objects private, prevents overwrites, normalizes metadata and physically erases", async () => {
    const key = `private/mvp/${randomUUID()}`;
    const jpeg = await store.normalize(bytes, "image/png");
    await store.put(key, jpeg);
    expect(
      (await fetch(`http://127.0.0.1:9000/stage33-private-fixtures/${key}`))
        .status,
    ).toBe(403);
    await expect(store.put(key, jpeg)).rejects.toThrow("UNAVAILABLE");
    expect(
      (
        await sharp(
          await store.sanitizedJpeg(key, jpeg.length, "image/jpeg"),
        ).metadata()
      ).exif,
    ).toBeUndefined();
    await store.erase(key);
    await expect(
      s3.send(
        new GetObjectCommand({ Bucket: "stage33-private-fixtures", Key: key }),
      ),
    ).rejects.toThrow();
  });
  it("enforces owner scope, records a real analysis transition and blocks concurrent billed requests", async () => {
    const user = await owner();
    const other = await owner();
    let release!: (value: Response) => void;
    let entered!: () => void;
    const called = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const transport = vi.fn().mockImplementation(async () => {
      entered();
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    });
    const visual = service(transport);
    const consent = await visual.consent(user, {
      policyVersion: "synthetic-ci-not-approved-for-users",
      accepted: true,
    });
    const photo = await visual.upload(user, consent.id, bytes, "image/png");
    await expect(
      visual.create(other, {
        photoId: photo.id,
        intent: "care",
        target: "shine",
      }),
    ).rejects.toThrow("UNAVAILABLE");
    const session = await visual.create(user, {
      photoId: photo.id,
      intent: "saç bakımı",
      target: "parlaklık",
    });
    const first = visual.analyze(user, session.id, [], 0);
    await Promise.race([
      called,
      first.then(() => {
        throw new Error("Provider was not paused");
      }),
    ]);
    await expect(visual.analyze(user, session.id, [], 0)).rejects.toThrow(
      /BUSY|CHANGED/,
    );
    release(response());
    const result = await first;
    expect(result.status).toBe("PLAN");
    expect(result.output).toEqual(plan);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toMatch(
      /objectKey|noticeHash|ownerId|contract-double-not-a-real-key/,
    );
    await expect(visual.get(other, session.id)).rejects.toThrow("UNAVAILABLE");
    await visual.withdraw(user, consent.id);
    await visual.withdraw(user, consent.id);
    expect(
      await db.mvpPrivacyEvent.count({
        where: { ownerId: user.id, action: "photo.consent.withdrawn" },
      }),
    ).toBe(1);
    await expect(visual.get(user, session.id)).rejects.toThrow("UNAVAILABLE");
  }, 30000);
  it("discards a provider response after withdrawal and the real cleanup worker erases its object", async () => {
    const user = await owner();
    let release!: (value: Response) => void;
    let entered!: () => void;
    const called = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const visual = service(
      vi.fn().mockImplementation(async () => {
        entered();
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      }),
    );
    const consent = await visual.consent(user, {
      policyVersion: "synthetic-ci-not-approved-for-users",
      accepted: true,
    });
    const photo = await visual.upload(user, consent.id, bytes, "image/png");
    const session = await visual.create(user, {
      photoId: photo.id,
      intent: "bakım",
      target: "parlaklık",
    });
    const pending = visual.analyze(user, session.id, [], 0);
    const settled = pending.then(
      () => null,
      (error: unknown) => error,
    );
    await Promise.race([
      called,
      settled.then((error) => {
        throw error ?? new Error("Provider was not paused");
      }),
    ]);
    await visual.withdraw(user, consent.id);
    release(response());
    expect(await settled).toMatchObject({
      message: expect.stringContaining("UNAVAILABLE"),
    });
    const row = await db.mvpPhotoAnalysis.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(row).toMatchObject({
      status: "REVOKED",
      output: null,
      intent: "",
      target: "",
      answers: [],
    });
    await db.mvpPhoto.update({
      where: { id: photo.id },
      data: { uploadExpiresAt: new Date(Date.now() - 180000) },
    });
    const cleanup = new PhotoMaintenanceService(db as never, store);
    expect((await cleanup.sweep()).erased).toBeGreaterThanOrEqual(1);
    const erased = await db.mvpPhoto.findUniqueOrThrow({
      where: { id: photo.id },
    });
    expect(erased.deletedAt).not.toBeNull();
    await expect(
      s3.send(
        new GetObjectCommand({
          Bucket: "stage33-private-fixtures",
          Key: erased.objectKey,
        }),
      ),
    ).rejects.toThrow();
    await cleanup.sweep();
    expect(
      await db.mvpPrivacyEvent.count({
        where: {
          ownerId: user.id,
          resourceId: photo.id,
          action: "photo.object.erased",
        },
      }),
    ).toBe(1);
  }, 30000);
  it("fails closed with missing policy/provider and scrubs expired analysis text", async () => {
    const user = await owner();
    const transport = vi.fn().mockResolvedValue(response());
    const visual = service(transport);
    const consent = await visual.consent(user, {
      policyVersion: "synthetic-ci-not-approved-for-users",
      accepted: true,
    });
    const photo = await visual.upload(user, consent.id, bytes, "image/png");
    const session = await visual.create(user, {
      photoId: photo.id,
      intent: "bakım",
      target: "parlaklık",
    });
    await db.mvpPhotoAnalysis.update({
      where: { id: session.id },
      data: { expiresAt: new Date(0) },
    });
    await new PhotoMaintenanceService(db as never, store).sweep();
    expect(
      await db.mvpPhotoAnalysis.findUniqueOrThrow({
        where: { id: session.id },
      }),
    ).toMatchObject({
      status: "EXPIRED",
      intent: "",
      target: "",
      output: null,
    });
    vi.stubEnv("MVP_PHOTO_POLICY_REVIEWED", "false");
    await expect(
      visual.consent(user, {
        policyVersion: "synthetic-ci-not-approved-for-users",
        accepted: true,
      }),
    ).rejects.toThrow("UNAVAILABLE");
    expect(transport).not.toHaveBeenCalled();
    vi.stubEnv("MVP_PHOTO_POLICY_REVIEWED", "true");
    await visual.withdraw(user, consent.id);
  });
});

describe("saved matching with real owner-scoped PostgreSQL state and no live provider", () => {
  async function fixture() {
    const user = await owner();
    const expiresAt = new Date(Date.now() + 3600000);
    const consent = await db.mvpPhotoConsent.create({
      data: {
        ownerId: user.id,
        policyVersion: "synthetic-ci-not-approved-for-users",
        noticeHash: "synthetic-match-fixture",
        expiresAt,
        auditExpiresAt: new Date(Date.now() + 86400000),
      },
    });
    const photo = await db.mvpPhoto.create({
      data: {
        ownerId: user.id,
        consentId: consent.id,
        objectKey: `private/mvp/synthetic-${randomUUID()}`,
        mime: "image/jpeg",
        bytes: 10,
        uploadExpiresAt: expiresAt,
        expiresAt,
      },
    });
    const session = await db.mvpPhotoAnalysis.create({
      data: {
        ownerId: user.id,
        photoId: photo.id,
        intent: "care",
        target: "shine",
        answers: [],
        status: "PLAN",
        output: plan,
        expiresAt,
      },
    });
    const visual = service(vi.fn());
    return { user, consent, photo, session, visual };
  }
  it("restores a completed search after a service restart and revalidates public bookability", async () => {
    const f = await fixture();
    const business = await db.business.create({
      data: { name: "Saved public salon", slug: randomUUID(), isPublic: true },
    });
    const category = await db.serviceCategory.create({
      data: { businessId: business.id, name: "Care", slug: randomUUID() },
    });
    const catalog = await db.service.create({
      data: {
        businessId: business.id,
        categoryId: category.id,
        name: "Saved service",
        slug: randomUUID(),
        durationMinutes: 30,
        price: "100",
      },
    });
    const reference = {
      businessId: business.id,
      serviceId: catalog.id,
      similarity: 0.9,
      sourceUpdatedAt: catalog.updatedAt.toISOString(),
      businessUpdatedAt: business.updatedAt.toISOString(),
    };
    const search = vi.fn().mockResolvedValue({ items: [reference] });
    const matches = new VisualMatchesService(db as never, f.visual, {
      search,
    } as never);
    expect(await matches.get(f.user, f.session.id)).toEqual({
      status: "NOT_REQUESTED",
      result: null,
    });
    expect(search).not.toHaveBeenCalled();
    expect((await matches.create(f.user, f.session.id)).items).toEqual([
      {
        businessId: business.id,
        serviceId: catalog.id,
        businessName: business.name,
        serviceName: catalog.name,
        similarity: 0.9,
      },
    ]);
    const restarted = new VisualMatchesService(db as never, f.visual, {
      search,
    } as never);
    expect((await restarted.get(f.user, f.session.id)).status).toBe("READY");
    await restarted.create(f.user, f.session.id);
    expect(search).toHaveBeenCalledTimes(1);
    await db.service.update({
      where: { id: catalog.id },
      data: { name: "Changed service" },
    });
    expect((await restarted.get(f.user, f.session.id)).result).toMatchObject({
      status: "NO_MATCH",
      items: [],
    });
    const other = await owner();
    await expect(restarted.get(other, f.session.id)).rejects.toThrow(
      "UNAVAILABLE",
    );
    await expect(restarted.create(other, f.session.id)).rejects.toThrow(
      "UNAVAILABLE",
    );
    await db.business.update({
      where: { id: business.id },
      data: { isPublic: false },
    });
    expect((await restarted.get(f.user, f.session.id)).result).toMatchObject({
      status: "NO_MATCH",
      items: [],
    });
    await restarted.create(f.user, f.session.id);
    expect(search).toHaveBeenCalledTimes(1);
    const row = await db.mvpPhotoAnalysis.findUniqueOrThrow({
      where: { id: f.session.id },
    });
    expect(row.matchingOutput).toEqual([reference]);
    expect(row.expiresAt).toEqual(f.session.expiresAt);
    await f.visual.withdraw(f.user, f.consent.id);
    expect(
      await db.mvpPhotoAnalysis.findUniqueOrThrow({
        where: { id: f.session.id },
      }),
    ).toMatchObject({
      matchingStatus: null,
      matchingOutput: null,
      matchingRequestId: null,
    });
    await expect(restarted.get(f.user, f.session.id)).rejects.toThrow(
      "UNAVAILABLE",
    );
  });
  it("serializes concurrent requests and retains NO_MATCH without another embedding", async () => {
    const f = await fixture();
    let entered!: () => void;
    let release!: (value: { items: [] }) => void;
    const called = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const search = vi.fn().mockImplementation(() => {
      entered();
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    const matches = new VisualMatchesService(db as never, f.visual, {
      search,
    } as never);
    const first = matches.create(f.user, f.session.id);
    await called;
    expect(await matches.get(f.user, f.session.id)).toEqual({
      status: "RUNNING",
      result: null,
    });
    await expect(matches.create(f.user, f.session.id)).rejects.toThrow(
      "VISUAL_MATCH_RUNNING",
    );
    release({ items: [] });
    expect(await first).toMatchObject({ status: "NO_MATCH", items: [] });
    expect(await matches.create(f.user, f.session.id)).toMatchObject({
      status: "NO_MATCH",
      items: [],
    });
    expect(search).toHaveBeenCalledTimes(1);
  });
  it("discards a pending result after withdrawal and cannot restore expired or policy-invalid snapshots", async () => {
    const f = await fixture();
    let entered!: () => void;
    let release!: (value: { items: [] }) => void;
    const called = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const search = vi.fn().mockImplementation(() => {
      entered();
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    const matches = new VisualMatchesService(db as never, f.visual, {
      search,
    } as never);
    const pending = matches.create(f.user, f.session.id);
    const settled = pending.catch((error: unknown) => error);
    await called;
    await f.visual.withdraw(f.user, f.consent.id);
    release({ items: [] });
    expect(await settled).toMatchObject({
      message: "VISUAL_SESSION_UNAVAILABLE",
    });
    expect(
      await db.mvpPhotoAnalysis.findUniqueOrThrow({
        where: { id: f.session.id },
      }),
    ).toMatchObject({ matchingStatus: null, matchingOutput: null });
    const expired = await fixture();
    await db.mvpPhotoAnalysis.update({
      where: { id: expired.session.id },
      data: {
        matchingStatus: "READY",
        matchingOutput: [],
        expiresAt: new Date(0),
      },
    });
    await expect(matches.get(expired.user, expired.session.id)).rejects.toThrow(
      "UNAVAILABLE",
    );
    await new PhotoMaintenanceService(db as never, store).sweep();
    expect(
      await db.mvpPhotoAnalysis.findUniqueOrThrow({
        where: { id: expired.session.id },
      }),
    ).toMatchObject({
      status: "EXPIRED",
      matchingStatus: null,
      matchingOutput: null,
    });
    const changed = await fixture();
    vi.stubEnv("MVP_PHOTO_POLICY_VERSION", "changed-synthetic-policy");
    try {
      await expect(
        matches.get(changed.user, changed.session.id),
      ).rejects.toThrow("UNAVAILABLE");
      await expect(
        matches.create(changed.user, changed.session.id),
      ).rejects.toThrow("UNAVAILABLE");
    } finally {
      vi.stubEnv(
        "MVP_PHOTO_POLICY_VERSION",
        "synthetic-ci-not-approved-for-users",
      );
    }
    expect(search).toHaveBeenCalledTimes(1);
  });
  it("never retries failed or interrupted work from a read request", async () => {
    const f = await fixture();
    const search = vi
      .fn()
      .mockRejectedValue(new Error("Synthetic upstream failure"));
    const matches = new VisualMatchesService(db as never, f.visual, {
      search,
    } as never);
    await expect(matches.create(f.user, f.session.id)).rejects.toThrow(
      "Synthetic upstream failure",
    );
    expect(await matches.get(f.user, f.session.id)).toEqual({
      status: "FAILED",
      result: null,
    });
    await db.mvpPhotoAnalysis.update({
      where: { id: f.session.id },
      data: { matchingStatus: "RUNNING", matchingRequestId: randomUUID() },
    });
    expect(await matches.get(f.user, f.session.id)).toEqual({
      status: "RUNNING",
      result: null,
    });
    await expect(matches.create(f.user, f.session.id)).rejects.toThrow(
      "VISUAL_MATCH_RUNNING",
    );
    expect(search).toHaveBeenCalledTimes(1);
  });
  it("does not start provider work if expiry changes the plan after the authorized read", async () => {
    const f = await fixture();
    const search = vi.fn();
    const visual = {
      get: async (
        user: AuthenticatedUser,
        id: string,
        tx: Parameters<typeof f.visual.get>[2],
      ) => {
        const session = await f.visual.get(user, id, tx);
        await db.mvpPhotoAnalysis.update({
          where: { id },
          data: { status: "EXPIRED", expiresAt: new Date(0) },
        });
        return session;
      },
    };
    const matches = new VisualMatchesService(db as never, visual as never, {
      search,
    } as never);
    await expect(matches.create(f.user, f.session.id)).rejects.toThrow(
      "VISUAL_SESSION_CHANGED",
    );
    expect(search).not.toHaveBeenCalled();
  });
});

describe("real pgvector index scope, freshness and cosine query (synthetic vectors, not live embeddings)", () => {
  it("indexes through the durable worker exactly once and rejects revoked tenant membership before another provider call", async () => {
    const user = await owner();
    const business = await db.business.create({
      data: {
        name: "Synthetic worker catalog",
        slug: randomUUID(),
        isPublic: true,
      },
    });
    await db.businessMember.create({
      data: {
        businessId: business.id,
        userId: user.id,
        role: "BUSINESS_OWNER",
      },
    });
    const category = await db.serviceCategory.create({
      data: { businessId: business.id, name: "Synthetic", slug: randomUUID() },
    });
    const catalog = await db.service.create({
      data: {
        businessId: business.id,
        categoryId: category.id,
        name: "Synthetic worker service",
        slug: randomUUID(),
        durationMinutes: 30,
        price: "100",
      },
    });
    const vector = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
    const transport = vi.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            model: "text-embedding-3-small",
            data: [{ embedding: vector }],
          }),
        ),
    );
    const metrics = new MetricsService();
    const jobs = new BackgroundJobsService(db as never, metrics);
    const abuse = new AbuseProtectionService(db as never);
    const semantic = new SemanticService(
      db as never,
      new PermissionsService(db as never),
      new OpenAiBeautyProvider(metrics, transport),
      new MvpExternalGuard(db as never, abuse, new AISafetyEngine()),
      jobs,
      { notify: async () => undefined } as never,
    );
    semantic.onModuleInit();
    const idempotencyKey = randomUUID();
    const queued = await semantic.enqueue(
      user,
      business.id,
      catalog.id,
      idempotencyKey,
    );
    expect(
      (await semantic.enqueue(user, business.id, catalog.id, idempotencyKey))
        .jobId,
    ).toBe(queued.jobId);
    expect(await jobs.processNext(true)).toBe(true);
    expect(
      (
        await db.backgroundJob.findUniqueOrThrow({
          where: { id: queued.jobId },
        })
      ).status,
    ).toBe("SUCCEEDED");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(
      (await semantic.nearest(vector, "text-embedding-3-small")).items,
    ).toContainEqual(
      expect.objectContaining({
        serviceId: catalog.id,
        businessId: business.id,
      }),
    );
    expect(await jobs.processNext(true)).toBe(false);
    const delayed = await semantic.enqueue(
      user,
      business.id,
      catalog.id,
      randomUUID(),
    );
    await db.businessMember.delete({
      where: {
        userId_businessId: { userId: user.id, businessId: business.id },
      },
    });
    expect(await jobs.processNext(true)).toBe(true);
    expect(
      (
        await db.backgroundJob.findUniqueOrThrow({
          where: { id: delayed.jobId },
        })
      ).status,
    ).toBe("DEAD_LETTER");
    expect(transport).toHaveBeenCalledTimes(1);
    await expect(
      semantic.enqueue(user, business.id, catalog.id, randomUUID()),
    ).rejects.toThrow("denied");
    expect(
      await db.auditLog.count({
        where: { businessId: business.id, action: "mvp.catalog.indexed" },
      }),
    ).toBe(1);
    // Leave no public fixture for the following exact-nearest query assertions.
    await db.business.update({
      where: { id: business.id },
      data: { isPublic: false },
    });
    jobs.onModuleDestroy();
  }, 30000);
  it("returns only current active public bookable services and does not mix embedding models", async () => {
    const business = await db.business.create({
      data: {
        name: "Vector public fixture",
        slug: randomUUID(),
        isPublic: true,
      },
    });
    const category = await db.serviceCategory.create({
      data: { businessId: business.id, name: "Synthetic", slug: randomUUID() },
    });
    const vector = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
    const first = await db.service.create({
      data: {
        businessId: business.id,
        categoryId: category.id,
        name: "Synthetic vector service",
        slug: randomUUID(),
        durationMinutes: 30,
        price: "100",
      },
    });
    await db.$executeRawUnsafe(
      'INSERT INTO "MvpCatalogVector" ("serviceId","businessId",model,embedding,"sourceUpdatedAt","businessUpdatedAt") VALUES ($1,$2,$3,$4::vector,$5,$6)',
      first.id,
      business.id,
      "text-embedding-3-small",
      JSON.stringify(vector),
      first.updatedAt,
      business.updatedAt,
    );
    const semantic = new SemanticService(
      db as never,
      new PermissionsService(db as never),
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    expect(
      (await semantic.nearest(vector, "text-embedding-3-small")).items,
    ).toEqual([
      expect.objectContaining({
        serviceId: first.id,
        businessId: business.id,
        similarity: 1,
      }),
    ]);
    expect(
      (await semantic.nearest(vector, "text-embedding-3-large")).status,
    ).toBe("NO_MATCH");
    await db.service.update({
      where: { id: first.id },
      data: { updatedAt: new Date(Date.now() + 1000) },
    });
    expect(
      (await semantic.nearest(vector, "text-embedding-3-small")).items,
    ).toEqual([]);
    await db.service.update({
      where: { id: first.id },
      data: { updatedAt: first.updatedAt, isBookable: false },
    });
    expect(
      (await semantic.nearest(vector, "text-embedding-3-small")).items,
    ).toEqual([]);
    await db.service.update({
      where: { id: first.id },
      data: { updatedAt: first.updatedAt, isBookable: true },
    });
    await db.business.update({
      where: { id: business.id },
      data: { isPublic: false, updatedAt: business.updatedAt },
    });
    expect(
      (await semantic.nearest(vector, "text-embedding-3-small")).items,
    ).toEqual([]);
  });
});
