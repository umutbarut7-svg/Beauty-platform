import { Inject, Injectable } from "@nestjs/common";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
@Injectable()
export class AIObservabilityQueryService {
  constructor(@Inject(PRISMA_SERVICE) private readonly db: PrismaService) {}
  list(
    businessId: string,
    filter: { status?: string; agentType?: string; limit?: number } = {},
  ) {
    return this.db.aiRun.findMany({
      where: {
        businessId,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.agentType ? { agentType: filter.agentType } : {}),
      },
      select: {
        id: true,
        sessionId: true,
        agentType: true,
        status: true,
        latencyMs: true,
        tokenUsage: true,
        estimatedCostMicros: true,
        toolCallCount: true,
        errorCategory: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(100, Math.max(1, filter.limit ?? 20)),
    });
  }
}
