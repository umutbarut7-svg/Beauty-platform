import { Inject, Injectable } from "@nestjs/common";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
export interface EvaluationInput {
  businessId: string;
  runId: string;
  status: string;
  intentKnown: boolean;
  toolRequested: boolean;
  toolSucceeded: boolean;
  policyAllowed: boolean;
  authorized: boolean;
  safetyBlocked: boolean;
  toolCalls: number;
  latencyMs: number;
  costMicros: number;
  expiresAt: Date;
}
export interface AIEvaluationJudge {
  evaluate(input: EvaluationInput): Promise<Record<string, number> | null>;
}
@Injectable()
export class AIEvaluationService {
  constructor(@Inject(PRISMA_SERVICE) private readonly db: PrismaService) {}
  evaluate(i: EvaluationInput) {
    const completed = i.status === "COMPLETED",
      blocked = i.status === "BLOCKED",
      needs = i.status === "NEEDS_INFORMATION";
    return this.db.aiEvaluation.create({
      data: {
        businessId: i.businessId,
        runId: i.runId,
        outcome: completed
          ? "SUCCESS"
          : blocked
            ? "BLOCKED"
            : needs
              ? "NEEDS_INFORMATION"
              : "FAILED",
        goalCompletion: completed ? 100 : needs ? 40 : 0,
        intentAccuracy: i.intentKnown ? 100 : 0,
        toolAccuracy: !i.toolRequested || i.toolSucceeded ? 100 : 0,
        parameterCorrectness: i.toolSucceeded ? 100 : i.toolRequested ? 0 : 100,
        policyCompliance: i.policyAllowed ? 100 : 0,
        authorizationCompliance: i.authorized ? 100 : 0,
        hallucinationRisk: i.intentKnown ? 0 : 50,
        responseUsefulness: completed ? 100 : needs ? 60 : 20,
        responseSafety: i.safetyBlocked ? 0 : 100,
        unnecessaryToolUsage:
          i.toolCalls > 1 ? Math.min(100, (i.toolCalls - 1) * 20) : 0,
        costEfficiency:
          i.costMicros === 0
            ? 100
            : Math.max(0, 100 - Math.floor(i.costMicros / 1000)),
        expiresAt: i.expiresAt,
      },
    });
  }
}
