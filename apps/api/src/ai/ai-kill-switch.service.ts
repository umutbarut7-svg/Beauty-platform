import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
@Injectable()
export class AIKillSwitchService {
  constructor(@Inject(PRISMA_SERVICE) private readonly db: PrismaService) {}
  async assertEnabled(input: {
    businessId: string;
    agentType: string;
    toolName?: string;
  }) {
    const targets = [
      { scope: "GLOBAL", target: "*", businessId: null },
      {
        scope: "TENANT",
        target: input.businessId,
        businessId: input.businessId,
      },
      {
        scope: "AGENT_TYPE",
        target: input.agentType,
        businessId: input.businessId,
      },
      ...(input.toolName
        ? [
            {
              scope: "TOOL",
              target: input.toolName,
              businessId: input.businessId,
            },
          ]
        : []),
    ];
    const disabled = await this.db.aiKillSwitch.findFirst({
      where: { enabled: true, OR: targets },
    });
    if (disabled)
      throw new ServiceUnavailableException("AI_CAPABILITY_DISABLED");
  }
}
