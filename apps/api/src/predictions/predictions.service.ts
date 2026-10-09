/* eslint-disable @typescript-eslint/consistent-type-imports */
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
import { AbuseProtectionService } from "../infrastructure/abuse-protection.service.js";
import { sanitizeTelemetry } from "../infrastructure/sanitizer.js";
import { FeatureExtractionService } from "./feature-extraction.service.js";
import { PredictionConfidenceService } from "./confidence.service.js";
import { PredictionTypeRegistry } from "./prediction-registry.service.js";
import type {
  AppointmentSignal,
  PredictionFeatures,
  PredictionType,
} from "./prediction.types.js";
@Injectable()
export class PredictionsService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly features: FeatureExtractionService,
    private readonly confidence: PredictionConfidenceService,
    private readonly registry: PredictionTypeRegistry,
    private readonly abuse: AbuseProtectionService,
  ) {}
  async list(
    user: AuthenticatedUser,
    businessId: string,
    subjectId: string,
    limit = 20,
    cursor?: string,
  ) {
    await this.assertSubject(user, businessId, subjectId);
    await this.expire(businessId, subjectId);
    return this.db.prediction.findMany({
      where: {
        businessId,
        subjectId,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
      },
      select: this.publicSelect(),
      orderBy: [{ generatedAt: "desc" }, { id: "asc" }],
      take: Math.min(50, limit),
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
  }
  async get(
    user: AuthenticatedUser,
    businessId: string,
    subjectId: string,
    idOrType: string,
  ) {
    await this.assertSubject(user, businessId, subjectId);
    await this.expire(businessId, subjectId);
    const prediction = await this.db.prediction.findFirst({
      where: {
        businessId,
        subjectId,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
        OR: [{ id: idOrType }, { predictionType: idOrType }],
      },
      select: this.publicSelect(),
    });
    if (!prediction) throw new NotFoundException("Prediction not found");
    return prediction;
  }
  async refresh(
    user: AuthenticatedUser,
    businessId: string,
    subjectId: string,
    type: string,
    now = new Date(),
  ) {
    this.registry.assertAllowed(type);
    await this.assertSubject(user, businessId, subjectId);
    const rate = await this.abuse.consume(
      { scope: "PREDICTION_RECOMPUTE", limit: 5, windowMs: 3_600_000 },
      `${businessId}:${subjectId}:${type}`,
    );
    if (!rate.allowed)
      throw new BadRequestException("Prediction recompute rate exceeded");
    await this.event(businessId, null, "prediction.requested", {
      subjectId,
      type,
    });
    const appointments = await this.db.appointment.findMany({
      where: {
        businessId,
        businessCustomerId: subjectId,
        startsAt: { gte: new Date(now.getTime() - 730 * 86_400_000) },
      },
      select: {
        id: true,
        status: true,
        serviceId: true,
        staffId: true,
        startsAt: true,
        price: true,
      },
      orderBy: { startsAt: "asc" },
      take: 200,
    });
    const f = this.features.extract(
      (
        appointments as Array<
          Omit<AppointmentSignal, "price"> & { price: unknown }
        >
      ).map((x) => ({ ...x, price: Number(x.price) })),
      now,
    );
    const freshness =
        f.daysSinceLastService === null
          ? 0
          : Math.max(0, 1 - f.daysSinceLastService / 365),
      conflict = f.cancellationRate;
    const c = this.confidence.calculate(f, 1, freshness, conflict);
    if (!c.sufficient) {
      await this.event(businessId, null, "prediction.insufficient_evidence", {
        subjectId,
        type,
        completedCount: f.completedCount,
      });
      return { status: "INSUFFICIENT_EVIDENCE", prediction: null };
    }
    const value = this.value(type, f, now);
    if (value === null) {
      await this.event(businessId, null, "prediction.insufficient_evidence", {
        subjectId,
        type,
        reason: "MISSING_FEATURE",
      });
      return { status: "INSUFFICIENT_EVIDENCE", prediction: null };
    }
    const strategy = await this.db.predictionStrategyVersion.upsert({
      where: {
        businessId_name_version: {
          businessId,
          name: "deterministic-recurrence",
          version: "1.0.0",
        },
      },
      create: {
        businessId,
        name: "deterministic-recurrence",
        version: "1.0.0",
        configuration: { minimumCompletedAppointments: 2 },
      },
      update: { isActive: true },
    });
    const expiresAt = new Date(now.getTime() + 30 * 86_400_000);
    const previous = await this.db.prediction.findFirst({
      where: { businessId, subjectId, predictionType: type, status: "ACTIVE" },
      select: { id: true },
    });
    const prediction = await this.db.$transaction(async (tx: PrismaService) => {
      await tx.prediction.updateMany({
        where: {
          businessId,
          subjectId,
          predictionType: type,
          status: "ACTIVE",
        },
        data: { status: "SUPERSEDED" },
      });
      return tx.prediction.create({
        data: {
          businessId,
          subjectId,
          predictionType: type,
          predictedValue: value,
          confidence: c.confidence,
          confidenceBand: c.band,
          publicExplanation: this.explanation(type, f),
          evidenceSummary: {
            completedAppointments: f.completedCount,
            recurrenceDays: f.averageRebookingIntervalDays,
          },
          strategyVersionId: strategy.id,
          status: "ACTIVE",
          validFrom: now,
          expiresAt,
          refreshedFromId: previous?.id,
          signals: {
            create: [
              {
                source: "APPOINTMENT_HISTORY",
                featureName: "recurrence",
                featureValue: {
                  averageDays: f.averageRebookingIntervalDays,
                  count: f.completedCount,
                },
                occurredAt: now,
                freshness,
                reliability: 1,
              },
            ],
          },
          evidence: {
            create: [
              {
                kind: "RECURRENCE",
                summary: `${f.completedCount} completed appointments were evaluated`,
                weight: c.confidence,
              },
            ],
          },
        },
        select: this.publicSelect(),
      });
    });
    await this.event(
      businessId,
      prediction.id,
      previous ? "prediction.refreshed" : "prediction.generated",
      { subjectId, type, confidenceBand: c.band },
    );
    return { status: "PREDICTED", prediction };
  }
  async feedback(
    user: AuthenticatedUser,
    businessId: string,
    subjectId: string,
    predictionId: string,
    kind: string,
    metadata?: unknown,
  ) {
    await this.assertSubject(user, businessId, subjectId);
    const prediction = await this.db.prediction.findFirst({
      where: { id: predictionId, businessId, subjectId },
      select: { id: true },
    });
    if (!prediction) throw new NotFoundException("Prediction not found");
    const value = await this.db.predictionFeedback.upsert({
      where: {
        predictionId_actorId_kind: { predictionId, actorId: user.id, kind },
      },
      create: {
        businessId,
        predictionId,
        actorId: user.id,
        kind,
        metadata: sanitizeTelemetry(metadata),
      },
      update: { metadata: sanitizeTelemetry(metadata) },
    });
    await this.event(businessId, predictionId, "prediction.feedback_received", {
      kind,
    });
    return { id: value.id, kind: value.kind, createdAt: value.createdAt };
  }
  async outcome(
    user: AuthenticatedUser,
    businessId: string,
    subjectId: string,
    predictionId: string,
    outcome: string,
    actualValue: unknown,
    occurredAt: Date,
  ) {
    await this.assertManager(user, businessId);
    const prediction = await this.db.prediction.findFirst({
      where: { id: predictionId, businessId, subjectId },
      select: { id: true },
    });
    if (!prediction) throw new NotFoundException("Prediction not found");
    const value = await this.db.predictionOutcome.upsert({
      where: { predictionId },
      create: {
        businessId,
        predictionId,
        outcome,
        actualValue: sanitizeTelemetry(actualValue),
        occurredAt,
      },
      update: {
        outcome,
        actualValue: sanitizeTelemetry(actualValue),
        occurredAt,
      },
    });
    await this.event(businessId, predictionId, "prediction.outcome_recorded", {
      outcome,
    });
    return {
      id: value.id,
      outcome: value.outcome,
      occurredAt: value.occurredAt,
    };
  }
  async aggregate(user: AuthenticatedUser, businessId: string) {
    await this.assertManager(user, businessId);
    const [total, accepted, converted, expired] = await Promise.all([
      this.db.prediction.count({ where: { businessId } }),
      this.db.predictionFeedback.count({
        where: { businessId, kind: "ACCEPTED" },
      }),
      this.db.predictionFeedback.count({
        where: { businessId, kind: "CONVERTED" },
      }),
      this.db.prediction.count({ where: { businessId, status: "EXPIRED" } }),
    ]);
    return {
      total,
      accepted,
      converted,
      expired,
      acceptanceRate: total ? accepted / total : 0,
      conversionRate: total ? converted / total : 0,
      staleRate: total ? expired / total : 0,
    };
  }
  private value(
    type: PredictionType,
    f: PredictionFeatures,
    now: Date,
  ): Record<string, unknown> | null {
    const next =
      f.averageRebookingIntervalDays && f.daysSinceLastService !== null
        ? new Date(
            now.getTime() +
              Math.max(
                0,
                f.averageRebookingIntervalDays - f.daysSinceLastService,
              ) *
                86_400_000,
          )
        : null;
    if (type === "NEXT_LIKELY_SERVICE")
      return f.serviceAffinity
        ? {
            serviceId: f.serviceAffinity.id,
            likelihood: f.serviceAffinity.ratio,
          }
        : null;
    if (
      [
        "NEXT_LIKELY_BOOKING_WINDOW",
        "MAINTENANCE_REFRESH_NEED",
        "HAIR_COLOR_REFRESH_WINDOW",
        "HAIRCUT_REFRESH_WINDOW",
        "EXTENSION_MAINTENANCE_REMOVAL",
        "NAIL_MAINTENANCE_WINDOW",
        "SKINCARE_RECURRENCE",
      ].includes(type)
    )
      return next
        ? {
            windowStart: next.toISOString(),
            windowEnd: new Date(next.getTime() + 14 * 86_400_000).toISOString(),
          }
        : null;
    if (type === "REBOOKING_LIKELIHOOD")
      return { likelihood: Math.max(0, Math.min(1, 1 - f.cancellationRate)) };
    if (type === "CHURN_INACTIVITY_RISK")
      return {
        risk: f.averageRebookingIntervalDays
          ? Math.min(
              1,
              (f.daysSinceLastService ?? 0) /
                (f.averageRebookingIntervalDays * 2),
            )
          : 0,
      };
    if (type === "PREFERRED_PROFESSIONAL")
      return f.professionalAffinity
        ? {
            professionalId: f.professionalAffinity.id,
            likelihood: f.professionalAffinity.ratio,
          }
        : null;
    if (type === "PREFERRED_BUSINESS") return { businessScoped: true };
    if (type === "PREFERRED_TIME_DAY")
      return f.preferredWeekday === null
        ? null
        : { weekday: f.preferredWeekday, hour: f.preferredHour };
    if (type === "PRICE_SENSITIVITY")
      return f.averagePrice === null
        ? null
        : { historicalAverage: f.averagePrice };
    if (type === "DEMAND_TIMING")
      return f.preferredWeekday === null
        ? null
        : { weekday: f.preferredWeekday, hour: f.preferredHour };
    return null;
  }
  private explanation(type: PredictionType, f: PredictionFeatures) {
    return type === "NEXT_LIKELY_SERVICE"
      ? "Geçmiş tamamlanmış randevularınıza göre bu hizmet yeniden tercih edilebilir."
      : `Son ${f.completedCount} tamamlanmış randevunun zaman aralıklarına göre bu ihtiyaç yaklaşıyor olabilir.`;
  }
  private publicSelect() {
    return {
      id: true,
      predictionType: true,
      predictedValue: true,
      confidence: true,
      confidenceBand: true,
      publicExplanation: true,
      status: true,
      validFrom: true,
      generatedAt: true,
      expiresAt: true,
    };
  }
  private async expire(businessId: string, subjectId: string) {
    const result = await this.db.prediction.updateMany({
      where: {
        businessId,
        subjectId,
        status: "ACTIVE",
        expiresAt: { lte: new Date() },
      },
      data: { status: "EXPIRED" },
    });
    if (result.count)
      await this.event(businessId, null, "prediction.expired", {
        count: result.count,
      });
  }
  private event(
    businessId: string,
    predictionId: string | null,
    type: string,
    payload: unknown,
  ) {
    return this.db.predictionEvent.create({
      data: {
        businessId,
        predictionId,
        type,
        version: 1,
        payload: sanitizeTelemetry(payload),
      },
    });
  }
  private async assertSubject(
    user: AuthenticatedUser,
    businessId: string,
    subjectId: string,
  ) {
    if (user.role === "SUPER_ADMIN") return;
    const [member, subject] = await Promise.all([
      this.db.businessMember.findUnique({
        where: { userId_businessId: { userId: user.id, businessId } },
        select: { id: true, role: true },
      }),
      this.db.businessCustomer.findFirst({
        where: { id: subjectId, businessId, archivedAt: null },
        select: { id: true, userCustomer: { select: { userId: true } } },
      }),
    ]);
    if (!subject) throw new NotFoundException("Customer not found");
    if (!member && subject.userCustomer?.userId !== user.id)
      throw new ForbiddenException("Prediction access denied");
  }
  private async assertManager(user: AuthenticatedUser, businessId: string) {
    if (user.role === "SUPER_ADMIN") return;
    const member = await this.db.businessMember.findUnique({
      where: { userId_businessId: { userId: user.id, businessId } },
      select: { role: true },
    });
    if (!member || member.role === "STAFF")
      throw new ForbiddenException("Prediction management denied");
  }
}
