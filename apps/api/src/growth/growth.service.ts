/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionsService } from "../auth/permissions.service.js";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import { GlobalizationEngine } from "../globalization/globalization-engine.service.js";
import { AbuseProtectionService } from "../infrastructure/abuse-protection.service.js";
import { AuditService } from "../infrastructure/audit.service.js";
import { GrowthEngine } from "./growth-engine.service.js";
import type { ReferralState } from "./growth.types.js";

@Injectable()
export class GrowthService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly audit: AuditService,
    private readonly abuse: AbuseProtectionService,
    private readonly engine: GrowthEngine,
    private readonly globalization: GlobalizationEngine,
  ) {}
  private async marketId(businessId: string) {
    const profile = await this.db.tenantGlobalizationProfile.findUnique({
      where: { businessId },
      select: { marketId: true },
    });
    if (!profile)
      throw new NotFoundException("Tenant market is not configured");
    return profile.marketId as string;
  }
  async createProgram(
    user: AuthenticatedUser,
    businessId: string,
    input: {
      key: string;
      name: string;
      categoryId?: string;
      qualificationRules: unknown;
      rewardRules: unknown;
      startsAt?: Date;
      endsAt?: Date;
    },
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "growth:manage",
    );
    const marketId = await this.marketId(businessId);
    if (input.endsAt && input.startsAt && input.endsAt <= input.startsAt)
      throw new BadRequestException("Program end must follow start");
    const result = await this.db.$transaction(async (tx: PrismaService) => {
      const program = await tx.referralProgram.create({
        data: {
          businessId,
          marketId,
          key: input.key,
          categoryId: input.categoryId,
          status:
            input.startsAt && input.startsAt > new Date()
              ? "SCHEDULED"
              : "ACTIVE",
        },
      });
      const version = await tx.referralProgramVersion.create({
        data: {
          programId: program.id,
          version: 1,
          name: input.name,
          qualificationRules: input.qualificationRules,
          rewardRules: input.rewardRules,
          effectiveFrom: input.startsAt ?? new Date(),
          effectiveTo: input.endsAt,
        },
      });
      return { ...program, version };
    });
    await this.audit.record({
      businessId,
      actorId: user.id,
      actorType: user.role,
      action: "growth.program_created",
      resourceType: "ReferralProgram",
      resourceId: result.id,
      result: "SUCCEEDED",
      metadata: { marketId, version: 1 },
    });
    return result;
  }
  async programs(user: AuthenticatedUser, businessId: string) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "growth:read",
    );
    return this.db.referralProgram.findMany({
      where: { businessId },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
    });
  }
  async generateCode(
    user: AuthenticatedUser,
    businessId: string,
    input: {
      programId: string;
      ownerType: string;
      ownerId: string;
      usageLimit?: number;
      expiresAt?: Date;
    },
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "growth:manage",
    );
    const program = await this.db.referralProgram.findFirst({
      where: {
        id: input.programId,
        businessId,
        status: { in: ["ACTIVE", "SCHEDULED"] },
      },
    });
    if (!program) throw new NotFoundException("Referral program not found");
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = this.engine.normalizeCode(randomBytes(6).toString("hex"));
      try {
        return await this.db.referralCode.create({
          data: {
            businessId,
            marketId: program.marketId,
            programId: program.id,
            code,
            ownerType: input.ownerType,
            ownerId: input.ownerId,
            usageLimit: input.usageLimit,
            expiresAt: input.expiresAt,
            linkPath: this.engine.referralPath(code),
          },
        });
      } catch (error) {
        if (attempt === 4) throw error;
      }
    }
    throw new ConflictException("Unable to allocate referral code");
  }
  async resolveCode(rawCode: string, rateKey: string, now = new Date()) {
    const limit = await this.abuse.consume(
      { scope: "GROWTH_CODE", limit: 30, windowMs: 60_000 },
      rateKey,
      now,
    );
    if (!limit.allowed) throw new NotFoundException("Referral unavailable");
    let code: string;
    try {
      code = this.engine.normalizeCode(rawCode);
    } catch {
      throw new NotFoundException("Referral unavailable");
    }
    const found = await this.db.referralCode.findUnique({
      where: { code },
      include: { program: { select: { status: true } } },
    });
    if (
      !found ||
      found.revokedAt ||
      (found.expiresAt && found.expiresAt <= now) ||
      found.program.status !== "ACTIVE" ||
      (found.usageLimit !== null && found.usageCount >= found.usageLimit)
    )
      throw new NotFoundException("Referral unavailable");
    return {
      code: found.code,
      path: this.engine.assertSafeRedirect(found.linkPath),
      marketId: found.marketId,
    };
  }
  async createReferral(
    user: AuthenticatedUser,
    businessId: string,
    input: {
      code: string;
      referredType: string;
      referredId: string;
      idempotencyKey: string;
      anonymousId?: string;
    },
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "growth:manage",
    );
    const code = await this.db.referralCode.findFirst({
      where: { code: this.engine.normalizeCode(input.code), businessId },
      include: {
        program: {
          include: { versions: { orderBy: { version: "desc" }, take: 1 } },
        },
      },
    });
    if (!code || code.revokedAt || !code.program.versions[0])
      throw new NotFoundException("Referral unavailable");
    const risk = this.engine.assessRisk({
      ownerId: code.ownerId,
      referredId: input.referredId,
      existingUser: false,
      codeUses: code.usageCount,
      usageLimit: code.usageLimit ?? undefined,
      conversionsLastHour: 0,
      cyclic: false,
    });
    if (risk.decision === "BLOCK")
      throw new ConflictException("Referral is not eligible");
    return this.db.$transaction(async (tx: PrismaService) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        `referral:${businessId}:${input.idempotencyKey}`,
      );
      const prior = await tx.referral.findUnique({
        where: {
          businessId_idempotencyKey: {
            businessId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (prior) return prior;
      const referral = await tx.referral.create({
        data: {
          businessId,
          marketId: code.marketId,
          programId: code.programId,
          programVersionId: code.program.versions[0].id,
          referralCodeId: code.id,
          referrerType: code.ownerType,
          referrerId: code.ownerId,
          referredType: input.referredType,
          referredId: input.referredId,
          anonymousId: input.anonymousId,
          state: risk.decision === "REVIEW" ? "FRAUD_REVIEW" : "CREATED",
          ruleSnapshot: {
            qualification: code.program.versions[0].qualificationRules,
            reward: code.program.versions[0].rewardRules,
          },
          idempotencyKey: input.idempotencyKey,
        },
      });
      await tx.referralCode.update({
        where: { id: code.id },
        data: { usageCount: { increment: 1 } },
      });
      await tx.growthRiskAssessment.create({
        data: {
          businessId,
          referralId: referral.id,
          decision: risk.decision,
          reasonCodes: risk.reasons,
        },
      });
      return referral;
    });
  }
  async transition(
    user: AuthenticatedUser,
    businessId: string,
    referralId: string,
    next: ReferralState,
    reason: string,
    idempotencyKey: string,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "growth:manage",
    );
    const updated = await this.db.$transaction(async (tx: PrismaService) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        `referral-transition:${businessId}:${referralId}`,
      );
      const existing = await tx.referralTransition.findUnique({
        where: { businessId_idempotencyKey: { businessId, idempotencyKey } },
      });
      if (existing)
        return tx.referral.findFirst({ where: { id: referralId, businessId } });
      const referral = await tx.referral.findFirst({
        where: { id: referralId, businessId },
      });
      if (!referral) throw new NotFoundException("Referral not found");
      this.engine.transition(referral.state as ReferralState, next);
      await tx.referralTransition.create({
        data: {
          businessId,
          referralId,
          fromState: referral.state,
          toState: next,
          reason,
          actorId: user.id,
          idempotencyKey,
        },
      });
      await tx.growthEvent.create({
        data: {
          eventId: idempotencyKey,
          businessId,
          marketId: referral.marketId,
          type: `Referral${next}`,
          subjectId: referral.referredId,
          actorId: user.id,
          correlationId: idempotencyKey,
          payload: { referralId },
        },
      });
      return tx.referral.update({
        where: { id: referral.id },
        data: { state: next },
      });
    });
    return updated;
  }
  async grantReward(
    user: AuthenticatedUser,
    businessId: string,
    referralId: string,
    input: {
      beneficiaryType: string;
      beneficiaryId: string;
      ruleKey: string;
      amountMinor: bigint;
      currency: string;
      idempotencyKey: string;
      expiresAt?: Date;
    },
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "growth:manage",
    );
    if (input.amountMinor <= 0n)
      throw new BadRequestException("Reward amount must be positive");
    const currency = this.globalization.validateCurrency(input.currency);
    const result = await this.db.$transaction(async (tx: PrismaService) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        `growth-reward:${businessId}:${referralId}:${input.ruleKey}:${input.beneficiaryId}`,
      );
      const existing = await tx.growthReward.findUnique({
        where: {
          businessId_idempotencyKey: {
            businessId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing) return existing;
      const referral = await tx.referral.findFirst({
        where: {
          id: referralId,
          businessId,
          state: { in: ["QUALIFIED", "CONVERTED", "REWARDED"] },
        },
      });
      if (!referral)
        throw new ConflictException("Referral is not reward eligible");
      const credit = await tx.financialCreditGrant.create({
        data: {
          businessId,
          userId: input.beneficiaryType === "USER" ? input.beneficiaryId : null,
          amountMinor: input.amountMinor,
          currency,
          sourceType: "GROWTH_REFERRAL",
          sourceId: referralId,
          expiresAt: input.expiresAt,
          idempotencyKey: `growth:${input.idempotencyKey}`,
        },
      });
      const ledger = await tx.financialLedgerEntry.create({
        data: {
          businessId,
          type: "CREDIT",
          amountMinor: input.amountMinor,
          currency,
          revenueStream: "REFERRAL_REWARD",
          sourceType: "GROWTH_REFERRAL",
          sourceId: referralId,
          idempotencyKey: `growth-ledger:${input.idempotencyKey}`,
          reason: "Referral reward",
          actorId: user.id,
          correlationId: input.idempotencyKey,
        },
      });
      const reward = await tx.growthReward.create({
        data: {
          businessId,
          referralId,
          beneficiaryType: input.beneficiaryType,
          beneficiaryId: input.beneficiaryId,
          ruleKey: input.ruleKey,
          type: "CREDIT",
          status: "GRANTED",
          amountMinor: input.amountMinor,
          currency,
          creditGrantId: credit.id,
          ledgerEntryId: ledger.id,
          idempotencyKey: input.idempotencyKey,
          grantedAt: new Date(),
          expiresAt: input.expiresAt,
        },
      });
      if (referral.state !== "REWARDED")
        await tx.referral.update({
          where: { id: referral.id },
          data: { state: "REWARDED" },
        });
      return reward;
    });
    await this.audit.record({
      businessId,
      actorId: user.id,
      actorType: user.role,
      action: "growth.reward_granted",
      resourceType: "GrowthReward",
      resourceId: result.id,
      correlationId: input.idempotencyKey,
      result: "SUCCEEDED",
      metadata: {
        referralId,
        currency,
        amountMinor: input.amountMinor.toString(),
      },
    });
    return result;
  }
  async reverseReward(
    user: AuthenticatedUser,
    businessId: string,
    rewardId: string,
    reason: string,
    idempotencyKey: string,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "growth:manage",
    );
    const result = await this.db.$transaction(async (tx: PrismaService) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        `growth-reversal:${businessId}:${rewardId}`,
      );
      const replay = await tx.financialLedgerEntry.findUnique({
        where: {
          businessId_idempotencyKey: {
            businessId,
            idempotencyKey: `growth-reversal:${idempotencyKey}`,
          },
        },
      });
      const reward = await tx.growthReward.findFirst({
        where: { id: rewardId, businessId },
      });
      if (!reward) throw new NotFoundException("Reward not found");
      if (replay) return reward;
      if (
        reward.status !== "GRANTED" ||
        !reward.ledgerEntryId ||
        reward.amountMinor === null ||
        !reward.currency
      )
        throw new ConflictException("Reward cannot be reversed");
      const original = await tx.financialLedgerEntry.findFirst({
        where: { id: reward.ledgerEntryId, businessId },
      });
      if (!original)
        throw new ConflictException("Reward ledger entry is unavailable");
      await tx.financialLedgerEntry.create({
        data: {
          businessId,
          type: "REVERSAL",
          amountMinor: -reward.amountMinor,
          currency: reward.currency,
          revenueStream: "REFERRAL_REWARD",
          sourceType: "GROWTH_REWARD_REVERSAL",
          sourceId: reward.id,
          idempotencyKey: `growth-reversal:${idempotencyKey}`,
          reason,
          actorId: user.id,
          correlationId: idempotencyKey,
          reversalOfId: original.id,
        },
      });
      await tx.referral.update({
        where: { id: reward.referralId },
        data: { state: "REVERSED" },
      });
      return tx.growthReward.update({
        where: { id: reward.id },
        data: { status: "REVERSED", reversedAt: new Date() },
      });
    });
    await this.audit.record({
      businessId,
      actorId: user.id,
      actorType: user.role,
      action: "growth.reward_reversed",
      resourceType: "GrowthReward",
      resourceId: rewardId,
      correlationId: idempotencyKey,
      result: "SUCCEEDED",
      metadata: { reason },
    });
    return result;
  }
  async assignExperiment(
    user: AuthenticatedUser,
    businessId: string,
    experimentId: string,
    subjectId: string,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "growth:read",
    );
    const experiment = await this.db.growthExperiment.findFirst({
      where: { id: experimentId, businessId, status: "RUNNING" },
      include: { variants: true },
    });
    if (!experiment) throw new NotFoundException("Experiment not found");
    const existing = await this.db.experimentAssignment.findUnique({
      where: { experimentId_subjectId: { experimentId, subjectId } },
    });
    if (existing) return existing;
    const key = this.engine.assignVariant(
      businessId,
      experimentId,
      subjectId,
      experiment.variants.map((v: { key: string; weight: number }) => ({
        key: v.key,
        weight: v.weight,
      })),
    );
    const variant = experiment.variants.find(
      (v: { key: string }) => v.key === key,
    )!;
    try {
      return await this.db.experimentAssignment.create({
        data: {
          businessId,
          experimentId,
          variantId: variant.id,
          subjectId,
          assignmentSnapshot: { key, weight: variant.weight },
        },
      });
    } catch {
      return this.db.experimentAssignment.findUnique({
        where: { experimentId_subjectId: { experimentId, subjectId } },
      });
    }
  }
  async recordAttribution(
    user: AuthenticatedUser,
    businessId: string,
    input: {
      touchId: string;
      anonymousId?: string;
      subjectId?: string;
      source: string;
      model: string;
      utm?: Record<string, string>;
    },
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "growth:manage",
    );
    if (!input.anonymousId && !input.subjectId)
      throw new BadRequestException("Attribution identity is required");
    const marketId = await this.marketId(businessId);
    return this.db.attributionTouch.upsert({
      where: { businessId_touchId: { businessId, touchId: input.touchId } },
      create: { businessId, marketId, ...input },
      update: {},
    });
  }
  async mergeAttribution(
    user: AuthenticatedUser,
    businessId: string,
    anonymousId: string,
    subjectId: string,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "growth:manage",
    );
    if (!anonymousId || !subjectId)
      throw new BadRequestException("Both identities are required");
    return this.db.attributionTouch.updateMany({
      where: { businessId, anonymousId, subjectId: null },
      data: { subjectId },
    });
  }
  async progressChallenge(
    user: AuthenticatedUser,
    businessId: string,
    challengeId: string,
    subjectId: string,
    eventId: string,
    increment: number,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "growth:manage",
    );
    return this.db.$transaction(async (tx: PrismaService) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        `challenge:${businessId}:${challengeId}:${subjectId}`,
      );
      const challenge = await tx.growthChallenge.findFirst({
        where: {
          id: challengeId,
          businessId,
          status: "ACTIVE",
          startsAt: { lte: new Date() },
          endsAt: { gt: new Date() },
        },
      });
      if (!challenge) throw new NotFoundException("Challenge not found");
      const prior = await tx.challengeProgressEvent.findUnique({
        where: { eventId },
      });
      if (prior)
        return tx.challengeProgress.findUnique({
          where: { id: prior.progressId },
        });
      const progress = await tx.challengeProgress.upsert({
        where: { challengeId_subjectId: { challengeId, subjectId } },
        create: {
          businessId,
          challengeId,
          subjectId,
          progress: Math.min(increment, challenge.target),
          completedAt: increment >= challenge.target ? new Date() : null,
        },
        update: { progress: { increment } },
      });
      const capped =
        progress.progress > challenge.target
          ? await tx.challengeProgress.update({
              where: { id: progress.id },
              data: {
                progress: challenge.target,
                completedAt: progress.completedAt ?? new Date(),
              },
            })
          : progress;
      await tx.challengeProgressEvent.create({
        data: { progressId: capped.id, eventId, increment },
      });
      return capped;
    });
  }
}
