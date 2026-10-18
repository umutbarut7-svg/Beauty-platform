import { ConflictException, Inject, Injectable } from "@nestjs/common";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { AgentStatus } from "./agent.types.js";
const TRANSITIONS: Record<AgentStatus, readonly AgentStatus[]> = {
  ACTIVE: [
    "NEEDS_INFORMATION",
    "NEEDS_CONFIRMATION",
    "COMPLETED",
    "NO_MATCH",
    "FAILED",
    "CANCELLED",
  ],
  NEEDS_INFORMATION: [
    "ACTIVE",
    "NEEDS_INFORMATION",
    "NEEDS_CONFIRMATION",
    "COMPLETED",
    "NO_MATCH",
    "FAILED",
    "CANCELLED",
  ],
  NEEDS_CONFIRMATION: ["EXECUTING", "CANCELLED", "FAILED"],
  EXECUTING: ["COMPLETED", "FAILED", "NO_MATCH"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
  NO_MATCH: [],
};
@Injectable()
export class AgentStateService {
  constructor(@Inject(PRISMA_SERVICE) private readonly db: PrismaService) {}
  assertTransition(from: AgentStatus, to: AgentStatus) {
    if (from !== to && !TRANSITIONS[from].includes(to))
      throw new ConflictException(
        `Invalid agent state transition: ${from} -> ${to}`,
      );
  }
  async transition(
    session: Record<string, unknown>,
    to: AgentStatus,
    data: Record<string, unknown> = {},
  ) {
    this.assertTransition(session.status as AgentStatus, to);
    return this.db.agentSession.update({
      where: { id: String(session.id) },
      data: { ...data, status: to },
    });
  }
}
