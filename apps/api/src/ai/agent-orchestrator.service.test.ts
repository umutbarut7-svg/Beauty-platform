/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { AgentOrchestrator } from "./agent-orchestrator.service.js";
import type { AgentTool } from "./agent.types.js";
const identity = {
  businessId: "tenant",
  user: { id: "user", email: "u@x.test", role: "CUSTOMER" as const },
};
const session = {
  id: "session",
  businessId: "tenant",
  userId: "user",
  agentType: "BOOKING",
  status: "ACTIVE",
  intent: "UNKNOWN",
  activeGoal: null,
  turns: [],
};
function setup(tool: AgentTool, result: unknown) {
  const db = {
    agentTurn: { create: vi.fn() },
    agentToolExecution: { count: vi.fn().mockResolvedValue(0) },
  };
  const authorization = {
    assertOwnSession: vi.fn().mockResolvedValue({ ...session }),
    assertSessionAccess: vi.fn(),
    toolAllowed: vi.fn().mockReturnValue(true),
  };
  const planner = {
    plan: vi.fn().mockReturnValue({
      intent:
        tool.operationType === "WRITE" ? "CREATE_BOOKING" : "DISCOVER_SERVICE",
      goal: "goal",
      toolName: tool.name,
      arguments: {},
      missingInformation: [],
    }),
  };
  const registry = { get: () => tool, validate: vi.fn(), list: () => [tool] };
  const states = {
    transition: vi.fn(async (s: any, status: string, data: any = {}) => ({
      ...s,
      ...data,
      status,
    })),
  };
  const confirmations = {
    create: vi.fn().mockResolvedValue({
      id: "action",
      summary: "Confirm",
      expiresAt: new Date("2030-01-01"),
    }),
  };
  const metrics = {
    agent: vi.fn(),
    agentLimitExceeded: vi.fn(),
    aiNeedsInformation: vi.fn(),
    aiNotAvailable: vi.fn(),
    aiPolicyBlock: vi.fn(),
    aiSafetyBlock: vi.fn(),
    aiRun: vi.fn(),
  };
  const service = new AgentOrchestrator(
    db as never,
    authorization as never,
    planner as never,
    { build: vi.fn() } as never,
    registry as never,
    {
      evaluate: vi.fn().mockReturnValue({
        decision:
          tool.operationType === "WRITE" ? "REQUIRE_CONFIRMATION" : "ALLOW",
        code: "ok",
      }),
    } as never,
    {
      limits: { maxContextSize: 100 },
      assertElapsed: vi.fn(),
      assertBudget: vi.fn(),
    } as never,
    { execute: vi.fn().mockResolvedValue(result) } as never,
    confirmations as never,
    states as never,
    { record: vi.fn() } as never,
    metrics as never,
    {
      evaluate: vi.fn().mockReturnValue({
        allowed: true,
        severity: "LOW",
        categories: [],
        sanitized: result,
      }),
    } as never,
    {
      start: vi.fn().mockResolvedValue({ id: "run" }),
      event: vi.fn(),
      incident: vi.fn(),
      finish: vi.fn().mockResolvedValue({
        latencyMs: 1,
        estimatedCostMicros: 0,
        expiresAt: new Date("2030-01-01"),
      }),
    } as never,
    { evaluate: vi.fn() } as never,
    { assertEnabled: vi.fn() } as never,
    { consume: vi.fn() } as never,
  );
  return { service, confirmations };
}
describe("agent orchestrator", () => {
  it("propagates discovery NO_MATCH without invented options", async () => {
    const tool = {
      name: "discovery.search",
      operationType: "READ",
      requiresConfirmation: false,
      enabled: true,
    } as AgentTool;
    const { service } = setup(tool, { items: [], meta: { noMatch: true } });
    const response = await service.message(identity, "session", {
      source: "TEXT",
      content: "bul",
    });
    expect(response.status).toBe("NO_MATCH");
    expect(response.options).toEqual([]);
    expect(response.meta.noMatch).toBe(true);
  });
  it.each(["booking.create", "booking.modify", "booking.cancel"])(
    "never executes %s before confirmation",
    async (name) => {
      const execute = vi.fn();
      const tool = {
        name,
        operationType: "WRITE",
        requiresConfirmation: true,
        enabled: true,
        execute,
      } as unknown as AgentTool;
      const { service, confirmations } = setup(tool, null);
      const response = await service.message(identity, "session", {
        source: "TEXT",
        content: "book",
      });
      expect(response.status).toBe("NEEDS_CONFIRMATION");
      expect(response.pendingAction?.toolName).toBe(name);
      expect(confirmations.create).toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
    },
  );
});
