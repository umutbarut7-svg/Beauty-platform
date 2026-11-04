import "reflect-metadata";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InventoryService } from "./inventory.service.js";
import { PermissionsService } from "../auth/permissions.service.js";
const user = {
  id: "owner",
  email: "owner@example.test",
  role: "BUSINESS_OWNER" as const,
};
afterEach(() => vi.unstubAllEnvs());
describe("inventory rollout and permissions", () => {
  it("never accesses new tables when rollout is closed", async () => {
    vi.stubEnv("MVP_INVENTORY_ENABLED", "false");
    const permissions = { assertBusinessAccess: vi.fn() };
    const service = new InventoryService({} as never, permissions as never);
    await expect(service.list(user, "business")).rejects.toThrow(
      "INVENTORY_DISABLED",
    );
    await expect(service.publicCatalog("business")).rejects.toThrow(
      "INVENTORY_DISABLED",
    );
    expect(permissions.assertBusinessAccess).not.toHaveBeenCalled();
  });
  it("gives inventory access to management roles and denies staff/customer", () => {
    const permissions = new PermissionsService({} as never);
    for (const role of [
      "SUPER_ADMIN",
      "BUSINESS_OWNER",
      "BUSINESS_ADMIN",
      "MANAGER",
    ] as const) {
      expect(permissions.has(role, "inventory:read")).toBe(true);
      expect(permissions.has(role, "inventory:manage")).toBe(true);
    }
    expect(permissions.has("STAFF", "inventory:read")).toBe(false);
    expect(permissions.has("CUSTOMER", "inventory:manage")).toBe(false);
  });
});
