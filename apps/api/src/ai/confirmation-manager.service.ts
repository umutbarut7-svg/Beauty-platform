import {
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import { sanitizeTelemetry } from "../infrastructure/sanitizer.js";
@Injectable()
export class ConfirmationManager {
  constructor(@Inject(PRISMA_SERVICE) private readonly db: PrismaService) {}
  create(input: {
    businessId: string;
    sessionId: string;
    toolName: string;
    arguments: Record<string, unknown>;
    summary: string;
  }) {
    return this.db.agentPendingAction.create({
      data: {
        ...input,
        arguments: sanitizeTelemetry(input.arguments),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
  }
  async claim(businessId: string, sessionId: string, actionId: string) {
    const found = await this.db.agentPendingAction.findFirst({
      where: { id: actionId, businessId, sessionId },
    });
    if (!found) throw new NotFoundException("Pending action not found");
    if (found.expiresAt <= new Date()) {
      await this.db.agentPendingAction.updateMany({
        where: { id: actionId, status: "PENDING" },
        data: { status: "EXPIRED" },
      });
      throw new GoneException("Confirmation expired");
    }
    const claimed = await this.db.agentPendingAction.updateMany({
      where: {
        id: actionId,
        businessId,
        sessionId,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });
    if (claimed.count !== 1)
      throw new ConflictException("Confirmation already consumed");
    return this.db.agentPendingAction.findUnique({ where: { id: actionId } });
  }
  async reject(businessId: string, sessionId: string, actionId: string) {
    const result = await this.db.agentPendingAction.updateMany({
      where: {
        id: actionId,
        businessId,
        sessionId,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      data: { status: "REJECTED" },
    });
    if (result.count !== 1)
      throw new ConflictException("Confirmation cannot be rejected");
  }
  executed(actionId: string, result: unknown) {
    return this.db.agentPendingAction.update({
      where: { id: actionId },
      data: {
        status: "EXECUTED",
        executedAt: new Date(),
        result: sanitizeTelemetry(result),
      },
    });
  }
}
