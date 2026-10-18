/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { sanitizeTelemetry } from "../infrastructure/sanitizer.js";
import { BeautyDNAIntelligenceService } from "./beauty-dna-intelligence.service.js";
import { BeautyDNARegistry } from "./beauty-dna-registry.service.js";
import type {
  BeautyDNACategory,
  BeautyDNASource,
  BeautyMatchContext,
} from "./beauty-dna.types.js";
import { EVIDENCE_SOURCES } from "./beauty-dna.types.js";
@Injectable()
export class BeautyDNAService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly intelligence: BeautyDNAIntelligenceService,
    private readonly registry: BeautyDNARegistry,
  ) {}
  async get(user: AuthenticatedUser, businessId: string, customerId: string) {
    await this.assertAccess(user, businessId, customerId);
    const profile = await this.db.beautyDNAProfile.findUnique({
      where: { businessId_customerId: { businessId, customerId } },
      select: this.publicProfileSelect(),
    });
    if (!profile) return { status: "INSUFFICIENT_EVIDENCE", profile: null };
    const now = new Date();
    return {
      status: profile.traits.length ? "AVAILABLE" : "INSUFFICIENT_EVIDENCE",
      profile: {
        ...profile,
        traits: profile.traits.filter(
          (x: { expiresAt: Date | null }) => !x.expiresAt || x.expiresAt > now,
        ),
      },
    };
  }
  async history(
    user: AuthenticatedUser,
    businessId: string,
    customerId: string,
    limit = 50,
  ) {
    await this.assertAccess(user, businessId, customerId);
    const profile = await this.db.beautyDNAProfile.findUnique({
      where: { businessId_customerId: { businessId, customerId } },
      select: { id: true },
    });
    if (!profile) return [];
    return this.db.beautyDNAVersion.findMany({
      where: { businessId, profileId: profile.id },
      select: {
        version: true,
        category: true,
        traitType: true,
        sourceType: true,
        oldValue: true,
        newValue: true,
        reason: true,
        evidenceCount: true,
        confidence: true,
        createdAt: true,
      },
      orderBy: { version: "desc" },
      take: Math.min(100, limit),
    });
  }
  async declare(
    user: AuthenticatedUser,
    businessId: string,
    customerId: string,
    category: string,
    traitType: string,
    value: string,
    key?: string,
  ) {
    this.registry.assertAllowed(category, traitType);
    await this.assertAccess(user, businessId, customerId, true);
    const normalized = this.intelligence.normalize(value);
    if (!normalized) throw new BadRequestException("Trait value is required");
    const idempotencyKey =
      key ??
      createHash("sha256")
        .update(`${user.id}:${category}:${traitType}:${normalized}`)
        .digest("hex");
    return this.applyEvidence({
      user,
      businessId,
      customerId,
      category,
      traitType,
      value,
      sourceType: "DECLARED",
      evidenceSource: "VERIFIED_PROFILE_INPUT",
      idempotencyKey,
      occurredAt: new Date(),
      reliability: 1,
      reason: "CUSTOMER_DECLARATION",
    });
  }
  async deactivate(
    user: AuthenticatedUser,
    businessId: string,
    customerId: string,
    category: string,
    traitType: string,
  ) {
    this.registry.assertAllowed(category, traitType);
    await this.assertAccess(user, businessId, customerId, true);
    const profile = await this.db.beautyDNAProfile.findUnique({
      where: { businessId_customerId: { businessId, customerId } },
      select: { id: true, version: true },
    });
    if (!profile) throw new NotFoundException("Beauty DNA profile not found");
    return this.db.$transaction(async (tx: PrismaService) => {
      await this.lock(tx, profile.id);
      const trait = await tx.beautyDNATrait.findFirst({
        where: {
          businessId,
          profileId: profile.id,
          category,
          traitType,
          sourceType: "DECLARED",
          status: "ACTIVE",
        },
      });
      if (!trait) throw new NotFoundException("Declared trait not found");
      const state = await tx.beautyDNAProfile.findUnique({
        where: { id: profile.id },
        select: { version: true },
      });
      const next = state.version + 1;
      await tx.beautyDNATrait.update({
        where: { id: trait.id },
        data: { status: "INACTIVE" },
      });
      await tx.beautyDNAProfile.update({
        where: { id: profile.id },
        data: { version: next },
      });
      await tx.beautyDNAVersion.create({
        data: {
          businessId,
          profileId: profile.id,
          version: next,
          category,
          traitType,
          sourceType: "DECLARED",
          oldValue: trait.value,
          newValue: null,
          reason: "CUSTOMER_REMOVAL",
          evidenceCount: trait.evidenceCount,
          confidence: trait.confidence,
        },
      });
      await this.event(tx, businessId, profile.id, "beauty_dna.trait_changed", {
        category,
        traitType,
        action: "DEACTIVATED",
      });
      return { status: "INACTIVE" };
    });
  }
  async recalculate(
    user: AuthenticatedUser,
    businessId: string,
    customerId: string,
    now = new Date(),
  ) {
    await this.assertAccess(user, businessId, customerId, true);
    const rows = (await this.db.appointment.findMany({
      where: {
        businessId,
        businessCustomerId: customerId,
        status: "COMPLETED",
        startsAt: { gte: new Date(now.getTime() - 730 * 86_400_000) },
      },
      select: { id: true, serviceId: true, startsAt: true },
      orderBy: { startsAt: "desc" },
      take: 200,
    })) as Array<{ id: string; serviceId: string; startsAt: Date }>;
    const counts = new Map<string, typeof rows>();
    for (const row of rows)
      counts.set(row.serviceId, [...(counts.get(row.serviceId) ?? []), row]);
    const winner = [...counts.entries()].sort(
      (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
    )[0];
    if (!winner || winner[1].length < 2)
      return { status: "INSUFFICIENT_EVIDENCE", profile: null };
    const result = await this.applyEvidence({
      user,
      businessId,
      customerId,
      category: "WELLNESS",
      traitType: "preferred_service",
      value: winner[0],
      sourceType: "DERIVED",
      evidenceSource: "BOOKING",
      idempotencyKey: `booking-preference:${winner[1]
        .map((x) => x.id)
        .sort()
        .join(":")}`,
      occurredAt: winner[1][0]!.startsAt,
      reliability: Math.min(1, winner[1].length / 4),
      reason: "INCREMENTAL_BOOKING_RECALCULATION",
    });
    return { status: "UPDATED", profile: result };
  }
  async applyPredictionInference(
    user: AuthenticatedUser,
    businessId: string,
    customerId: string,
    predictionId: string,
    category: string,
    traitType: string,
  ) {
    this.registry.assertAllowed(category, traitType);
    await this.assertAccess(user, businessId, customerId, true);
    const prediction = await this.db.prediction.findFirst({
      where: {
        id: predictionId,
        businessId,
        subjectId: customerId,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
      },
      select: {
        predictionType: true,
        predictedValue: true,
        confidence: true,
        generatedAt: true,
      },
    });
    if (!prediction) throw new NotFoundException("Prediction not found");
    const allowed = new Set([
      "NEXT_LIKELY_SERVICE",
      "PREFERRED_TIME_DAY",
      "PRICE_SENSITIVITY",
      "LIKELY_BEAUTY_GOAL_CATEGORY",
    ]);
    if (!allowed.has(prediction.predictionType))
      throw new BadRequestException("Prediction is not a Beauty DNA signal");
    return this.applyEvidence({
      user,
      businessId,
      customerId,
      category,
      traitType,
      value: JSON.stringify(prediction.predictedValue),
      sourceType: "INFERRED",
      evidenceSource: "PREDICTION",
      idempotencyKey: `prediction:${predictionId}:${category}:${traitType}`,
      occurredAt: prediction.generatedAt,
      reliability: Number(prediction.confidence),
      reason: "PREDICTION_INFERENCE_REVIEWED",
    });
  }
  async ingestVerifiedObservation(input: {
    user: AuthenticatedUser;
    businessId: string;
    customerId: string;
    category: string;
    traitType: string;
    value: string;
    evidenceSource: string;
    sourceReferenceId: string;
    occurredAt: Date;
    reliability: number;
  }) {
    const category = input.category;
    this.registry.assertAllowed(category, input.traitType);
    await this.assertAccess(
      input.user,
      input.businessId,
      input.customerId,
      true,
    );
    if (
      !(EVIDENCE_SOURCES as readonly string[]).includes(input.evidenceSource) ||
      input.evidenceSource === "PREDICTION"
    )
      throw new BadRequestException("Unsupported evidence source");
    return this.applyEvidence({
      ...input,
      category,
      sourceType: "OBSERVED",
      idempotencyKey: `${input.evidenceSource}:${input.sourceReferenceId}:${input.category}:${input.traitType}`,
      reliability: Math.max(0, Math.min(1, input.reliability)),
      reason: "VERIFIED_OBSERVATION",
    });
  }
  async getCustomerBeautyContext(
    user: AuthenticatedUser,
    businessId: string,
    customerId: string,
  ): Promise<{
    status: string;
    categories: string[];
    preferences: Array<{
      category: string;
      traitType: string;
      value: string;
      confidence: number;
      certainty: string;
    }>;
  }> {
    const result = await this.get(user, businessId, customerId);
    if (!result.profile)
      return { status: result.status, categories: [], preferences: [] };
    const traits = result.profile.traits
      .filter((x: { confidence: unknown }) => Number(x.confidence) >= 0.35)
      .slice(0, 12);
    return {
      status: result.status,
      categories: [
        ...new Set<string>(traits.map((x: { category: string }) => x.category)),
      ],
      preferences: traits.map(
        (x: {
          category: string;
          traitType: string;
          normalizedValue: string;
          confidence: unknown;
          sourceType: string;
        }) => ({
          category: x.category,
          traitType: x.traitType,
          value: x.normalizedValue,
          confidence: Number(x.confidence),
          certainty: x.sourceType === "INFERRED" ? "POSSIBLE" : "SUPPORTED",
        }),
      ),
    };
  }
  async getMatchContext(
    user: AuthenticatedUser,
    businessId: string,
    customerId: string,
  ): Promise<BeautyMatchContext> {
    const context = await this.getCustomerBeautyContext(
      user,
      businessId,
      customerId,
    );
    return {
      categories: context.categories,
      preferences: context.preferences.map((x) => ({
        category: x.category,
        traitType: x.traitType,
        value: x.value,
        confidence: x.confidence,
      })),
    };
  }
  private async applyEvidence(input: {
    user: AuthenticatedUser;
    businessId: string;
    customerId: string;
    category: BeautyDNACategory;
    traitType: string;
    value: string;
    sourceType: BeautyDNASource;
    evidenceSource: string;
    sourceReferenceId?: string;
    idempotencyKey: string;
    occurredAt: Date;
    reliability: number;
    reason: string;
  }) {
    const profile = await this.db.beautyDNAProfile.upsert({
      where: {
        businessId_customerId: {
          businessId: input.businessId,
          customerId: input.customerId,
        },
      },
      create: { businessId: input.businessId, customerId: input.customerId },
      update: {},
      select: { id: true },
    });
    return this.db.$transaction(async (tx: PrismaService) => {
      await this.lock(tx, profile.id);
      const duplicate = await tx.beautyDNAEvidence.findUnique({
        where: {
          businessId_idempotencyKey: {
            businessId: input.businessId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (duplicate)
        return this.publicProfile(tx, input.businessId, profile.id);
      const current = await tx.beautyDNATrait.findUnique({
        where: {
          profileId_category_traitType_sourceType: {
            profileId: profile.id,
            category: input.category,
            traitType: input.traitType,
            sourceType: input.sourceType,
          },
        },
      });
      const trait = await tx.beautyDNATrait.upsert({
        where: {
          profileId_category_traitType_sourceType: {
            profileId: profile.id,
            category: input.category,
            traitType: input.traitType,
            sourceType: input.sourceType,
          },
        },
        create: {
          businessId: input.businessId,
          profileId: profile.id,
          category: input.category,
          traitType: input.traitType,
          value: input.value,
          normalizedValue: this.intelligence.normalize(input.value),
          confidence: 0,
          sourceType: input.sourceType,
          firstObservedAt: input.occurredAt,
          lastObservedAt: input.occurredAt,
          strategyVersion:
            input.sourceType === "INFERRED"
              ? "prediction-adapter-v1"
              : "beauty-dna-rules-v1",
          calculatedAt: new Date(),
        },
        update: { status: "ACTIVE" },
      });
      await tx.beautyDNAEvidence.create({
        data: {
          businessId: input.businessId,
          traitId: trait.id,
          source: input.evidenceSource,
          sourceReferenceId: input.sourceReferenceId,
          idempotencyKey: input.idempotencyKey,
          observedValue: input.value,
          reliability: input.reliability,
          occurredAt: input.occurredAt,
        },
      });
      const evidence = await tx.beautyDNAEvidence.findMany({
        where: { businessId: input.businessId, traitId: trait.id },
        select: { observedValue: true, reliability: true, occurredAt: true },
        orderBy: { occurredAt: "desc" },
        take: 100,
      });
      const resolved = this.intelligence.resolve(
        evidence.map(
          (x: {
            observedValue: string;
            reliability: unknown;
            occurredAt: Date;
          }) => ({
            value: x.observedValue,
            reliability: Number(x.reliability),
            occurredAt: x.occurredAt,
          }),
        ),
      )!;
      const state = await tx.beautyDNAProfile.findUnique({
        where: { id: profile.id },
        select: { version: true },
      });
      const next = state.version + 1;
      await tx.beautyDNATrait.update({
        where: { id: trait.id },
        data: {
          value: resolved.value,
          normalizedValue: resolved.normalizedValue,
          confidence: resolved.confidence,
          evidenceCount: resolved.evidenceCount,
          lastObservedAt: input.occurredAt,
          expiresAt: new Date(input.occurredAt.getTime() + 730 * 86_400_000),
        },
      });
      const stats = await tx.beautyDNATrait.aggregate({
        where: {
          businessId: input.businessId,
          profileId: profile.id,
          status: "ACTIVE",
        },
        _avg: { confidence: true },
        _count: true,
      });
      await tx.beautyDNAProfile.update({
        where: { id: profile.id },
        data: {
          version: next,
          confidence: Number(stats._avg.confidence ?? resolved.confidence),
          completeness: Math.min(1, stats._count / 8),
          lastCalculatedAt: new Date(),
        },
      });
      await tx.beautyDNAVersion.create({
        data: {
          businessId: input.businessId,
          profileId: profile.id,
          version: next,
          category: input.category,
          traitType: input.traitType,
          sourceType: input.sourceType,
          oldValue: current?.value,
          newValue: resolved.value,
          reason: input.reason,
          evidenceCount: resolved.evidenceCount,
          confidence: resolved.confidence,
          strategyVersion: trait.strategyVersion,
        },
      });
      if (resolved.conflict)
        await this.event(
          tx,
          input.businessId,
          profile.id,
          "beauty_dna.conflict_detected",
          {
            category: input.category,
            traitType: input.traitType,
            evidenceCount: resolved.evidenceCount,
          },
        );
      await this.event(
        tx,
        input.businessId,
        profile.id,
        current ? "beauty_dna.trait_changed" : "beauty_dna.created",
        {
          category: input.category,
          traitType: input.traitType,
          sourceType: input.sourceType,
        },
      );
      return this.publicProfile(tx, input.businessId, profile.id);
    });
  }
  private publicProfile(db: PrismaService, businessId: string, id: string) {
    return db.beautyDNAProfile.findFirst({
      where: { id, businessId },
      select: this.publicProfileSelect(),
    });
  }
  private publicProfileSelect() {
    return {
      id: true,
      version: true,
      status: true,
      confidence: true,
      completeness: true,
      lastCalculatedAt: true,
      createdAt: true,
      updatedAt: true,
      traits: {
        where: { status: "ACTIVE" },
        select: {
          category: true,
          traitType: true,
          normalizedValue: true,
          confidence: true,
          sourceType: true,
          evidenceCount: true,
          firstObservedAt: true,
          lastObservedAt: true,
          expiresAt: true,
        },
        orderBy: [
          { category: "asc" },
          { traitType: "asc" },
          { sourceType: "asc" },
        ],
      },
    };
  }
  private lock(tx: PrismaService, profileId: string) {
    return tx.$queryRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      `beauty-dna:${profileId}`,
    );
  }
  private event(
    tx: PrismaService,
    businessId: string,
    profileId: string,
    type: string,
    payload: unknown,
  ) {
    return tx.beautyDNAEvent.create({
      data: {
        businessId,
        profileId,
        type,
        version: 1,
        payload: sanitizeTelemetry(payload),
      },
    });
  }
  private async assertAccess(
    user: AuthenticatedUser,
    businessId: string,
    customerId: string,
    write = false,
  ) {
    if (user.role === "SUPER_ADMIN") return;
    const [member, subject] = await Promise.all([
      this.db.businessMember.findUnique({
        where: { userId_businessId: { userId: user.id, businessId } },
        select: { role: true },
      }),
      this.db.businessCustomer.findFirst({
        where: { id: customerId, businessId, archivedAt: null },
        select: { userCustomer: { select: { userId: true } } },
      }),
    ]);
    if (!subject) throw new NotFoundException("Customer not found");
    const own = subject.userCustomer?.userId === user.id;
    if (!own && (!member || (write && member.role === "STAFF")))
      throw new ForbiddenException("Beauty DNA access denied");
  }
}
