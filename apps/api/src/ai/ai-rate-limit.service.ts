/* eslint-disable @typescript-eslint/consistent-type-imports */
import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { AbuseProtectionService } from "../infrastructure/abuse-protection.service.js";
import type { AgentIdentity } from "./agent.types.js";
@Injectable()
export class AIRateLimitService {
  constructor(private readonly abuse: AbuseProtectionService) {}
  async consume(identity: AgentIdentity, sessionId: string, agentType: string) {
    const limit = Number(process.env.AI_RATE_LIMIT_PER_MINUTE ?? 20);
    for (const [scope, id] of [
      ["AI_TENANT", identity.businessId],
      ["AI_USER", `${identity.businessId}:${identity.user.id}`],
      ["AI_SESSION", `${identity.businessId}:${sessionId}`],
      ["AI_AGENT_TYPE", `${identity.businessId}:${agentType}`],
    ] as const) {
      const result = await this.abuse.consume(
        { scope, limit, windowMs: 60_000 },
        id,
      );
      if (!result.allowed)
        throw new HttpException(
          "AI_RATE_LIMIT_REACHED",
          HttpStatus.TOO_MANY_REQUESTS,
        );
    }
  }
}
