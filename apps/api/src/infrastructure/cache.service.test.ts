import { describe, expect, it, vi } from "vitest";
import { DatabaseCacheService } from "./cache.service.js";

describe("DatabaseCacheService", () => {
  it("scopes keys by tenant and namespace, honors TTL, and invalidates safely", async () => {
    const db = {
      infrastructureCacheEntry: {
        findUnique: vi.fn().mockResolvedValue({
          value: { ok: true },
          expiresAt: new Date(Date.now() + 1000),
        }),
        upsert: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new DatabaseCacheService(db as never);
    await expect(
      service.get("tenant-a", "discovery", "same-key"),
    ).resolves.toEqual({ ok: true });
    expect(db.infrastructureCacheEntry.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId_namespace_keyHash: expect.objectContaining({
            businessId: "tenant-a",
            namespace: "discovery",
          }),
        },
      }),
    );
    await service.set("tenant-b", "discovery", "same-key", { ok: false }, 1000);
    expect(db.infrastructureCacheEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ businessId: "tenant-b" }),
      }),
    );
    await service.invalidateNamespace("tenant-a", "discovery");
    expect(db.infrastructureCacheEntry.deleteMany).toHaveBeenCalledWith({
      where: { businessId: "tenant-a", namespace: "discovery" },
    });
  });
  it("degrades cache read failures to a miss", async () => {
    const db = {
      infrastructureCacheEntry: {
        findUnique: vi.fn().mockRejectedValue(new Error("offline")),
      },
    };
    await expect(
      new DatabaseCacheService(db as never).get("a", "n", "k"),
    ).resolves.toBeNull();
  });
});
