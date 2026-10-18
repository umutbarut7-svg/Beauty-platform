/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { ConfirmationManager } from "./confirmation-manager.service.js";
function database(expiresAt = new Date(Date.now() + 60_000)) {
  const row: Record<string, unknown> = {
    id: "action",
    businessId: "tenant-a",
    sessionId: "session",
    status: "PENDING",
    expiresAt,
    toolName: "booking.create",
    arguments: { serviceId: "s" },
  };
  return {
    row,
    agentPendingAction: {
      findFirst: async ({ where }: any) =>
        where.businessId === row.businessId ? row : null,
      updateMany: async ({ where, data }: any) => {
        if (where.status !== row.status) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      findUnique: async () => row,
      create: async ({ data }: any) => ({ ...data, id: "action" }),
      update: async ({ data }: any) => Object.assign(row, data),
    },
  };
}
describe("confirmation manager", () => {
  it("atomically prevents confirmation replay", async () => {
    const db = database();
    const manager = new ConfirmationManager(db as never);
    await expect(
      manager.claim("tenant-a", "session", "action"),
    ).resolves.toMatchObject({ status: "CONFIRMED" });
    await expect(
      manager.claim("tenant-a", "session", "action"),
    ).rejects.toThrow("already consumed");
  });
  it("rejects cross-tenant action lookup", async () => {
    const manager = new ConfirmationManager(database() as never);
    await expect(
      manager.claim("tenant-b", "session", "action"),
    ).rejects.toThrow("not found");
  });
  it("expires stale actions without execution", async () => {
    const manager = new ConfirmationManager(database(new Date(0)) as never);
    await expect(
      manager.claim("tenant-a", "session", "action"),
    ).rejects.toThrow("expired");
  });
  it("supports explicit rejection once", async () => {
    const manager = new ConfirmationManager(database() as never);
    await expect(
      manager.reject("tenant-a", "session", "action"),
    ).resolves.toBeUndefined();
    await expect(
      manager.reject("tenant-a", "session", "action"),
    ).rejects.toThrow();
  });
});
