/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { PublicApiRateLimitService } from "./public-api-rate-limit.service.js";
const principal: any = { clientId: "client", businessId: "tenant" };
describe("PublicApiRateLimitService", () => {
  it("uses a transaction lock and returns deterministic quota metadata", async () => {
    const tx: any = {
        $queryRawUnsafe: vi.fn(),
        apiRateLimitBucket: { upsert: vi.fn().mockResolvedValue({ count: 1 }) },
      },
      db: any = { $transaction: vi.fn((cb: any) => cb(tx)) };
    const result = await new PublicApiRateLimitService(db).consume(
      principal,
      "GET /business",
    );
    expect(result.limit).toBe(120);
    expect(result.remaining).toBe(119);
    expect(tx.$queryRawUnsafe).toHaveBeenCalledOnce();
  });
  it("returns 429 after the persisted distributed quota is exceeded", async () => {
    const tx: any = {
        $queryRawUnsafe: vi.fn(),
        apiRateLimitBucket: {
          upsert: vi.fn().mockResolvedValue({ count: 121 }),
        },
      },
      db: any = { $transaction: vi.fn((cb: any) => cb(tx)) };
    await expect(
      new PublicApiRateLimitService(db).consume(principal, "GET /business"),
    ).rejects.toMatchObject({ status: 429 });
  });
});
