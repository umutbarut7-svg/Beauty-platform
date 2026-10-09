import { describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "./tool-registry.service.js";
function registry() {
  return new ToolRegistry(
    { search: vi.fn() } as never,
    { calculate: vi.fn() } as never,
    {
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      cancel: vi.fn(),
    } as never,
    { list: vi.fn(), get: vi.fn() } as never,
    { getCustomerBeautyContext: vi.fn() } as never,
    { readModel: vi.fn() } as never,
    {
      metrics: vi.fn(),
      insights: vi.fn(),
      opportunities: vi.fn(),
      risks: vi.fn(),
      recommendations: vi.fn(),
    } as never,
    {
      overview: vi.fn(),
      gaps: vi.fn(),
      demand: vi.fn(),
      capacity: vi.fn(),
      opportunities: vi.fn(),
    } as never,
    { business: { findFirst: vi.fn() } } as never,
  );
}
describe("tool registry", () => {
  it("registers only bounded read/write tools and confirms every booking mutation", () => {
    const tools = registry().list();
    expect(tools.map((x) => x.name)).toEqual(
      expect.arrayContaining([
        "discovery.search",
        "availability.check",
        "business.get",
        "booking.get",
        "booking.create",
        "booking.modify",
        "booking.cancel",
      ]),
    );
    expect(
      tools
        .filter((x) => x.operationType === "WRITE")
        .every((x) => x.requiresConfirmation),
    ).toBe(true);
    expect(tools.every((x) => x.timeoutMs > 0)).toBe(true);
  });
  it("rejects undeclared and non-scalar arguments", () => {
    const value = registry();
    const tool = value.get("discovery.search");
    expect(() => value.validate(tool, { sql: "DROP TABLE" })).toThrow(
      "Invalid tool arguments",
    );
    expect(() => value.validate(tool, { query: { raw: "x" } })).toThrow(
      "Invalid tool argument value",
    );
  });
  it("keeps intelligence agent tools read-only and tenant-bound", async () => {
    const value = registry();
    const names = [
      "business_intelligence.metrics",
      "business_intelligence.insights",
      "business_intelligence.opportunities",
      "business_intelligence.risks",
      "business_intelligence.recommendations",
      "marketplace.liquidity",
      "marketplace.supply_gaps",
      "marketplace.demand",
      "marketplace.capacity",
      "marketplace.supply_opportunities",
    ];
    const identity = {
      businessId: "tenant-a",
      user: { id: "owner", email: "owner@test", role: "BUSINESS_OWNER" },
    } as const;
    for (const name of names) {
      const tool = value.get(name);
      expect(tool.operationType).toBe("READ");
      expect(tool.requiresConfirmation).toBe(false);
      expect(tool.inputKeys).toEqual(
        name === "marketplace.liquidity" ? ["window"] : [],
      );
      await tool.execute({}, { ...identity, sessionId: "session-1" });
    }
  });
});
