import { describe, expect, it, vi } from "vitest";
import { AbuseProtectionService } from "./abuse-protection.service.js";

describe("AbuseProtectionService", () => {
  it("uses deterministic hashed fixed-window buckets without storing identifiers", async () => {
    const db = {
      abuseLimitBucket: {
        upsert: vi.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const result = await new AbuseProtectionService(db as never).consume(
      { scope: "TENANT", limit: 2, windowMs: 60_000 },
      "tenant-sensitive-id",
      new Date("2026-09-27T10:00:30.000Z"),
    );
    expect(result).toMatchObject({ allowed: true, remaining: 0 });
    const call = db.abuseLimitBucket.upsert.mock.calls[0]?.[0];
    expect(JSON.stringify(call)).not.toContain("tenant-sensitive-id");
    expect(call.where.scope_keyHash_windowStart.windowStart.toISOString()).toBe(
      "2026-09-27T10:00:00.000Z",
    );
  });
  it("denies over-limit buckets", async () => {
    const db = {
      abuseLimitBucket: { upsert: vi.fn().mockResolvedValue({ count: 3 }) },
    };
    await expect(
      new AbuseProtectionService(db as never).consume(
        { scope: "IP", limit: 2, windowMs: 1000 },
        "127.0.0.1",
      ),
    ).resolves.toMatchObject({ allowed: false, remaining: 0 });
  });
});
