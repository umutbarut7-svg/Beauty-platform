/* eslint-disable @typescript-eslint/consistent-type-imports, @typescript-eslint/no-explicit-any */
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { BusinessIntelligenceEngine } from "./business-intelligence.engine.js";
import type {
  MetricCategory,
  MetricPoint,
  TimeWindow,
} from "./business-intelligence.types.js";
import { METRIC_CATEGORIES } from "./business-intelligence.types.js";
@Injectable()
export class BusinessIntelligenceService {
  private readonly calculationVersion = "business-rules-v1";
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly engine: BusinessIntelligenceEngine,
  ) {}
  async overview(u: AuthenticatedUser, b: string) {
    await this.authorize(u, b);
    const p = await this.db.businessIntelligenceProfile.findUnique({
      where: { businessId: b },
      select: { version: true, updatedAt: true },
    });
    if (!p) return { status: "INSUFFICIENT_DATA", profile: null };
    const [metrics, insights, opportunities, risks, recommendations] =
      await Promise.all([
        this.metrics(u, b),
        this.insights(u, b),
        this.opportunities(u, b),
        this.risks(u, b),
        this.recommendations(u, b),
      ]);
    return {
      status: "AVAILABLE",
      profile: p,
      metrics,
      insights,
      opportunities,
      risks,
      recommendations,
    };
  }
  async metrics(u: AuthenticatedUser, b: string) {
    await this.authorize(u, b);
    return this.db.businessMetricSnapshot.findMany({
      where: { businessId: b },
      select: {
        definition: { select: { metricKey: true, category: true, unit: true } },
        window: true,
        periodStart: true,
        periodEnd: true,
        value: true,
        sampleSize: true,
        dataState: true,
        confidence: true,
        calculationVersion: true,
      },
      orderBy: { periodEnd: "desc" },
      take: 100,
    });
  }
  async insights(u: AuthenticatedUser, b: string) {
    await this.authorize(u, b);
    return this.db.businessInsight.findMany({
      where: { businessId: b },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }
  async opportunities(u: AuthenticatedUser, b: string) {
    await this.authorize(u, b);
    return this.db.businessOpportunity.findMany({
      where: { businessId: b },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }
  async risks(u: AuthenticatedUser, b: string) {
    await this.authorize(u, b);
    return this.db.businessRiskSignal.findMany({
      where: { businessId: b },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }
  async recommendations(u: AuthenticatedUser, b: string) {
    await this.authorize(u, b);
    return this.db.businessGrowthRecommendation.findMany({
      where: { businessId: b, status: "PROPOSED" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }
  async recalculate(
    u: AuthenticatedUser,
    b: string,
    window: TimeWindow,
    now = new Date(),
  ) {
    await this.authorize(u, b);
    const days = this.days(window),
      start = new Date(now.getTime() - days * 86_400_000),
      previousStart = new Date(start.getTime() - days * 86_400_000);
    const rows = await this.db.appointment.findMany({
      where: { businessId: b, startsAt: { gte: previousStart, lt: now } },
      select: {
        id: true,
        status: true,
        price: true,
        businessCustomerId: true,
        startsAt: true,
      },
      take: 10000,
    });
    const current = rows.filter((x: any) => x.startsAt >= start),
      previous = rows.filter((x: any) => x.startsAt < start);
    const points = this.points(current, previous);
    const analysis = this.engine.analyze(points);
    return this.db.$transaction(async (tx: PrismaService) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        `business-intelligence:${b}`,
      );
      const profile = await tx.businessIntelligenceProfile.upsert({
        where: { businessId: b },
        create: { businessId: b },
        update: {},
      });
      for (const point of points) {
        const d = await tx.businessMetricDefinition.upsert({
          where: {
            businessId_metricKey: { businessId: b, metricKey: point.category },
          },
          create: {
            businessId: b,
            metricKey: point.category,
            category: point.category,
            unit: this.unit(point.category),
            calculationVersion: this.calculationVersion,
          },
          update: { isActive: true },
        });
        await tx.businessMetricSnapshot.upsert({
          where: {
            businessId_definitionId_window_periodStart_calculationVersion: {
              businessId: b,
              definitionId: d.id,
              window,
              periodStart: start,
              calculationVersion: this.calculationVersion,
            },
          },
          create: {
            businessId: b,
            definitionId: d.id,
            window,
            periodStart: start,
            periodEnd: now,
            value: point.value,
            sampleSize: point.sampleSize,
            dataState: point.value === null ? "INSUFFICIENT_DATA" : "AVAILABLE",
            confidence: this.engine.confidence(
              point.sampleSize,
              rows.length ? 1 : 0,
              1,
              1,
              1,
            ),
            calculationVersion: this.calculationVersion,
          },
          update: {},
        });
      }
      await tx.businessInsight.createMany({
        data: analysis.insights.map((x: any) => ({
          businessId: b,
          insightType: x.type,
          source: "DERIVED",
          evidence: x.evidence,
          confidence: x.confidence,
          explanation: this.explain(x.type),
          observedAt: now,
          calculationVersion: this.calculationVersion,
        })),
      });
      await tx.businessOpportunity.createMany({
        data: analysis.opportunities.map((x: any) => ({
          businessId: b,
          opportunityType: x.type,
          source: "DERIVED",
          observedAt: now,
          calculationVersion: this.calculationVersion,
          evidence: x.evidence,
          confidence: x.confidence,
          estimatedImpactRange: { min: null, max: null },
          constraints: ["Estimate unavailable without experiment"],
        })),
      });
      await tx.businessRiskSignal.createMany({
        data: analysis.risks.map((x: any) => ({
          businessId: b,
          riskType: x.type,
          source: "DERIVED",
          calculationVersion: this.calculationVersion,
          evidence: x.evidence,
          confidence: x.confidence,
          severity: x.confidence > 0.7 ? "HIGH" : "MEDIUM",
          observedAt: now,
        })),
      });
      await tx.businessGrowthRecommendation.createMany({
        data: analysis.recommendations.map((x: any) => ({
          businessId: b,
          recommendationType: x.type,
          source: "DERIVED",
          observedAt: now,
          calculationVersion: this.calculationVersion,
          evidence: x.evidence,
          confidence: x.confidence,
          impactRange: x.estimatedImpactRange,
          constraints: x.constraints,
          actionClass: x.actionClass,
        })),
      });
      const version = profile.version + 1;
      await tx.businessIntelligenceProfile.update({
        where: { id: profile.id },
        data: { version },
      });
      await tx.businessIntelligenceVersion.create({
        data: {
          businessId: b,
          version,
          calculationVersion: this.calculationVersion,
          summary: {
            window,
            metrics: points.length,
            insights: analysis.insights.length,
            opportunities: analysis.opportunities.length,
            risks: analysis.risks.length,
          },
        },
      });
      return {
        status: rows.length ? "UPDATED" : "INSUFFICIENT_DATA",
        version,
        points,
        analysis,
      };
    });
  }
  async ingest(
    u: AuthenticatedUser,
    b: string,
    event: {
      eventId: string;
      metric: MetricCategory;
      value: number;
      sourceEntityType: string;
      sourceEntityId: string;
      observedAt: Date;
      source: "OBSERVED" | "DERIVED";
    },
  ) {
    await this.authorize(u, b);
    if (!METRIC_CATEGORIES.includes(event.metric))
      throw new BadRequestException("Invalid metric category");
    if (
      !event.eventId?.trim() ||
      !event.sourceEntityId?.trim() ||
      !["BOOKING", "SEARCH_DEMAND", "RESULT"].includes(
        event.sourceEntityType,
      ) ||
      !Number.isFinite(event.value) ||
      !(event.observedAt instanceof Date) ||
      Number.isNaN(event.observedAt.getTime())
    )
      throw new BadRequestException("Malformed intelligence event");
    if (event.sourceEntityType === "BOOKING") {
      const appointment = await this.db.appointment.findFirst({
        where: { id: event.sourceEntityId, businessId: b },
        select: { id: true },
      });
      if (!appointment)
        throw new BadRequestException(
          "Booking evidence does not belong to tenant",
        );
    }
    return this.db.$transaction(async (tx: PrismaService) => {
      const key = `${event.sourceEntityType}:${event.eventId}:${event.metric}`;
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        `business-intelligence-observation:${b}:${key}`,
      );
      const old = await tx.businessMetricObservation.findUnique({
        where: {
          businessId_idempotencyKey: { businessId: b, idempotencyKey: key },
        },
      });
      if (old) return { status: "DUPLICATE" };
      const d = await tx.businessMetricDefinition.upsert({
        where: {
          businessId_metricKey: { businessId: b, metricKey: event.metric },
        },
        create: {
          businessId: b,
          metricKey: event.metric,
          category: event.metric,
          unit: this.unit(event.metric),
          calculationVersion: this.calculationVersion,
        },
        update: {},
      });
      await tx.businessMetricObservation.create({
        data: {
          businessId: b,
          definitionId: d.id,
          source: event.source,
          sourceEntityType: event.sourceEntityType,
          sourceEntityId: event.sourceEntityId,
          idempotencyKey: key,
          value: event.value,
          observedAt: event.observedAt,
        },
      });
      return { status: "RECORDED" };
    });
  }
  async createExperiment(u: AuthenticatedUser, b: string, d: any) {
    await this.authorize(u, b);
    return this.db.businessGrowthExperiment.create({
      data: { businessId: b, ...d, status: "DRAFT", createdBy: u.id },
    });
  }
  async transitionExperiment(
    u: AuthenticatedUser,
    b: string,
    id: string,
    next: string,
  ) {
    await this.authorize(u, b);
    const e = await this.db.businessGrowthExperiment.findFirst({
      where: { id, businessId: b },
    });
    if (!e) throw new NotFoundException("Experiment not found");
    const allowed: any = {
      DRAFT: ["APPROVED", "CANCELLED"],
      APPROVED: ["RUNNING", "CANCELLED"],
      RUNNING: ["COMPLETED", "CANCELLED"],
      COMPLETED: [],
      CANCELLED: [],
    };
    if (!allowed[e.status].includes(next))
      throw new BadRequestException("Invalid experiment transition");
    return this.db.businessGrowthExperiment.update({
      where: { id },
      data: {
        status: next,
        approvedBy: next === "APPROVED" ? u.id : e.approvedBy,
        startedAt: next === "RUNNING" ? new Date() : e.startedAt,
        endedAt: ["COMPLETED", "CANCELLED"].includes(next)
          ? new Date()
          : e.endedAt,
      },
    });
  }
  async result(
    u: AuthenticatedUser,
    b: string,
    id: string,
    baseline: number | null,
    current: number | null,
    sample: number,
  ) {
    await this.authorize(u, b);
    const e = await this.db.businessGrowthExperiment.findFirst({
      where: { id, businessId: b, status: "COMPLETED" },
      include: { result: true },
    });
    if (!e) throw new NotFoundException("Completed experiment not found");
    if (e.result)
      throw new BadRequestException("Experiment result is immutable");
    const outcome = this.engine.experiment(
      baseline,
      current,
      sample,
      e.expectedDirection,
    );
    return this.db.businessGrowthExperimentResult.create({
      data: {
        experimentId: id,
        outcome,
        baselineValue: baseline,
        experimentValue: current,
        sampleSize: sample,
        explanation: "Observed association only; causality is not asserted.",
      },
    });
  }
  async experiments(u: AuthenticatedUser, b: string) {
    await this.authorize(u, b);
    return this.db.businessGrowthExperiment.findMany({
      where: { businessId: b },
      include: { result: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }
  async benchmark(u: AuthenticatedUser, b: string, metric: MetricCategory) {
    await this.authorize(u, b);
    if (!METRIC_CATEGORIES.includes(metric))
      throw new BadRequestException("Invalid metric category");
    const row = await this.db.businessBenchmark.findFirst({
      where: { businessId: b, metricKey: metric },
      orderBy: { createdAt: "desc" },
    });
    return row && row.cohortSize >= row.privacyThreshold
      ? {
          status: "AVAILABLE",
          metric,
          value: row.aggregateValue,
          cohortSize: row.cohortSize,
        }
      : { status: "INSUFFICIENT_BENCHMARK_DATA", metric, value: null };
  }
  async versions(u: AuthenticatedUser, b: string) {
    await this.authorize(u, b);
    return this.db.businessIntelligenceVersion.findMany({
      where: { businessId: b },
      orderBy: { version: "desc" },
      take: 100,
    });
  }
  assertAction(action: any, confirmed = false) {
    const c = this.engine.actionClass(action);
    if (c === "PROHIBITED_AUTONOMOUS")
      throw new ForbiddenException("Autonomous action prohibited");
    if (c === "REQUIRES_CONFIRMATION" && !confirmed)
      throw new ForbiddenException("Explicit confirmation required");
    return c;
  }
  private points(c: any[], p: any[]): MetricPoint[] {
    const hasCoverage = c.length > 0 || p.length > 0;
    const metric = (
      category: MetricCategory,
      fn: (x: any[]) => number | null,
    ): MetricPoint => ({
      category,
      value: fn(c),
      previousValue: fn(p),
      sampleSize: c.length,
      source: "OBSERVED",
    });
    return [
      metric("BOOKINGS", (x) => (hasCoverage ? x.length : null)),
      metric("COMPLETED_JOBS", (x) =>
        hasCoverage ? x.filter((y) => y.status === "COMPLETED").length : null,
      ),
      metric("CANCELLATIONS", (x) =>
        x.length
          ? x.filter((y) => y.status === "CANCELLED").length / x.length
          : null,
      ),
      metric("NO_SHOWS", (x) =>
        x.length
          ? x.filter((y) => y.status === "NO_SHOW").length / x.length
          : null,
      ),
      metric("REVENUE", (x) =>
        hasCoverage
          ? x
              .filter((y) => y.status === "COMPLETED")
              .reduce((a, y) => a + Number(y.price), 0)
          : null,
      ),
      metric("AVERAGE_TICKET", (x) => {
        const z = x.filter((y) => y.status === "COMPLETED");
        return z.length
          ? z.reduce((a, y) => a + Number(y.price), 0) / z.length
          : null;
      }),
      metric("REPEAT_CUSTOMERS", (x) => {
        if (!x.length) return null;
        const m = new Map<string, number>();
        x.forEach((y) =>
          m.set(y.businessCustomerId, (m.get(y.businessCustomerId) ?? 0) + 1),
        );
        return [...m.values()].filter((n) => n > 1).length / m.size;
      }),
    ];
  }
  private days(w: TimeWindow) {
    return {
      DAILY: 1,
      WEEKLY: 7,
      MONTHLY: 30,
      QUARTERLY: 90,
      ROLLING_7_DAYS: 7,
      ROLLING_30_DAYS: 30,
      ROLLING_90_DAYS: 90,
    }[w];
  }
  private unit(c: MetricCategory) {
    return c === "REVENUE" || c === "AVERAGE_TICKET"
      ? "CURRENCY"
      : c.includes("RATE") ||
          [
            "CANCELLATIONS",
            "NO_SHOWS",
            "UTILIZATION",
            "CUSTOMER_RETENTION",
            "CONVERSION",
          ].includes(c)
        ? "RATIO"
        : "COUNT";
  }
  private explain(t: string) {
    return `${t} was detected from tenant-scoped period metrics; this is an association, not proof of causation.`;
  }
  private async authorize(u: AuthenticatedUser, b: string) {
    if (u.role === "SUPER_ADMIN") return;
    const m = await this.db.businessMember.findUnique({
      where: { userId_businessId: { userId: u.id, businessId: b } },
      select: { role: true },
    });
    if (!m || m.role === "STAFF")
      throw new ForbiddenException("Business intelligence access denied");
  }
}
