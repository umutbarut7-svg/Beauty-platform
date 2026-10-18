/* eslint-disable @typescript-eslint/consistent-type-imports, @typescript-eslint/no-explicit-any */
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { sanitizeTelemetry } from "../infrastructure/sanitizer.js";
import { ProfessionalConfidenceService } from "./professional-confidence.service.js";
import { ProfessionalTaxonomyService } from "./professional-taxonomy.service.js";
import type {
  SkillEvidenceEvent,
  ProfessionalSkillReadModel,
} from "./professional-intelligence.types.js";
@Injectable()
export class ProfessionalIntelligenceService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly confidence: ProfessionalConfidenceService,
    private readonly taxonomy: ProfessionalTaxonomyService,
  ) {}
  async get(
    user: AuthenticatedUser,
    businessId: string,
    professionalId: string,
  ) {
    const access = await this.access(user, businessId, professionalId, false);
    const profile = await this.db.professionalIntelligenceProfile.findUnique({
      where: { businessId_professionalId: { businessId, professionalId } },
      select: {
        id: true,
        version: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        skills: {
          where: {
            status: "ACTIVE",
            ...(access.manage
              ? {}
              : {
                  sourceType: { in: ["OBSERVED", "DERIVED", "VERIFIED"] },
                  confidence: { gte: 0.45 },
                }),
          },
          select: {
            id: access.manage,
            category: true,
            skillCode: true,
            sourceType: true,
            confidence: true,
            evidenceCount: true,
            completedJobCount: true,
            verifiedResultCount: true,
            repeatCustomerCount: true,
            lastObservedAt: true,
          },
          orderBy: [{ category: "asc" }, { skillCode: "asc" }],
        },
      },
    });
    return profile
      ? { status: "AVAILABLE", profile }
      : { status: "INSUFFICIENT_EVIDENCE", profile: null };
  }
  async skills(
    user: AuthenticatedUser,
    businessId: string,
    professionalId: string,
  ) {
    return (
      (await this.get(user, businessId, professionalId)).profile?.skills ?? []
    );
  }
  async evidence(
    user: AuthenticatedUser,
    businessId: string,
    professionalId: string,
    skillId: string,
  ) {
    await this.access(user, businessId, professionalId, true);
    return this.db.professionalSkillEvidence.findMany({
      where: { businessId, skillId, skill: { profile: { professionalId } } },
      select: {
        sourceType: true,
        sourceId: true,
        weight: true,
        occurredAt: true,
        createdAt: true,
      },
      orderBy: { occurredAt: "desc" },
      take: 100,
    });
  }
  async declare(
    user: AuthenticatedUser,
    businessId: string,
    professionalId: string,
    category: string,
    skillCode: string,
  ) {
    this.taxonomy.assert(category, skillCode);
    await this.access(user, businessId, professionalId, true);
    const profile = await this.profile(businessId, professionalId);
    return this.mutate(
      businessId,
      profile.id,
      { category, skillCode, sourceType: "DECLARED" },
      "SKILL_DECLARED",
    );
  }
  async deactivate(
    user: AuthenticatedUser,
    businessId: string,
    professionalId: string,
    category: string,
    skillCode: string,
  ) {
    this.taxonomy.assert(category, skillCode);
    await this.access(user, businessId, professionalId, true);
    const profile = await this.requiredProfile(businessId, professionalId);
    return this.db.$transaction(async (tx: PrismaService) => {
      await this.lock(tx, profile.id);
      const skill = await tx.professionalSkill.findUnique({
        where: {
          profileId_category_skillCode_sourceType: {
            profileId: profile.id,
            category,
            skillCode,
            sourceType: "DECLARED",
          },
        },
      });
      if (!skill || skill.status !== "ACTIVE")
        throw new NotFoundException("Declared skill not found");
      await tx.professionalSkill.update({
        where: { id: skill.id },
        data: { status: "INACTIVE" },
      });
      await this.version(
        tx,
        businessId,
        profile.id,
        "SKILL_DEACTIVATED",
        "SKILL",
        skill.id,
        { category, skillCode },
        null,
        "PROFESSIONAL_CORRECTION",
      );
      return { status: "INACTIVE" };
    });
  }
  async experiences(
    user: AuthenticatedUser,
    businessId: string,
    professionalId: string,
  ) {
    const a = await this.access(user, businessId, professionalId, false);
    const p = await this.requiredProfile(businessId, professionalId);
    return this.db.professionalExperience.findMany({
      where: {
        businessId,
        profileId: p.id,
        status: "ACTIVE",
        ...(a.manage ? {} : { verificationStatus: "VERIFIED" }),
      },
      select: {
        id: a.manage,
        organizationName: true,
        role: true,
        specialization: true,
        startDate: true,
        endDate: true,
        sourceType: true,
        verificationStatus: true,
      },
      orderBy: { startDate: "desc" },
    });
  }
  async addExperience(
    user: AuthenticatedUser,
    businessId: string,
    professionalId: string,
    dto: Record<string, unknown>,
  ) {
    await this.access(user, businessId, professionalId, true);
    const p = await this.profile(businessId, professionalId);
    return this.db.$transaction(async (tx: PrismaService) => {
      await this.lock(tx, p.id);
      const row = await tx.professionalExperience.create({
        data: {
          businessId,
          profileId: p.id,
          ...dto,
          sourceType: "DECLARED",
          verificationStatus: "UNVERIFIED",
        },
      });
      await this.version(
        tx,
        businessId,
        p.id,
        "EXPERIENCE_ADDED",
        "EXPERIENCE",
        row.id,
        null,
        { role: row.role },
        "PROFESSIONAL_DECLARATION",
      );
      await this.career(
        tx,
        businessId,
        p.id,
        "ROLE_CHANGED",
        `experience:${row.id}`,
        "DECLARED",
        row.id,
        "Declared experience added",
        new Date(),
      );
      return row;
    });
  }
  async credentials(
    user: AuthenticatedUser,
    businessId: string,
    professionalId: string,
  ) {
    const a = await this.access(user, businessId, professionalId, false);
    const p = await this.requiredProfile(businessId, professionalId);
    return this.db.professionalCredential.findMany({
      where: {
        businessId,
        profileId: p.id,
        status: "ACTIVE",
        ...(a.manage ? {} : { verificationStatus: "VERIFIED" }),
      },
      select: {
        id: a.manage,
        kind: true,
        issuer: true,
        title: true,
        issuedAt: true,
        expiresAt: true,
        sourceType: true,
        verificationStatus: true,
      },
      orderBy: { issuedAt: "desc" },
    });
  }
  async addCredential(
    user: AuthenticatedUser,
    businessId: string,
    professionalId: string,
    dto: Record<string, unknown>,
  ) {
    await this.access(user, businessId, professionalId, true);
    const p = await this.profile(businessId, professionalId);
    const row = await this.db.professionalCredential.create({
      data: {
        businessId,
        profileId: p.id,
        ...dto,
        sourceType: "DECLARED",
        verificationStatus: "UNVERIFIED",
      },
    });
    await this.db.professionalCareerEvent.upsert({
      where: {
        businessId_idempotencyKey: {
          businessId,
          idempotencyKey: `credential:${row.id}`,
        },
      },
      create: {
        businessId,
        profileId: p.id,
        eventType: "CREDENTIAL_ADDED",
        idempotencyKey: `credential:${row.id}`,
        sourceType: "DECLARED",
        referenceId: row.id,
        summary: "Declared credential added",
        occurredAt: new Date(),
      },
      update: {},
    });
    return row;
  }
  async verifyCredential(
    user: AuthenticatedUser,
    businessId: string,
    professionalId: string,
    credentialId: string,
  ) {
    await this.assertVerifier(user, businessId);
    const profile = await this.requiredProfile(businessId, professionalId);
    return this.db.$transaction(async (tx: PrismaService) => {
      await this.lock(tx, profile.id);
      const credential = await tx.professionalCredential.findFirst({
        where: { id: credentialId, businessId, profileId: profile.id },
      });
      if (!credential) throw new NotFoundException("Credential not found");
      if (credential.verificationStatus === "VERIFIED")
        return { status: "VERIFIED", id: credential.id };
      await tx.professionalCredential.update({
        where: { id: credential.id },
        data: { verificationStatus: "VERIFIED" },
      });
      await this.version(
        tx,
        businessId,
        profile.id,
        "CREDENTIAL_VERIFIED",
        "CREDENTIAL",
        credential.id,
        { verificationStatus: credential.verificationStatus },
        { verificationStatus: "VERIFIED" },
        "BUSINESS_VERIFICATION",
      );
      await this.career(
        tx,
        businessId,
        profile.id,
        "CREDENTIAL_VERIFIED",
        `credential-verified:${credential.id}`,
        "VERIFIED",
        credential.id,
        "Credential verified",
        new Date(),
      );
      return { status: "VERIFIED", id: credential.id };
    });
  }
  async timeline(
    user: AuthenticatedUser,
    businessId: string,
    professionalId: string,
  ) {
    await this.access(user, businessId, professionalId, true);
    const p = await this.requiredProfile(businessId, professionalId);
    return this.db.professionalCareerEvent.findMany({
      where: { businessId, profileId: p.id },
      select: {
        eventType: true,
        sourceType: true,
        summary: true,
        occurredAt: true,
      },
      orderBy: { occurredAt: "desc" },
      take: 100,
    });
  }
  async performance(
    user: AuthenticatedUser,
    businessId: string,
    professionalId: string,
  ) {
    await this.access(user, businessId, professionalId, true);
    const p = await this.requiredProfile(businessId, professionalId);
    const rows = await this.db.professionalPerformanceSignal.findMany({
      where: { businessId, profileId: p.id },
      select: {
        signalType: true,
        contextKey: true,
        value: true,
        sourceType: true,
        occurredAt: true,
      },
      orderBy: { occurredAt: "desc" },
      take: 100,
    });
    return rows.length
      ? { status: "AVAILABLE", signals: rows }
      : { status: "INSUFFICIENT_EVIDENCE", signals: [] };
  }
  async specializations(
    user: AuthenticatedUser,
    businessId: string,
    professionalId: string,
  ) {
    await this.access(user, businessId, professionalId, false);
    const p = await this.requiredProfile(businessId, professionalId);
    const skills = await this.db.professionalSkill.findMany({
      where: {
        businessId,
        profileId: p.id,
        status: "ACTIVE",
        sourceType: { in: ["OBSERVED", "DERIVED", "VERIFIED"] },
        completedJobCount: { gte: 5 },
        verifiedResultCount: { gte: 1 },
      },
      select: {
        category: true,
        skillCode: true,
        confidence: true,
        evidenceCount: true,
        completedJobCount: true,
        verifiedResultCount: true,
      },
    });
    return skills.length
      ? {
          status: "AVAILABLE",
          specializations: skills.map((x: any) => ({
            ...x,
            explanation: `${x.completedJobCount} completed jobs and ${x.verifiedResultCount} verified results`,
          })),
        }
      : { status: "INSUFFICIENT_EVIDENCE", specializations: [] };
  }
  async history(
    user: AuthenticatedUser,
    businessId: string,
    professionalId: string,
  ) {
    await this.access(user, businessId, professionalId, true);
    const p = await this.requiredProfile(businessId, professionalId);
    return this.db.professionalIntelligenceVersion.findMany({
      where: { businessId, profileId: p.id },
      orderBy: { version: "desc" },
      take: 100,
    });
  }
  async processEvidence(event: SkillEvidenceEvent) {
    this.taxonomy.assert(event.category, event.skillCode);
    const staff = await this.db.staff.findFirst({
      where: {
        id: event.professionalId,
        businessId: event.businessId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!staff) throw new NotFoundException("Professional not found");
    const p = await this.profile(event.businessId, event.professionalId);
    return this.db.$transaction(async (tx: PrismaService) => {
      await this.lock(tx, p.id);
      const key = `${event.eventType}:${event.eventId}`;
      const duplicate = await tx.professionalSkillEvidence.findUnique({
        where: {
          businessId_idempotencyKey: {
            businessId: event.businessId,
            idempotencyKey: key,
          },
        },
      });
      if (duplicate) return { status: "DUPLICATE" };
      const skill = await tx.professionalSkill.upsert({
        where: {
          profileId_category_skillCode_sourceType: {
            profileId: p.id,
            category: event.category,
            skillCode: event.skillCode,
            sourceType: "OBSERVED",
          },
        },
        create: {
          businessId: event.businessId,
          profileId: p.id,
          category: event.category,
          skillCode: event.skillCode,
          sourceType: "OBSERVED",
          firstObservedAt: event.occurredAt,
          lastObservedAt: event.occurredAt,
        },
        update: { lastObservedAt: event.occurredAt, status: "ACTIVE" },
      });
      await tx.professionalSkillEvidence.create({
        data: {
          businessId: event.businessId,
          skillId: skill.id,
          sourceType: event.eventType,
          sourceId: event.sourceId,
          idempotencyKey: key,
          weight: event.weight,
          occurredAt: event.occurredAt,
          metadata: sanitizeTelemetry({ eventId: event.eventId }),
        },
      });
      await tx.professionalPerformanceSignal.create({
        data: {
          businessId: event.businessId,
          profileId: p.id,
          signalType: event.eventType,
          contextKey: `${event.category}:${event.skillCode}`,
          value: 1,
          sourceType: "OBSERVED",
          idempotencyKey: key,
          occurredAt: event.occurredAt,
        },
      });
      const evidence = await tx.professionalSkillEvidence.findMany({
        where: { businessId: event.businessId, skillId: skill.id },
        select: { weight: true, occurredAt: true, sourceType: true },
      });
      const completed = evidence.filter(
          (x: any) => x.sourceType === "JOB_COMPLETED",
        ).length,
        verified = evidence.filter(
          (x: any) => x.sourceType === "RESULT_VERIFIED",
        ).length,
        repeat = evidence.filter(
          (x: any) => x.sourceType === "REPEAT_CUSTOMER",
        ).length;
      const score = this.confidence.calculate({
        weights: evidence.map((x: any) => Number(x.weight)),
        latestAt: evidence[0]?.occurredAt,
        verifiedResults: verified,
        completedJobs: completed,
        repeatCustomers: repeat,
      });
      await tx.professionalSkill.update({
        where: { id: skill.id },
        data: {
          confidence: score.confidence,
          evidenceCount: evidence.length,
          completedJobCount: completed,
          verifiedResultCount: verified,
          repeatCustomerCount: repeat,
        },
      });
      if (score.sufficient && completed >= 5 && verified >= 1) {
        await tx.professionalSkill.upsert({
          where: {
            profileId_category_skillCode_sourceType: {
              profileId: p.id,
              category: event.category,
              skillCode: event.skillCode,
              sourceType: "DERIVED",
            },
          },
          create: {
            businessId: event.businessId,
            profileId: p.id,
            category: event.category,
            skillCode: event.skillCode,
            sourceType: "DERIVED",
            confidence: score.confidence,
            evidenceCount: evidence.length,
            completedJobCount: completed,
            verifiedResultCount: verified,
            repeatCustomerCount: repeat,
            firstObservedAt: event.occurredAt,
            lastObservedAt: event.occurredAt,
          },
          update: {
            confidence: score.confidence,
            evidenceCount: evidence.length,
            completedJobCount: completed,
            verifiedResultCount: verified,
            repeatCustomerCount: repeat,
            lastObservedAt: event.occurredAt,
            status: "ACTIVE",
          },
        });
      }
      for (const milestone of [
        ...(completed === 1 ? ["FIRST_COMPLETED_JOB"] : []),
        ...(completed === 10 ? ["TEN_COMPLETED_JOBS"] : []),
        ...(completed === 50 ? ["FIFTY_COMPLETED_JOBS"] : []),
        ...(verified === 1 ? ["FIRST_VERIFIED_RESULT"] : []),
        ...(repeat === 1 ? ["FIRST_REPEAT_CUSTOMER"] : []),
      ])
        await this.career(
          tx,
          event.businessId,
          p.id,
          "MILESTONE_REACHED",
          `milestone:${skill.id}:${milestone}`,
          "DERIVED",
          skill.id,
          milestone,
          event.occurredAt,
        );
      await this.career(
        tx,
        event.businessId,
        p.id,
        event.eventType === "RESULT_VERIFIED"
          ? "PORTFOLIO_RESULT_VERIFIED"
          : "MILESTONE_REACHED",
        key,
        "OBSERVED",
        event.sourceId,
        event.eventType,
        event.occurredAt,
      );
      return {
        status: score.sufficient ? "UPDATED" : "INSUFFICIENT_EVIDENCE",
        confidence: score.confidence,
      };
    });
  }
  async readModel(
    user: AuthenticatedUser,
    businessId: string,
    professionalId: string,
  ): Promise<ProfessionalSkillReadModel> {
    const s = await this.skills(user, businessId, professionalId),
      sp = await this.specializations(user, businessId, professionalId);
    return {
      professionalId,
      skills: s
        .filter((x: any) => Number(x.confidence) >= 0.45)
        .map((x: any) => ({
          category: x.category,
          skillCode: x.skillCode,
          confidence: Number(x.confidence),
          evidenceCount: x.evidenceCount,
          verified: x.sourceType === "VERIFIED" || x.verifiedResultCount > 0,
        })),
      specializations: sp.specializations.map((x: any) => ({
        category: x.category,
        skillCode: x.skillCode,
        confidence: Number(x.confidence),
        explanation: x.explanation,
      })),
    };
  }
  private profile(businessId: string, professionalId: string) {
    return this.db.professionalIntelligenceProfile.upsert({
      where: { businessId_professionalId: { businessId, professionalId } },
      create: { businessId, professionalId },
      update: {},
      select: { id: true, version: true },
    });
  }
  private async requiredProfile(businessId: string, professionalId: string) {
    const p = await this.db.professionalIntelligenceProfile.findUnique({
      where: { businessId_professionalId: { businessId, professionalId } },
      select: { id: true, version: true },
    });
    if (!p)
      throw new NotFoundException(
        "Professional intelligence profile not found",
      );
    return p;
  }
  private async mutate(
    businessId: string,
    profileId: string,
    key: { category: string; skillCode: string; sourceType: string },
    reason: string,
  ) {
    return this.db.$transaction(async (tx: PrismaService) => {
      await this.lock(tx, profileId);
      const old = await tx.professionalSkill.findUnique({
        where: {
          profileId_category_skillCode_sourceType: { profileId, ...key },
        },
      });
      const skill = await tx.professionalSkill.upsert({
        where: {
          profileId_category_skillCode_sourceType: { profileId, ...key },
        },
        create: {
          businessId,
          profileId,
          ...key,
          confidence: 0.2,
          firstObservedAt: new Date(),
          lastObservedAt: new Date(),
        },
        update: { status: "ACTIVE", lastObservedAt: new Date() },
      });
      await this.version(
        tx,
        businessId,
        profileId,
        old ? "SKILL_CORRECTED" : "SKILL_ADDED",
        "SKILL",
        skill.id,
        old ? { status: old.status } : null,
        {
          category: key.category,
          skillCode: key.skillCode,
          sourceType: key.sourceType,
        },
        reason,
      );
      await this.career(
        tx,
        businessId,
        profileId,
        "SKILL_ADDED",
        `skill:${skill.id}:${reason}`,
        "DECLARED",
        skill.id,
        "Declared skill added",
        new Date(),
      );
      return skill;
    });
  }
  private async version(
    tx: PrismaService,
    businessId: string,
    profileId: string,
    changeType: string,
    entityType: string,
    entityId: string | null,
    oldValue: unknown,
    newValue: unknown,
    reason: string,
  ) {
    const p = await tx.professionalIntelligenceProfile.findUnique({
        where: { id: profileId },
        select: { version: true },
      }),
      next = p.version + 1;
    await tx.professionalIntelligenceProfile.update({
      where: { id: profileId },
      data: { version: next },
    });
    return tx.professionalIntelligenceVersion.create({
      data: {
        businessId,
        profileId,
        version: next,
        changeType,
        entityType,
        entityId,
        oldValue: sanitizeTelemetry(oldValue),
        newValue: sanitizeTelemetry(newValue),
        reason,
      },
    });
  }
  private career(
    tx: PrismaService,
    businessId: string,
    profileId: string,
    eventType: string,
    idempotencyKey: string,
    sourceType: string,
    referenceId: string | null,
    summary: string,
    occurredAt: Date,
  ) {
    return tx.professionalCareerEvent.upsert({
      where: { businessId_idempotencyKey: { businessId, idempotencyKey } },
      create: {
        businessId,
        profileId,
        eventType,
        idempotencyKey,
        sourceType,
        referenceId,
        summary,
        occurredAt,
      },
      update: {},
    });
  }
  private lock(tx: PrismaService, id: string) {
    return tx.$queryRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      `professional-intelligence:${id}`,
    );
  }
  private async access(
    user: AuthenticatedUser,
    businessId: string,
    professionalId: string,
    manage: boolean,
  ) {
    const staff = await this.db.staff.findFirst({
      where: { id: professionalId, businessId, isActive: true },
      select: { userId: true },
    });
    if (!staff) throw new NotFoundException("Professional not found");
    if (user.role === "SUPER_ADMIN") return { manage: true };
    const member = await this.db.businessMember.findUnique({
      where: { userId_businessId: { userId: user.id, businessId } },
      select: { role: true },
    });
    const self = staff.userId === user.id;
    const allowed = self || !!member;
    if (manage && !allowed)
      throw new ForbiddenException("Professional intelligence access denied");
    return { manage: allowed };
  }
  private async assertVerifier(user: AuthenticatedUser, businessId: string) {
    if (user.role === "SUPER_ADMIN") return;
    const member = await this.db.businessMember.findUnique({
      where: { userId_businessId: { userId: user.id, businessId } },
      select: { role: true },
    });
    if (!member || member.role === "STAFF")
      throw new ForbiddenException("Credential verification denied");
  }
}
