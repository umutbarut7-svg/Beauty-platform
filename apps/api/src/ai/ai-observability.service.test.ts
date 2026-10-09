/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { AITraceService } from "./ai-trace.service.js";
import { AIEvaluationService } from "./ai-evaluation.service.js";
import { AIObservabilityQueryService } from "./ai-observability-query.service.js";
describe("AI observability", () => {
  it("creates versioned redacted trace events and retention metadata", async () => {
    const create = vi.fn().mockResolvedValue({ id: "run" });
    const event = vi.fn();
    const service = new AITraceService({
      aiRun: { create },
      aiTraceEvent: { create: event },
    } as never);
    await service.start({
      businessId: "b",
      sessionId: "s",
      userId: "u",
      agentType: "BOOKING",
    });
    await service.event("b", "run", "AI_PLAN_CREATED", {
      email: "a@b.com",
      token: "secret",
    });
    expect(create.mock.calls[0]![0].data.expiresAt).toBeInstanceOf(Date);
    expect(event.mock.calls.at(-1)![0].data.version).toBe(1);
    expect(event.mock.calls.at(-1)![0].data.payload).toEqual({
      email: "[EMAIL_REDACTED]",
      token: "[REDACTED]",
    });
  });
  it("generates deterministic evaluation scores", async () => {
    const create = vi.fn(({ data }: any) => data);
    const service = new AIEvaluationService({
      aiEvaluation: { create },
    } as never);
    const result = await service.evaluate({
      businessId: "b",
      runId: "r",
      status: "COMPLETED",
      intentKnown: true,
      toolRequested: true,
      toolSucceeded: true,
      policyAllowed: true,
      authorized: true,
      safetyBlocked: false,
      toolCalls: 1,
      latencyMs: 10,
      costMicros: 0,
      expiresAt: new Date(),
    });
    expect(result.outcome).toBe("SUCCESS");
    expect(result.responseSafety).toBe(100);
    expect(result.goalCompletion).toBe(100);
  });
  it("scopes internal observability queries to one tenant and bounded pages", async () => {
    const findMany = vi.fn();
    await new AIObservabilityQueryService({
      aiRun: { findMany },
    } as never).list("tenant-a", { limit: 999 });
    expect(findMany.mock.calls[0]![0].where.businessId).toBe("tenant-a");
    expect(findMany.mock.calls[0]![0].take).toBe(100);
    expect(findMany.mock.calls[0]![0].select).not.toHaveProperty("events");
  });
});
