import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { AgentLimits } from "./agent.types.js";
@Injectable()
export class AgentUsageGuard {
  readonly limits: AgentLimits = {
    maxPlannerSteps: 4,
    maxToolCalls: 8,
    maxWriteActions: 1,
    maxContextSize: 6000,
    maxTokens: 2000,
    maxExecutionTimeMs: 15000,
    maxRetries: 2,
    maxEstimatedCostMicros: Number(
      process.env.AI_MAX_ESTIMATED_COST_MICROS ?? 100_000,
    ),
  };
  assertElapsed(started: number) {
    if (Date.now() - started > this.limits.maxExecutionTimeMs)
      throw new ServiceUnavailableException("AGENT_EXECUTION_LIMIT_EXCEEDED");
  }
  assertBudget(input: {
    tokens: number;
    estimatedCostMicros: number;
    retries: number;
  }) {
    if (
      input.tokens > this.limits.maxTokens ||
      input.estimatedCostMicros > this.limits.maxEstimatedCostMicros ||
      input.retries > this.limits.maxRetries
    )
      throw new ServiceUnavailableException("AI_BUDGET_EXCEEDED");
  }
}
