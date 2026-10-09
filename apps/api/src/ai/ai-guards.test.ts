import { describe, expect, it, vi } from "vitest";
import { AIKillSwitchService } from "./ai-kill-switch.service.js";
import { AIRateLimitService } from "./ai-rate-limit.service.js";
import { AgentUsageGuard } from "./usage-guard.service.js";
const identity = {
  businessId: "b",
  user: { id: "u", email: "u@x.test", role: "CUSTOMER" as const },
};
describe("AI operational guards", () => {
  it("enforces global, tenant, agent and tool kill-switch lookup", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "disabled" });
    await expect(
      new AIKillSwitchService({
        aiKillSwitch: { findFirst },
      } as never).assertEnabled({
        businessId: "b",
        agentType: "BOOKING",
        toolName: "booking.create",
      }),
    ).rejects.toThrow("DISABLED");
    expect(findFirst.mock.calls[0]![0].where.OR).toHaveLength(4);
  });
  it("allows when no kill switch matches", async () => {
    await expect(
      new AIKillSwitchService({
        aiKillSwitch: { findFirst: async () => null },
      } as never).assertEnabled({ businessId: "b", agentType: "BOOKING" }),
    ).resolves.toBeUndefined();
  });
  it("rate limits across tenant, user, session and agent scopes", async () => {
    const consume = vi
      .fn()
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false });
    await expect(
      new AIRateLimitService({ consume } as never).consume(
        identity,
        "s",
        "BOOKING",
      ),
    ).rejects.toThrow("RATE_LIMIT");
    expect(consume).toHaveBeenCalledTimes(2);
  });
  it("blocks token, cost and retry budgets", () => {
    const guard = new AgentUsageGuard();
    expect(() =>
      guard.assertBudget({
        tokens: guard.limits.maxTokens + 1,
        estimatedCostMicros: 0,
        retries: 0,
      }),
    ).toThrow("BUDGET");
    expect(() =>
      guard.assertBudget({
        tokens: 0,
        estimatedCostMicros: 0,
        retries: guard.limits.maxRetries + 1,
      }),
    ).toThrow("BUDGET");
  });
});
