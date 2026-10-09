/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Inject, Injectable, RequestTimeoutException } from "@nestjs/common";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import { MetricsService } from "../infrastructure/metrics.service.js";
import type { AgentTool, ToolContext } from "./agent.types.js";
@Injectable()
export class ToolExecutor {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly metrics: MetricsService,
  ) {}
  async execute(
    tool: AgentTool,
    input: Record<string, unknown>,
    context: ToolContext,
  ) {
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new RequestTimeoutException("Agent tool timed out")),
          tool.timeoutMs,
        );
      });
      const result = await Promise.race([
        tool.execute(input, context),
        timeout,
      ]);
      await this.db.agentToolExecution.create({
        data: {
          businessId: context.businessId,
          sessionId: context.sessionId,
          toolName: tool.name,
          operationType: tool.operationType,
          status: "SUCCEEDED",
          durationMs: Date.now() - started,
        },
      });
      this.metrics.agentTool(true);
      return result;
    } catch (error) {
      await this.db.agentToolExecution.create({
        data: {
          businessId: context.businessId,
          sessionId: context.sessionId,
          toolName: tool.name,
          operationType: tool.operationType,
          status: "FAILED",
          durationMs: Date.now() - started,
          errorCode:
            error instanceof RequestTimeoutException
              ? "TIMEOUT"
              : "TOOL_FAILED",
        },
      });
      this.metrics.agentTool(false);
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
