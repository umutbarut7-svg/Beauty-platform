import "reflect-metadata";
import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, expect, it, vi } from "vitest";
import { AISafetyEngine } from "../src/ai/ai-safety.service.js";
import { AbuseProtectionService } from "../src/infrastructure/abuse-protection.service.js";
import { MvpExternalGuard } from "../src/mvp/visual.service.js";

const url =
  "postgresql://postgres:postgres@localhost:5432/beauty_platform_ci?schema=public";
if (process.env.STAGE32_TEST_DATABASE_URL !== url)
  throw new Error("AI quota tests require isolated CI PostgreSQL");
const db = new PrismaClient({ datasourceUrl: url });
afterAll(() => db.$disconnect());

it("reserves shared AI quota only for admitted concurrent requests", async () => {
  const guard = new MvpExternalGuard(
    db as never,
    new AbuseProtectionService(db as never),
    new AISafetyEngine(),
  );
  const keyHash = createHash("sha256")
    .update("mvp-external-global")
    .digest("hex");
  const globalCount = async () => {
    const buckets = await db.abuseLimitBucket.aggregate({
      where: { scope: "ENDPOINT", keyHash },
      _sum: { count: true },
    });
    return buckets._sum.count ?? 0;
  };
  const before = await globalCount();
  vi.stubEnv("STAGE33_MVP_ENABLED", "true");
  vi.stubEnv("MVP_AI_GLOBAL_DAILY_REQUEST_LIMIT", "10000");
  vi.stubEnv("MVP_AI_DAILY_REQUEST_LIMIT", "1");
  try {
    const first = randomUUID();
    const results = await Promise.allSettled([
      guard.consume(first, "saç bakımı"),
      guard.consume(first, "saç bakımı", "MVP_SEMANTIC"),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === "rejected")?.reason,
    ).toMatchObject({
      message: "AI_USAGE_LIMIT_REACHED",
      status: 429,
    });
    await guard.consume(randomUUID(), "saç bakımı");
    expect(await globalCount()).toBe(before + 2);
  } finally {
    vi.unstubAllEnvs();
  }
});
