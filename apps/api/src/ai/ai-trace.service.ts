import { Inject, Injectable } from "@nestjs/common";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import { redactAI } from "./ai-redaction.js";
import type { AIEventType, AIFailureCategory } from "./ai-safety.types.js";
@Injectable()
export class AITraceService {
  constructor(@Inject(PRISMA_SERVICE) private readonly db: PrismaService) {}
  private expiry() {
    const days = Number(process.env.AI_TRACE_RETENTION_DAYS ?? 30);
    return new Date(Date.now() + days * 86_400_000);
  }
  async start(input: {
    businessId: string;
    sessionId: string;
    userId?: string;
    agentType: string;
    goal?: string;
  }) {
    const run = await this.db.aiRun.create({
      data: {
        ...input,
        status: "RUNNING",
        retentionPolicy: `${process.env.AI_TRACE_RETENTION_DAYS ?? 30}d`,
        expiresAt: this.expiry(),
      },
    });
    await this.event(input.businessId, run.id, "AI_RUN_STARTED", {
      sessionId: input.sessionId,
      agentType: input.agentType,
    });
    return run;
  }
  event(
    businessId: string,
    runId: string,
    type: AIEventType,
    payload?: unknown,
  ) {
    return this.db.aiTraceEvent.create({
      data: {
        businessId,
        runId,
        type,
        version: 1,
        payload: payload === undefined ? undefined : redactAI(payload),
      },
    });
  }
  async finish(input: {
    businessId: string;
    runId: string;
    status:
      | "COMPLETED"
      | "FAILED"
      | "BLOCKED"
      | "NEEDS_INFORMATION"
      | "NO_MATCH"
      | "NOT_AVAILABLE";
    startedAt: number;
    intent?: string;
    goal?: string;
    provider?: string;
    tokens?: number;
    costMicros?: number;
    retryCount?: number;
    toolCalls?: number;
    errorCategory?: AIFailureCategory;
  }) {
    const run = await this.db.aiRun.update({
      where: { id: input.runId },
      data: {
        status: input.status,
        latencyMs: Date.now() - input.startedAt,
        detectedIntent: input.intent,
        goal: input.goal,
        provider: input.provider,
        tokenUsage: input.tokens ?? 0,
        estimatedCostMicros: input.costMicros ?? 0,
        retryCount: input.retryCount ?? 0,
        toolCallCount: input.toolCalls ?? 0,
        errorCategory: input.errorCategory,
      },
    });
    await this.event(
      input.businessId,
      input.runId,
      input.status === "COMPLETED" ? "AI_RUN_COMPLETED" : "AI_RUN_FAILED",
      { status: input.status, errorCategory: input.errorCategory },
    );
    return run;
  }
  incident(input: {
    businessId: string;
    runId: string;
    category: string;
    severity: string;
    blocked: boolean;
    evidence?: unknown;
  }) {
    return this.db.aiSafetyIncident.create({
      data: {
        ...input,
        evidence: redactAI(input.evidence),
        expiresAt: this.expiry(),
      },
    });
  }
}
