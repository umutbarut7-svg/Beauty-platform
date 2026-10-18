import { describe, expect, it, vi } from "vitest";
import { AgentPlanner } from "./planner.service.js";
import { AgentPolicyEngine } from "./policy-engine.service.js";
import { ContextBuilder } from "./context-builder.service.js";
import {
  DeterministicModelProvider,
  ModelRouter,
} from "./model-router.service.js";
import { AgentStateService } from "./agent-state.service.js";
import type { AgentLimits, AgentTool } from "./agent.types.js";
const limits: AgentLimits = {
  maxPlannerSteps: 4,
  maxToolCalls: 8,
  maxWriteActions: 1,
  maxContextSize: 100,
  maxTokens: 100,
  maxExecutionTimeMs: 1000,
  maxRetries: 2,
  maxEstimatedCostMicros: 1000,
};
const tool = (overrides: Partial<AgentTool> = {}): AgentTool => ({
  name: "booking.create",
  description: "",
  category: "booking",
  version: "1",
  permission: "appointment:manage",
  operationType: "WRITE",
  requiresConfirmation: true,
  timeoutMs: 10,
  enabled: true,
  inputKeys: [],
  execute: vi.fn(),
  ...overrides,
});
describe("agent core", () => {
  it("produces UNKNOWN and asks for the highest-information missing field", () => {
    const planner = new AgentPlanner();
    expect(planner.plan({ source: "TEXT", content: "hello" }).intent).toBe(
      "UNKNOWN",
    );
    const plan = planner.plan({
      source: "TEXT",
      content: "book",
      intent: "CREATE_BOOKING",
      arguments: {},
    });
    expect(plan.question?.field).toBe("locationId");
    expect(plan.missingInformation).toHaveLength(4);
  });
  it.each(["TEXT", "VOICE", "PHOTO"] as const)(
    "accepts %s through one structured planner",
    (source) => {
      expect(
        new AgentPlanner().plan({ source, content: "salon bul" }).intent,
      ).toBe("DISCOVER_SERVICE");
    },
  );
  it("separates read from confirmed writes and enforces limits", () => {
    const policy = new AgentPolicyEngine();
    expect(
      policy.evaluate({
        tool: tool(),
        authenticated: true,
        sameTenant: true,
        confirmed: false,
        missing: [],
        toolCalls: 0,
        writeActions: 0,
        limits,
      }).decision,
    ).toBe("REQUIRE_CONFIRMATION");
    expect(
      policy.evaluate({
        tool: tool({ operationType: "READ", requiresConfirmation: false }),
        authenticated: true,
        sameTenant: true,
        confirmed: false,
        missing: [],
        toolCalls: 0,
        writeActions: 0,
        limits,
      }).decision,
    ).toBe("ALLOW");
    expect(
      policy.evaluate({
        tool: tool(),
        authenticated: true,
        sameTenant: false,
        confirmed: true,
        missing: [],
        toolCalls: 0,
        writeActions: 0,
        limits,
      }).decision,
    ).toBe("DENY");
    expect(
      policy.evaluate({
        tool: tool(),
        authenticated: true,
        sameTenant: true,
        confirmed: true,
        missing: [],
        toolCalls: 8,
        writeActions: 0,
        limits,
      }).code,
    ).toBe("AGENT_LIMIT_EXCEEDED");
  });
  it("denies disabled tools", () =>
    expect(
      new AgentPolicyEngine().evaluate({
        tool: tool({ enabled: false }),
        authenticated: true,
        sameTenant: true,
        confirmed: true,
        missing: [],
        toolCalls: 0,
        writeActions: 0,
        limits,
      }).code,
    ).toBe("TOOL_DISABLED"));
  it("denies an ungranted tool permission", () =>
    expect(
      new AgentPolicyEngine().evaluate({
        tool: tool(),
        authenticated: true,
        sameTenant: true,
        permissionGranted: false,
        confirmed: true,
        missing: [],
        toolCalls: 0,
        writeActions: 0,
        limits,
      }).code,
    ).toBe("TOOL_PERMISSION_DENIED"));
  it("minimizes old conversation turns", () => {
    const result = new ContextBuilder().build(
      { activeGoal: "BOOK" },
      Array.from({ length: 9 }, (_, i) => ({
        role: "USER",
        content: String(i),
      })),
      ["discovery.search"],
      1000,
    );
    expect(result.latestTurns).toHaveLength(4);
    expect(result.latestTurns[0]?.content).toBe("5");
  });
  it("routes deterministically without external credentials", async () => {
    const provider = new DeterministicModelProvider();
    const result = await new ModelRouter(provider)
      .route("INTENT")
      .complete({ task: "INTENT", input: "  İŞLETME  " });
    expect(result).toEqual({ value: "işletme", provider: "DETERMINISTIC" });
  });
  it("allows only deterministic state transitions", () => {
    const state = new AgentStateService({} as never);
    expect(() =>
      state.assertTransition("ACTIVE", "NEEDS_CONFIRMATION"),
    ).not.toThrow();
    expect(() => state.assertTransition("COMPLETED", "ACTIVE")).toThrow();
  });
});
