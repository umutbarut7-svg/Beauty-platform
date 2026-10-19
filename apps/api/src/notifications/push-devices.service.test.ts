/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from "vitest";
import { PushDevicesService } from "./push-devices.service.js";
const u: any = { id: "u", role: "STAFF" };
describe("PushDevicesService", () => {
  beforeEach(() => {
    process.env.PUSH_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
      "base64",
    );
  });
  it("encrypts tokens, supports multiple devices and owner-only revoke", async () => {
    const rows: any[] = [];
    const db: any = {
      pushDevice: {
        upsert: async ({ create }: any) => {
          const x = { id: `d${rows.length}`, ...create };
          rows.push(x);
          return x;
        },
        findMany: async () =>
          rows.map((x) => ({
            id: x.id,
            platform: x.platform,
            isActive: x.isActive,
            lastUsedAt: x.lastUsedAt,
            invalidatedAt: x.invalidatedAt,
            createdAt: x.createdAt,
          })),
        findFirst: async ({ where }: any) =>
          rows.find((x) => x.id === where.id && x.userId === where.userId),
        update: async ({ where, data }: any) =>
          Object.assign(
            rows.find((x) => x.id === where.id),
            data,
          ),
        updateMany: async ({ where, data }: any) => {
          const matching = rows.filter(
            (x) =>
              x.businessId === where.businessId &&
              x.tokenHash === where.tokenHash,
          );
          matching.forEach((x) => Object.assign(x, data));
          return { count: matching.length };
        },
      },
    };
    const s = new PushDevicesService(db, {
      assertBusinessAccess: async () => {},
    } as any);
    const d = await s.register(u, "b", {
      token: "a".repeat(30),
      platform: "IOS",
    });
    const second = await s.register(u, "b", {
      token: "b".repeat(30),
      platform: "ANDROID",
    });
    expect(second.id).not.toBe(d.id);
    expect(rows).toHaveLength(2);
    expect(d.encryptedToken).not.toContain("a".repeat(30));
    expect(s.decrypt(d.encryptedToken)).toBe("a".repeat(30));
    expect((await s.list(u, "b"))[0]).not.toHaveProperty("encryptedToken");
    expect((await s.revoke(u, "b", d.id)).isActive).toBe(false);
    await s.invalidate("b", "b".repeat(30));
    expect(second.isActive).toBe(false);
  });
});
