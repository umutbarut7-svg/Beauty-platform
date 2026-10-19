/* eslint-disable @typescript-eslint/consistent-type-imports */
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { DiscoveryService } from "../discovery/discovery.service.js";
import { AvailabilityService } from "../appointments/availability.service.js";
import { AppointmentsService } from "../appointments/appointments.service.js";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { AgentTool } from "./agent.types.js";
import type { DiscoverySearchQueryDto } from "../discovery/discovery.dto.js";
import { BeautyDNAService } from "../beauty-dna/beauty-dna.service.js";
import { ProfessionalIntelligenceService } from "../professional-intelligence/professional-intelligence.service.js";
import { BusinessIntelligenceService } from "../business-intelligence/business-intelligence.service.js";
import { PredictionsService } from "../predictions/predictions.service.js";
import { MarketplaceLiquidityService } from "../marketplace-liquidity/marketplace-liquidity.service.js";
@Injectable()
export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();
  constructor(
    discovery: DiscoveryService,
    availability: AvailabilityService,
    appointments: AppointmentsService,
    predictions: PredictionsService,
    beautyDNA: BeautyDNAService,
    professionalIntelligence: ProfessionalIntelligenceService,
    businessIntelligence: BusinessIntelligenceService,
    marketplaceLiquidity: MarketplaceLiquidityService,
    @Inject(PRISMA_SERVICE) db: PrismaService,
  ) {
    const definitions: AgentTool[] = [
      this.tool(
        "discovery.search",
        "READ",
        false,
        [
          "query",
          "categoryId",
          "serviceId",
          "professionalId",
          "businessId",
          "locationId",
          "city",
          "district",
          "latitude",
          "longitude",
          "radiusKm",
          "minPrice",
          "maxPrice",
          "availableFrom",
          "availableTo",
          "sort",
          "limit",
        ],
        (i) => discovery.search(i as unknown as DiscoverySearchQueryDto),
      ),
      this.tool(
        "availability.check",
        "READ",
        false,
        ["serviceId", "locationId", "staffMemberId", "date"],
        (i, c) =>
          availability.calculate({
            businessId: c.businessId,
            serviceId: String(i.serviceId),
            locationId: String(i.locationId),
            staffMemberId: i.staffMemberId
              ? String(i.staffMemberId)
              : undefined,
            date: String(i.date),
          }),
      ),
      this.tool("business.get", "READ", false, ["businessId"], async (i, c) => {
        if (i.businessId !== undefined && String(i.businessId) !== c.businessId)
          throw new BadRequestException("Cross-tenant business access denied");
        return db.business.findFirst({
          where: { id: c.businessId, status: "ACTIVE" },
          select: {
            id: true,
            name: true,
            slug: true,
            city: true,
            district: true,
            isVerified: true,
          },
        });
      }),
      this.tool("booking.get", "READ", false, ["appointmentId"], async (i, c) =>
        this.safeAppointment(
          await appointments.get(c.user, c.businessId, String(i.appointmentId)),
        ),
      ),
      this.tool(
        "booking.create",
        "WRITE",
        true,
        [
          "locationId",
          "serviceId",
          "staffMemberId",
          "startsAt",
          "customerId",
          "customerNote",
        ],
        async (i, c) =>
          this.safeAppointment(
            await appointments.create(c.user, c.businessId, i as never),
          ),
      ),
      this.tool(
        "booking.modify",
        "WRITE",
        true,
        [
          "appointmentId",
          "locationId",
          "serviceId",
          "staffMemberId",
          "startsAt",
          "customerNote",
        ],
        async (i, c) => {
          const { appointmentId, ...dto } = i;
          return this.safeAppointment(
            await appointments.update(
              c.user,
              c.businessId,
              String(appointmentId),
              dto as never,
            ),
          );
        },
      ),
      this.tool(
        "booking.cancel",
        "WRITE",
        true,
        ["appointmentId", "reason"],
        async (i, c) =>
          this.safeAppointment(
            await appointments.cancel(
              c.user,
              c.businessId,
              String(i.appointmentId),
              { reason: i.reason ? String(i.reason) : undefined },
            ),
          ),
      ),
      this.tool("business_intelligence.metrics", "READ", false, [], (_i, c) =>
        businessIntelligence.metrics(c.user, c.businessId),
      ),
      this.tool("business_intelligence.insights", "READ", false, [], (_i, c) =>
        businessIntelligence.insights(c.user, c.businessId),
      ),
      this.tool(
        "business_intelligence.opportunities",
        "READ",
        false,
        [],
        (_i, c) => businessIntelligence.opportunities(c.user, c.businessId),
      ),
      this.tool("business_intelligence.risks", "READ", false, [], (_i, c) =>
        businessIntelligence.risks(c.user, c.businessId),
      ),
      this.tool(
        "business_intelligence.recommendations",
        "READ",
        false,
        [],
        (_i, c) => businessIntelligence.recommendations(c.user, c.businessId),
      ),
      this.tool("marketplace.liquidity", "READ", false, ["window"], (i, c) =>
        marketplaceLiquidity.overview(
          c.user,
          c.businessId,
          String(i.window ?? "ROLLING_30_DAYS") as never,
        ),
      ),
      this.tool("marketplace.supply_gaps", "READ", false, [], (_i, c) =>
        marketplaceLiquidity.gaps(c.user, c.businessId, 20),
      ),
      this.tool("marketplace.demand", "READ", false, [], (_i, c) =>
        marketplaceLiquidity.demand(c.user, c.businessId, 20),
      ),
      this.tool("marketplace.capacity", "READ", false, [], (_i, c) =>
        marketplaceLiquidity.capacity(c.user, c.businessId, 20),
      ),
      this.tool(
        "marketplace.supply_opportunities",
        "READ",
        false,
        [],
        (_i, c) => marketplaceLiquidity.opportunities(c.user, c.businessId, 20),
      ),
      this.tool(
        "professional_intelligence.context",
        "READ",
        false,
        ["professionalId"],
        (i, c) =>
          professionalIntelligence.readModel(
            c.user,
            c.businessId,
            String(i.professionalId),
          ),
      ),
      this.tool("beauty_dna.context", "READ", false, ["customerId"], (i, c) =>
        beautyDNA.getCustomerBeautyContext(
          c.user,
          c.businessId,
          String(i.customerId),
        ),
      ),
      this.tool("prediction.list", "READ", false, ["customerId"], (i, c) =>
        predictions.list(c.user, c.businessId, String(i.customerId), 20),
      ),
      this.tool(
        "prediction.next_service",
        "READ",
        false,
        ["customerId"],
        (i, c) =>
          predictions.get(
            c.user,
            c.businessId,
            String(i.customerId),
            "NEXT_LIKELY_SERVICE",
          ),
      ),
      this.tool(
        "prediction.maintenance_window",
        "READ",
        false,
        ["customerId"],
        (i, c) =>
          predictions.get(
            c.user,
            c.businessId,
            String(i.customerId),
            "MAINTENANCE_REFRESH_NEED",
          ),
      ),
      this.tool("prediction.rebooking", "READ", false, ["customerId"], (i, c) =>
        predictions.get(
          c.user,
          c.businessId,
          String(i.customerId),
          "REBOOKING_LIKELIHOOD",
        ),
      ),
    ];
    definitions.forEach((t) => this.tools.set(t.name, t));
  }
  private tool(
    name: string,
    operationType: "READ" | "WRITE",
    requiresConfirmation: boolean,
    inputKeys: readonly string[],
    execute: AgentTool["execute"],
  ): AgentTool {
    return {
      name,
      description: name,
      category: name.split(".")[0]!,
      version: "1",
      permission:
        operationType === "WRITE" ? "appointment:manage" : "appointment:read",
      operationType,
      requiresConfirmation,
      timeoutMs: 5000,
      enabled: true,
      inputKeys,
      execute,
    };
  }
  get(name: string) {
    const tool = this.tools.get(name);
    if (!tool) throw new BadRequestException("Unknown agent tool");
    return tool;
  }
  list() {
    return [...this.tools.values()].map((tool) => {
      const safe = { ...tool };
      delete (safe as Partial<AgentTool>).execute;
      return safe;
    });
  }
  validate(tool: AgentTool, input: Record<string, unknown>) {
    const invalid = Object.keys(input).filter(
      (k) => !tool.inputKeys.includes(k),
    );
    if (invalid.length) throw new BadRequestException("Invalid tool arguments");
    if (
      Object.values(input).some(
        (v) =>
          v !== null && !["string", "number", "boolean"].includes(typeof v),
      )
    )
      throw new BadRequestException("Invalid tool argument value");
  }
  private safeAppointment(value: Record<string, unknown>) {
    return {
      id: value.id,
      status: value.status,
      serviceId: value.serviceId,
      staffMemberId: value.staffMemberId,
      locationId: value.locationId,
      startsAt: value.startsAt,
      endsAt: value.endsAt,
      currency: value.currency,
      price: value.price,
    };
  }
}
