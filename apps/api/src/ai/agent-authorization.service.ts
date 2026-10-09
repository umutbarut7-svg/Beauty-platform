import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { AgentIdentity, AgentType } from "./agent.types.js";
@Injectable()
export class AgentAuthorizationService {
  constructor(@Inject(PRISMA_SERVICE) private readonly db: PrismaService) {}
  async assertSessionAccess(identity: AgentIdentity, agentType?: AgentType) {
    const business = await this.db.business.findFirst({
      where: { id: identity.businessId, status: "ACTIVE" },
      select: { id: true, isPublic: true },
    });
    if (!business) throw new NotFoundException("Business not found");
    if (identity.user.role === "SUPER_ADMIN") return;
    const membership = await this.db.businessMember.findUnique({
      where: {
        userId_businessId: {
          userId: identity.user.id,
          businessId: identity.businessId,
        },
      },
      select: { id: true },
    });
    if (
      (agentType === "BUSINESS_GROWTH" ||
        agentType === "PROFESSIONAL_COPILOT") &&
      !membership
    )
      throw new ForbiddenException("Agent access denied");
    if (!membership && !business.isPublic)
      throw new ForbiddenException("Agent access denied");
  }
  async assertOwnSession(identity: AgentIdentity, sessionId: string) {
    const session = await this.db.agentSession.findFirst({
      where: {
        id: sessionId,
        businessId: identity.businessId,
        userId: identity.user.id,
      },
      include: {
        turns: { orderBy: { createdAt: "desc" }, take: 10 },
        pendingActions: {
          where: { status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    if (!session) throw new NotFoundException("Agent session not found");
    return session;
  }
  toolAllowed(agentType: AgentType, toolName: string) {
    const allowed: Record<AgentType, readonly string[]> = {
      BOOKING: [
        "discovery.search",
        "availability.check",
        "business.get",
        "booking.get",
        "booking.create",
        "booking.modify",
        "booking.cancel",
      ],
      CUSTOMER_BEAUTY: [
        "discovery.search",
        "availability.check",
        "business.get",
        "beauty_dna.context",
        "prediction.list",
        "prediction.next_service",
        "prediction.maintenance_window",
        "prediction.rebooking",
      ],
      BUSINESS_GROWTH: [
        "business.get",
        "business_intelligence.metrics",
        "business_intelligence.insights",
        "business_intelligence.opportunities",
        "business_intelligence.risks",
        "business_intelligence.recommendations",
        "marketplace.liquidity",
        "marketplace.supply_gaps",
        "marketplace.demand",
        "marketplace.capacity",
        "marketplace.supply_opportunities",
      ],
      PROFESSIONAL_COPILOT: [
        "availability.check",
        "booking.get",
        "professional_intelligence.context",
      ],
    };
    return allowed[agentType].includes(toolName);
  }
}
