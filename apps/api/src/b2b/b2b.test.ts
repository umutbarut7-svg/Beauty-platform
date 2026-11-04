import "reflect-metadata";
import { afterEach, describe, expect, it, vi } from "vitest";
import { B2BService } from "./b2b.service.js";
import { PermissionsService } from "../auth/permissions.service.js";
const user = {
  id: "owner",
  email: "owner@example.test",
  role: "BUSINESS_OWNER" as const,
};
afterEach(() => vi.unstubAllEnvs());
describe("B2B common gate and role boundary", () => {
  it("requires both inventory and B2B rollout without querying absent models", async () => {
    const auth = { assertBusinessAccess: vi.fn() };
    const service = new B2BService({} as never, auth as never);
    for (const flags of [
      ["false", "true"],
      ["true", "false"],
      ["false", "false"],
    ]) {
      vi.stubEnv("MVP_B2B_ENABLED", flags[0]!);
      vi.stubEnv("MVP_INVENTORY_ENABLED", flags[1]!);
      await expect(service.profile(user, "business")).rejects.toThrow(
        "B2B_DISABLED",
      );
    }
    expect(auth.assertBusinessAccess).not.toHaveBeenCalled();
  });
  it("grants management access without granting staff/customer access", () => {
    const permissions = new PermissionsService({} as never);
    for (const role of [
      "BUSINESS_OWNER",
      "BUSINESS_ADMIN",
      "MANAGER",
      "SUPER_ADMIN",
    ] as const)
      expect(permissions.has(role, "b2b:manage")).toBe(true);
    expect(permissions.has("STAFF", "b2b:read")).toBe(false);
    expect(permissions.has("CUSTOMER", "b2b:manage")).toBe(false);
  });
});
