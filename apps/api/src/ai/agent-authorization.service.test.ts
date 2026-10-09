/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { AgentAuthorizationService } from "./agent-authorization.service.js";
const user = { id: "user-a", email: "a@x.test", role: "CUSTOMER" as const };
describe("agent authorization", () => {
  it("scopes session lookup by tenant and actor", async () => {
    let where: unknown;
    const service = new AgentAuthorizationService({
      agentSession: {
        findFirst: async (q: any) => {
          where = q.where;
          return null;
        },
      },
    } as never);
    await expect(
      service.assertOwnSession({ user, businessId: "tenant-a" }, "session"),
    ).rejects.toThrow();
    expect(where).toEqual({
      id: "session",
      businessId: "tenant-a",
      userId: "user-a",
    });
  });
  it("denies private cross-tenant agent access", async () => {
    const service = new AgentAuthorizationService({
      business: { findFirst: async () => ({ id: "tenant", isPublic: false }) },
      businessMember: { findUnique: async () => null },
    } as never);
    await expect(
      service.assertSessionAccess({ user, businessId: "tenant" }, "BOOKING"),
    ).rejects.toThrow("denied");
  });
  it("enforces the agent profile tool allow-list", () => {
    const service = new AgentAuthorizationService({} as never);
    expect(service.toolAllowed("BUSINESS_GROWTH", "business.get")).toBe(true);
    expect(service.toolAllowed("BUSINESS_GROWTH", "booking.create")).toBe(
      false,
    );
    expect(
      service.toolAllowed("BUSINESS_GROWTH", "marketplace.liquidity"),
    ).toBe(true);
    expect(
      service.toolAllowed("CUSTOMER_BEAUTY", "marketplace.liquidity"),
    ).toBe(false);
  });
});
