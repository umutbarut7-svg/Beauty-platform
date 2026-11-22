/* eslint-disable @typescript-eslint/consistent-type-imports, @typescript-eslint/no-explicit-any */
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { MarketplaceLiquidityEngine } from "./marketplace-liquidity.engine.js";
import {
  DEMAND_SIGNAL_TYPES,
  LIQUIDITY_WINDOWS,
  SUPPLY_SIGNAL_TYPES,
  type DemandSignalType,
  type LiquidityWindow,
  type SignalSource,
  type SupplySignalType,
} from "./marketplace-liquidity.types.js";
@Injectable()
export class MarketplaceLiquidityService {
  private readonly calculationVersion = "marketplace-liquidity-v1";
  private readonly logger = new Logger(MarketplaceLiquidityService.name);
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly engine: MarketplaceLiquidityEngine,
  ) {}
  async overview(
    user: AuthenticatedUser,
    businessId: string,
    window: LiquidityWindow,
  ) {
    await this.authorize(user, businessId);
    const snapshot = await this.db.marketplaceLiquiditySnapshot.findFirst({
      where: { businessId, window },
      orderBy: { observedAt: "desc" },
      select: this.snapshotProjection(),
    });
    return snapshot
      ? {
          status:
            new Date(snapshot.periodEnd).getTime() <
            Date.now() - this.days(window) * 86_400_000
              ? "STALE_DATA"
              : snapshot.dataState,
          snapshot,
        }
      : { status: "NO_DATA", snapshot: null };
  }
  async demand(
    user: AuthenticatedUser,
    businessId: string,
    limit = 20,
    window?: LiquidityWindow,
  ) {
    await this.authorize(user, businessId);
    const now = new Date();
    return this.db.marketplaceDemandSignal.findMany({
      where: {
        businessId,
        ...(window
          ? {
              timeWindow: window,
              observedAt: {
                gte: new Date(now.getTime() - this.days(window) * 86_400_000),
                lte: now,
              },
            }
          : {}),
      },
      orderBy: { observedAt: "desc" },
      take: Math.min(100, limit),
      select: {
        id: true,
        signalType: true,
        source: true,
        categoryId: true,
        serviceId: true,
        geoKey: true,
        timeWindow: true,
        value: true,
        confidence: true,
        freshness: true,
        observedAt: true,
        dataState: true,
      },
    });
  }
  async supply(user: AuthenticatedUser, businessId: string, limit = 20) {
    await this.authorize(user, businessId);
    return this.db.marketplaceSupplySignal.findMany({
      where: { businessId },
      orderBy: { observedAt: "desc" },
      take: Math.min(100, limit),
      select: {
        id: true,
        signalType: true,
        source: true,
        categoryId: true,
        serviceId: true,
        geoKey: true,
        timeWindow: true,
        value: true,
        confidence: true,
        freshness: true,
        observedAt: true,
        dataState: true,
      },
    });
  }
  async capacity(user: AuthenticatedUser, businessId: string, limit = 20) {
    await this.authorize(user, businessId);
    return this.db.marketplaceCapacityObservation.findMany({
      where: { businessId },
      orderBy: { observedAt: "desc" },
      take: Math.min(100, limit),
      select: {
        id: true,
        serviceId: true,
        professionalId: true,
        geoKey: true,
        timeWindow: true,
        availableSlots: true,
        usableMinutes: true,
        bookedMinutes: true,
        confidence: true,
        freshness: true,
        observedAt: true,
        dataState: true,
      },
    });
  }
  async gaps(user: AuthenticatedUser, businessId: string, limit = 20) {
    await this.authorize(user, businessId);
    return this.db.marketplaceSupplyGap.findMany({
      where: { businessId },
      orderBy: { observedAt: "desc" },
      take: Math.min(100, limit),
      select: {
        id: true,
        categoryId: true,
        serviceId: true,
        geoKey: true,
        timeWindow: true,
        severity: true,
        confidence: true,
        evidence: true,
        limitations: true,
        observedAt: true,
        calculationVersion: true,
      },
    });
  }
  async opportunities(user: AuthenticatedUser, businessId: string, limit = 20) {
    await this.authorize(user, businessId);
    return this.db.marketplaceSupplyOpportunity.findMany({
      where: { businessId },
      orderBy: { observedAt: "desc" },
      take: Math.min(100, limit),
      select: {
        id: true,
        categoryId: true,
        serviceId: true,
        geoKey: true,
        timeWindow: true,
        confidence: true,
        evidence: true,
        limitations: true,
        observedAt: true,
        calculationVersion: true,
      },
    });
  }
  async ingestDemand(
    user: AuthenticatedUser,
    businessId: string,
    event: {
      eventId: string;
      type: DemandSignalType;
      source: SignalSource;
      sourceEntityType: string;
      sourceEntityId: string;
      categoryId?: string;
      serviceId?: string;
      geoKey?: string;
      timeWindow: string;
      value: number;
      confidence: number;
      freshness: number;
      observedAt: Date;
      evidence: Record<string, unknown>;
    },
  ) {
    await this.authorize(user, businessId);
    if (
      !DEMAND_SIGNAL_TYPES.includes(event.type) ||
      !LIQUIDITY_WINDOWS.includes(event.timeWindow as LiquidityWindow)
    )
      throw new BadRequestException("Invalid marketplace demand taxonomy");
    this.validateSignal(event);
    await this.assertEvidenceScope(businessId, event);
    if (
      event.source === "PREDICTED" &&
      (!event.evidence.predictionId || !event.evidence.expiresAt)
    )
      throw new BadRequestException(
        "Predicted demand requires evidence and validity",
      );
    return this.ingestLocked("demand", businessId, event, async (tx, key) =>
      tx.marketplaceDemandSignal.create({
        data: {
          businessId,
          signalType: event.type,
          source: event.source,
          sourceEntityType: event.sourceEntityType,
          sourceEntityId: event.sourceEntityId,
          idempotencyKey: key,
          categoryId: event.categoryId,
          serviceId: event.serviceId,
          geoKey: event.geoKey,
          timeWindow: event.timeWindow,
          value: event.value,
          evidence: event.evidence,
          confidence: event.confidence,
          freshness: event.freshness,
          observedAt: event.observedAt,
          dataState: event.value === 0 ? "ZERO" : "AVAILABLE",
          calculationVersion: this.calculationVersion,
        },
      }),
    );
  }
  async ingestSupply(
    user: AuthenticatedUser,
    businessId: string,
    event: {
      eventId: string;
      type: SupplySignalType;
      source: Exclude<SignalSource, "PREDICTED">;
      sourceEntityType: string;
      sourceEntityId: string;
      categoryId?: string;
      serviceId?: string;
      geoKey?: string;
      timeWindow: string;
      value: number;
      confidence: number;
      freshness: number;
      observedAt: Date;
      evidence: Record<string, unknown>;
    },
  ) {
    await this.authorize(user, businessId);
    if (
      !SUPPLY_SIGNAL_TYPES.includes(event.type) ||
      !LIQUIDITY_WINDOWS.includes(event.timeWindow as LiquidityWindow)
    )
      throw new BadRequestException("Invalid marketplace supply taxonomy");
    this.validateSignal(event);
    await this.assertEvidenceScope(businessId, event);
    return this.ingestLocked("supply", businessId, event, async (tx, key) =>
      tx.marketplaceSupplySignal.create({
        data: {
          businessId,
          signalType: event.type,
          source: event.source,
          sourceEntityType: event.sourceEntityType,
          sourceEntityId: event.sourceEntityId,
          idempotencyKey: key,
          categoryId: event.categoryId,
          serviceId: event.serviceId,
          geoKey: event.geoKey,
          timeWindow: event.timeWindow,
          value: event.value,
          evidence: event.evidence,
          confidence: event.confidence,
          freshness: event.freshness,
          observedAt: event.observedAt,
          dataState: event.value === 0 ? "ZERO" : "AVAILABLE",
          calculationVersion: this.calculationVersion,
        },
      }),
    );
  }
  async ingestCapacity(
    user: AuthenticatedUser,
    businessId: string,
    event: {
      eventId: string;
      serviceId?: string;
      professionalId?: string;
      geoKey?: string;
      timeWindow: LiquidityWindow;
      availableSlots: number;
      usableMinutes: number;
      bookedMinutes: number;
      confidence: number;
      freshness: number;
      observedAt: Date;
      evidence: Record<string, unknown>;
    },
  ) {
    await this.authorize(user, businessId);
    if (
      !event.eventId?.trim() ||
      !LIQUIDITY_WINDOWS.includes(event.timeWindow) ||
      ![event.availableSlots, event.usableMinutes, event.bookedMinutes].every(
        (value) => Number.isSafeInteger(value) && value >= 0,
      ) ||
      event.bookedMinutes > event.usableMinutes ||
      !Number.isFinite(event.confidence) ||
      event.confidence < 0 ||
      event.confidence > 1 ||
      !Number.isFinite(event.freshness) ||
      event.freshness < 0 ||
      event.freshness > 1 ||
      !(event.observedAt instanceof Date) ||
      Number.isNaN(event.observedAt.getTime())
    )
      throw new BadRequestException("Malformed capacity observation");
    if (event.serviceId)
      await this.assertEvidenceScope(businessId, {
        sourceEntityType: "SERVICE",
        sourceEntityId: event.serviceId,
      });
    return this.db.$transaction(async (tx: PrismaService) => {
      const key = `capacity:${event.eventId}`;
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        `marketplace-capacity:${businessId}:${key}`,
      );
      const existing = await tx.marketplaceCapacityObservation.findUnique({
        where: {
          businessId_idempotencyKey: { businessId, idempotencyKey: key },
        },
      });
      if (existing) return { status: "DUPLICATE" };
      await tx.marketplaceCapacityObservation.create({
        data: {
          businessId,
          idempotencyKey: key,
          serviceId: event.serviceId,
          professionalId: event.professionalId,
          geoKey: event.geoKey,
          timeWindow: event.timeWindow,
          availableSlots: event.availableSlots,
          usableMinutes: event.usableMinutes,
          bookedMinutes: event.bookedMinutes,
          confidence: event.confidence,
          freshness: event.freshness,
          observedAt: event.observedAt,
          evidence: event.evidence,
          dataState: event.availableSlots === 0 ? "ZERO" : "AVAILABLE",
          calculationVersion: this.calculationVersion,
        },
      });
      return { status: "RECORDED" };
    });
  }
  async recalculate(
    user: AuthenticatedUser,
    businessId: string,
    window: LiquidityWindow,
    now = new Date(),
  ) {
    await this.authorize(user, businessId);
    if (!LIQUIDITY_WINDOWS.includes(window))
      throw new BadRequestException("Invalid liquidity window");
    const start = new Date(now.getTime() - this.days(window) * 86_400_000);
    const [demandSignals, supplySignals, capacities] = await Promise.all([
      this.db.marketplaceDemandSignal.findMany({
        where: {
          businessId,
          timeWindow: window,
          observedAt: { gte: start, lt: now },
          source: { not: "PREDICTED" },
        },
        select: { signalType: true, value: true, freshness: true },
      }),
      this.db.marketplaceSupplySignal.findMany({
        where: {
          businessId,
          timeWindow: window,
          observedAt: { gte: start, lt: now },
        },
        select: { value: true, freshness: true },
      }),
      this.db.marketplaceCapacityObservation.findMany({
        where: {
          businessId,
          timeWindow: window,
          observedAt: { gte: start, lt: now },
          dataState: { in: ["AVAILABLE", "ZERO"] },
        },
        select: { availableSlots: true, freshness: true },
      }),
    ]);
    const demand = this.sumOrNull(
      demandSignals.map((x: any) => Number(x.value)),
    );
    const supply = this.sumOrNull(
      supplySignals.map((x: any) => Number(x.value)),
    );
    const capacity = this.sumOrNull(
      capacities.map((x: any) => x.availableSlots),
    );
    const matches = this.sumOrNull(
      demandSignals
        .filter((x: any) => x.signalType === "MATCH_REQUEST")
        .map((x: any) => Number(x.value)),
    );
    const completed = this.sumOrNull(
      demandSignals
        .filter((x: any) => x.signalType === "COMPLETED_BOOKING")
        .map((x: any) => Number(x.value)),
    );
    const sampleSize =
      demandSignals.length + supplySignals.length + capacities.length;
    const freshnessValues = [
      ...demandSignals,
      ...supplySignals,
      ...capacities,
    ].map((x: any) => Number(x.freshness));
    const freshness = freshnessValues.length ? Math.min(...freshnessValues) : 0;
    const result = this.engine.calculate({
      demand,
      supply,
      capacity,
      matches,
      completedBookings: completed,
      freshness,
      sampleSize,
    });
    const noMatches = this.sumOrNull(
      demandSignals
        .filter((x: any) => x.signalType === "NO_MATCH")
        .map((x: any) => Number(x.value)),
    );
    const gap = this.engine.supplyGap(demand, capacity, noMatches, sampleSize);
    return this.db.$transaction(async (tx: PrismaService) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        `marketplace-liquidity:${businessId}`,
      );
      const profile = await tx.marketplaceLiquidityProfile.upsert({
        where: { businessId },
        create: { businessId },
        update: {},
      });
      const version = profile.version + 1;
      const snapshot = await tx.marketplaceLiquiditySnapshot.create({
        data: {
          businessId,
          window,
          periodStart: start,
          periodEnd: now,
          health: result.health,
          dataState: result.state,
          components: result.components ?? {},
          evidence: {
            demandSignalCount: demandSignals.length,
            supplySignalCount: supplySignals.length,
            capacityObservationCount: capacities.length,
          },
          confidence: result.confidence,
          observedAt: now,
          calculationVersion: this.calculationVersion,
          version,
        },
      });
      if (gap.state === "GAP") {
        const createdGap = await tx.marketplaceSupplyGap.create({
          data: {
            businessId,
            timeWindow: window,
            severity: gap.severity,
            demandEvidence: { demand },
            supplyEvidence: { supply, capacity },
            evidence: gap.evidence,
            limitations: [
              "Observed association; not a demand or revenue guarantee",
            ],
            confidence: gap.confidence,
            observedAt: now,
            calculationVersion: this.calculationVersion,
            snapshotId: snapshot.id,
          },
        });
        await tx.marketplaceSupplyOpportunity.create({
          data: {
            businessId,
            timeWindow: window,
            evidence: gap.evidence,
            limitations: [
              "No guaranteed customers or revenue",
              "Requires local validation",
            ],
            confidence: gap.confidence,
            observedAt: now,
            calculationVersion: this.calculationVersion,
            gapId: createdGap.id,
          },
        });
        this.log("supply_gap_detected", businessId, { severity: gap.severity });
      }
      await tx.marketplaceLiquidityProfile.update({
        where: { id: profile.id },
        data: { version },
      });
      await tx.marketplaceLiquidityVersion.create({
        data: {
          businessId,
          version,
          calculationVersion: this.calculationVersion,
          snapshotId: snapshot.id,
          summary: { window, state: result.state, health: result.health },
        },
      });
      this.log("liquidity_calculated", businessId, {
        state: result.state,
        health: result.health,
      });
      return {
        status: result.state,
        version,
        snapshotId: snapshot.id,
        health: result.health,
        components: result.components,
        confidence: result.confidence,
        gap: gap.state,
      };
    });
  }
  assertIntervention(action: string, confirmed = false) {
    const level = this.engine.intervention(action);
    if (level === "PROHIBITED_AUTONOMOUS")
      throw new ForbiddenException("Marketplace intervention prohibited");
    if (level === "REQUIRES_CONFIRMATION" && !confirmed)
      throw new ForbiddenException("Explicit confirmation required");
    return level;
  }
  private async ingestLocked(
    kind: "demand" | "supply",
    businessId: string,
    event: any,
    create: (tx: PrismaService, key: string) => Promise<unknown>,
  ) {
    return this.db.$transaction(async (tx: PrismaService) => {
      const key = `${kind}:${event.sourceEntityType}:${event.eventId}:${event.type}`;
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        `marketplace-signal:${businessId}:${key}`,
      );
      const store =
        kind === "demand"
          ? tx.marketplaceDemandSignal
          : tx.marketplaceSupplySignal;
      const existing = await store.findUnique({
        where: {
          businessId_idempotencyKey: { businessId, idempotencyKey: key },
        },
      });
      if (existing) {
        this.log("idempotent_replay", businessId, { kind });
        return { status: "DUPLICATE" };
      }
      await create(tx, key);
      this.log(`${kind}_signal_processed`, businessId, {
        source: event.source,
        type: event.type,
      });
      return { status: "RECORDED" };
    });
  }
  private validateSignal(event: any) {
    if (
      !event.eventId?.trim() ||
      !event.sourceEntityType?.trim() ||
      !event.sourceEntityId?.trim() ||
      !(event.observedAt instanceof Date) ||
      Number.isNaN(event.observedAt.getTime()) ||
      !Number.isFinite(event.value) ||
      event.value < 0 ||
      !Number.isFinite(event.confidence) ||
      event.confidence < 0 ||
      event.confidence > 1 ||
      !Number.isFinite(event.freshness) ||
      event.freshness < 0 ||
      event.freshness > 1 ||
      !event.evidence ||
      Array.isArray(event.evidence)
    )
      throw new BadRequestException("Malformed marketplace signal");
  }
  private async assertEvidenceScope(businessId: string, event: any) {
    if (
      event.sourceEntityType === "BUSINESS" &&
      event.sourceEntityId !== businessId
    )
      throw new BadRequestException("Cross-tenant marketplace evidence denied");
    if (event.sourceEntityType === "BOOKING") {
      const row = await this.db.appointment.findFirst({
        where: { id: event.sourceEntityId, businessId },
        select: { id: true },
      });
      if (!row)
        throw new BadRequestException(
          "Cross-tenant marketplace evidence denied",
        );
    }
    if (event.sourceEntityType === "SERVICE") {
      const row = await this.db.service.findFirst({
        where: { id: event.sourceEntityId, businessId },
        select: { id: true },
      });
      if (!row)
        throw new BadRequestException(
          "Cross-tenant marketplace evidence denied",
        );
    }
  }
  private async authorize(user: AuthenticatedUser, businessId: string) {
    if (user.role === "SUPER_ADMIN") return;
    const member = await this.db.businessMember.findUnique({
      where: { userId_businessId: { userId: user.id, businessId } },
      select: { role: true },
    });
    if (!member || member.role === "STAFF") {
      this.log("cross_tenant_rejection", businessId, {});
      throw new ForbiddenException("Marketplace intelligence access denied");
    }
  }
  private sumOrNull(values: number[]) {
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  }
  private days(window: LiquidityWindow) {
    return {
      DAILY: 1,
      WEEKLY: 7,
      ROLLING_7_DAYS: 7,
      ROLLING_30_DAYS: 30,
      ROLLING_90_DAYS: 90,
    }[window];
  }
  private snapshotProjection() {
    return {
      id: true,
      window: true,
      periodStart: true,
      periodEnd: true,
      health: true,
      dataState: true,
      components: true,
      confidence: true,
      observedAt: true,
      calculationVersion: true,
      version: true,
    };
  }
  private log(
    event: string,
    businessId: string,
    metadata: Record<string, unknown>,
  ) {
    this.logger.log({ event, businessId, ...metadata });
  }
}
