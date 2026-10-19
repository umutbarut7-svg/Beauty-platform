/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionsService } from "../auth/permissions.service.js";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import { AuditService } from "../infrastructure/audit.service.js";
import { requestContext } from "../infrastructure/request-context.js";
import { sanitizeTelemetry } from "../infrastructure/sanitizer.js";
import { GovernanceEngine } from "./governance-engine.service.js";
import type {
  DisputeState,
  EnforcementState,
  GovernanceDecision,
  PolicyStatus,
  PrivacyRequestState,
  ResolvedPolicy,
} from "./governance.types.js";
@Injectable()
export class GovernanceService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly audit: AuditService,
    private readonly engine: GovernanceEngine,
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
  async createPolicy(
    user: AuthenticatedUser,
    businessId: string,
    input: {
      key: string;
      scope: string;
      level: string;
      failMode: string;
      reason: string;
      rules: unknown[];
      effectiveFrom?: Date;
      effectiveUntil?: Date;
    },
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "governance:manage",
    );
    const marketId = await this.marketId(businessId);
    if (input.level !== "TENANT" && user.role !== "SUPER_ADMIN")
      throw new ForbiddenException(
        "Global and market policies require platform authorization",
      );
    return this.db.$transaction(async (tx: PrismaService) => {
      const policy = await tx.governancePolicy.upsert({
        where: { businessId_key: { businessId, key: input.key } },
        create: {
          businessId,
          marketId,
          key: input.key,
          scope: input.scope,
          level: input.level,
        },
        update: {},
      });
      const latest = await tx.governancePolicyVersion.findFirst({
        where: { policyId: policy.id },
        orderBy: { version: "desc" },
      });
      const version = await tx.governancePolicyVersion.create({
        data: {
          policyId: policy.id,
          version: (latest?.version ?? 0) + 1,
          status: "DRAFT",
          failMode: input.failMode,
          rules: input.rules,
          effectiveFrom: input.effectiveFrom ?? new Date(),
          effectiveUntil: input.effectiveUntil,
          createdBy: user.id,
          reason: input.reason,
          metadata: {},
        },
      });
      await tx.governanceEvent.create({
        data: {
          eventId: this.engine.fingerprint([
            businessId,
            policy.id,
            String(version.version),
          ]),
          businessId,
          marketId,
          type: "PolicyVersionCreated",
          actorId: user.id,
          resourceType: "GovernancePolicyVersion",
          resourceId: version.id,
          correlationId: requestContext.get()?.requestId ?? version.id,
          payload: { version: version.version },
        },
      });
      return { ...policy, version };
    });
  }
  async transitionPolicy(
    user: AuthenticatedUser,
    businessId: string,
    versionId: string,
    next: PolicyStatus,
    reason: string,
    idempotencyKey: string,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "governance:activate",
    );
    return this.db.$transaction(async (tx: PrismaService) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        `governance-policy:${businessId}:${versionId}`,
      );
      const replay = await tx.governanceEvent.findUnique({
        where: { eventId: idempotencyKey },
      });
      const version = await tx.governancePolicyVersion.findFirst({
        where: { id: versionId, policy: { businessId } },
        include: { policy: true },
      });
      if (!version) throw new NotFoundException("Policy version not found");
      if (version.policy.level !== "TENANT" && user.role !== "SUPER_ADMIN")
        throw new ForbiddenException(
          "Shared policies require platform authorization",
        );
      if (replay) {
        if (
          replay.businessId !== businessId ||
          replay.resourceId !== versionId ||
          replay.type !== "PolicyStatusChanged"
        )
          throw new ConflictException(
            "Idempotency key belongs to another operation",
          );
        return version;
      }
      this.engine.transitionPolicy(version.status as PolicyStatus, next);
      if (next === "ACTIVE")
        await tx.governancePolicyVersion.updateMany({
          where: {
            policyId: version.policyId,
            status: "ACTIVE",
            id: { not: version.id },
          },
          data: { status: "SUPERSEDED", effectiveUntil: new Date() },
        });
      const updated = await tx.governancePolicyVersion.update({
        where: { id: version.id },
        data: { status: next },
      });
      await tx.governanceEvent.create({
        data: {
          eventId: idempotencyKey,
          businessId,
          marketId: version.policy.marketId,
          type: "PolicyStatusChanged",
          actorId: user.id,
          resourceType: "GovernancePolicyVersion",
          resourceId: version.id,
          correlationId: requestContext.get()?.requestId ?? idempotencyKey,
          payload: { from: version.status, to: next, reason },
        },
      });
      return updated;
    });
  }
  async evaluate(
    user: AuthenticatedUser,
    businessId: string,
    scope: string,
    context: Record<string, unknown>,
    highRisk: boolean,
    idempotencyKey: string,
    ai?: Record<string, unknown>,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "governance:read",
    );
    const marketId = await this.marketId(businessId);
    const replay = await this.db.policyEvaluation.findUnique({
      where: { businessId_idempotencyKey: { businessId, idempotencyKey } },
    });
    if (replay) return replay;
    const aiReview = ai
      ? this.engine.assertAiContext({
          tenantId: String(ai.tenantId),
          resolvedTenantId: businessId,
          model: String(ai.model ?? ""),
          modelVersion: String(ai.modelVersion ?? ""),
          promptVersion: String(ai.promptVersion ?? ""),
          tool: ai.tool ? String(ai.tool) : undefined,
          confidence:
            typeof ai.confidence === "number" ? ai.confidence : undefined,
          requestedBypass: ai.requestedBypass === true,
        })
      : undefined;
    const rows = await this.db.governancePolicyVersion.findMany({
      where: {
        status: "ACTIVE",
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: new Date() } }],
        policy: {
          scope,
          OR: [
            { businessId },
            { marketId, level: "MARKET" },
            { level: "GLOBAL" },
          ],
        },
      },
      include: { policy: true },
    });
    const resolved = this.engine.resolve(
      rows.map(
        (row: {
          id: string;
          version: number;
          failMode: string;
          rules: unknown;
          policy: { id: string; level: string };
        }) =>
          ({
            policyId: row.policy.id,
            versionId: row.id,
            version: row.version,
            level: row.policy.level,
            failMode: row.failMode,
            rules: row.rules,
          }) as ResolvedPolicy,
      ),
    );
    let result = this.engine.evaluate(resolved, context, highRisk);
    if (aiReview?.requiresHumanReview && result.decision === "ALLOW") {
      result = {
        ...result,
        decision: "REVIEW",
        reasonCode: "LOW_CONFIDENCE",
        deterministicKey: this.engine.fingerprint([
          result.deterministicKey,
          "REVIEW",
          "LOW_CONFIDENCE",
        ]),
      };
    }
    return this.db.policyEvaluation.create({
      data: {
        businessId,
        marketId,
        scope,
        policyVersionId: result.policyVersionId,
        ruleKey: result.ruleKey,
        inputSnapshot: context,
        decision: result.decision,
        reasonCode: result.reasonCode,
        deterministicKey: result.deterministicKey,
        idempotencyKey,
        actorId: user.id,
        correlationId: requestContext.get()?.requestId ?? idempotencyKey,
        aiMetadata: ai ? sanitizeTelemetry(ai) : undefined,
      },
    });
  }
  async override(
    user: AuthenticatedUser,
    businessId: string,
    evaluationId: string,
    decision: GovernanceDecision,
    reason: string,
    idempotencyKey: string,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "governance:override",
    );
    const evaluation = await this.db.policyEvaluation.findFirst({
      where: { id: evaluationId, businessId },
    });
    if (!evaluation) throw new NotFoundException("Policy evaluation not found");
    if (evaluation.decision === decision)
      throw new ConflictException("Override must change the decision");
    const record = await this.db.humanOverride.upsert({
      where: { businessId_idempotencyKey: { businessId, idempotencyKey } },
      create: {
        businessId,
        marketId: evaluation.marketId,
        evaluationId,
        previousDecision: evaluation.decision,
        newDecision: decision,
        reason,
        actorId: user.id,
        idempotencyKey,
      },
      update: {},
    });
    await this.audit.record({
      businessId,
      actorId: user.id,
      actorType: user.role,
      action: "governance.human_override",
      resourceType: "PolicyEvaluation",
      resourceId: evaluationId,
      correlationId: idempotencyKey,
      result: "SUCCEEDED",
      metadata: {
        previousDecision: evaluation.decision,
        newDecision: decision,
        reason,
      },
    });
    return record;
  }
  async createDispute(
    user: AuthenticatedUser,
    businessId: string,
    input: {
      category: string;
      reason: string;
      parties: unknown[];
      idempotencyKey: string;
      evidenceMetadata?: Record<string, unknown>;
    },
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "governance:case",
    );
    const marketId = await this.marketId(businessId);
    return this.db.governanceDispute.upsert({
      where: {
        businessId_idempotencyKey: {
          businessId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      create: {
        businessId,
        marketId,
        category: input.category,
        reason: input.reason,
        parties: input.parties,
        state: "OPEN",
        idempotencyKey: input.idempotencyKey,
        createdBy: user.id,
        evidenceMetadata: sanitizeTelemetry(input.evidenceMetadata ?? {}),
      },
      update: {},
    });
  }
  async transitionDispute(
    user: AuthenticatedUser,
    businessId: string,
    disputeId: string,
    next: DisputeState,
    reason: string,
    idempotencyKey: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "governance:case",
    );
    return this.db.$transaction(async (tx: PrismaService) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        `dispute:${businessId}:${disputeId}`,
      );
      const prior = await tx.disputeTransition.findUnique({
        where: { businessId_idempotencyKey: { businessId, idempotencyKey } },
      });
      if (prior)
        if (prior.disputeId !== disputeId)
          throw new ConflictException(
            "Idempotency key belongs to another dispute",
          );
      if (prior)
        return tx.governanceDispute.findFirst({
          where: { id: disputeId, businessId },
        });
      const dispute = await tx.governanceDispute.findFirst({
        where: { id: disputeId, businessId },
      });
      if (!dispute) throw new NotFoundException("Dispute not found");
      this.engine.transitionDispute(dispute.state as DisputeState, next);
      await tx.disputeTransition.create({
        data: {
          businessId,
          disputeId,
          fromState: dispute.state,
          toState: next,
          reason,
          actorId: user.id,
          idempotencyKey,
          metadata: sanitizeTelemetry(metadata ?? {}),
        },
      });
      if (next === "APPEAL")
        await tx.governanceAppeal.create({
          data: {
            businessId,
            disputeId,
            grounds: reason,
            evidenceMetadata: sanitizeTelemetry(metadata ?? {}),
            status: "OPEN",
            createdBy: user.id,
          },
        });
      return tx.governanceDispute.update({
        where: { id: dispute.id },
        data: { state: next },
      });
    });
  }
  async recordConsent(
    user: AuthenticatedUser,
    businessId: string,
    input: {
      subjectId: string;
      purpose: string;
      noticeVersion: string;
      status: string;
      idempotencyKey: string;
    },
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "privacy:manage",
    );
    const marketId = await this.marketId(businessId);
    return this.db.consentRecord.upsert({
      where: {
        businessId_idempotencyKey: {
          businessId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      create: {
        businessId,
        marketId,
        subjectId: input.subjectId,
        purpose: input.purpose,
        noticeVersion: input.noticeVersion,
        status: input.status,
        grantedAt: input.status === "GRANTED" ? new Date() : null,
        withdrawnAt: input.status === "WITHDRAWN" ? new Date() : null,
        actorId: user.id,
        idempotencyKey: input.idempotencyKey,
      },
      update: {},
    });
  }
  async createPrivacyRequest(
    user: AuthenticatedUser,
    businessId: string,
    subjectId: string,
    type: string,
    idempotencyKey: string,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "privacy:manage",
    );
    const marketId = await this.marketId(businessId);
    return this.db.privacyRequest.upsert({
      where: { businessId_idempotencyKey: { businessId, idempotencyKey } },
      create: {
        businessId,
        marketId,
        subjectId,
        type,
        state: "SUBMITTED",
        idempotencyKey,
        requestedBy: user.id,
      },
      update: {},
    });
  }
  async transitionPrivacy(
    user: AuthenticatedUser,
    businessId: string,
    requestId: string,
    next: PrivacyRequestState,
    reason: string,
    idempotencyKey: string,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "privacy:manage",
    );
    return this.db.$transaction(async (tx: PrismaService) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        `privacy:${businessId}:${requestId}`,
      );
      const prior = await tx.privacyRequestTransition.findUnique({
        where: { businessId_idempotencyKey: { businessId, idempotencyKey } },
      });
      if (prior)
        if (prior.requestId !== requestId)
          throw new ConflictException(
            "Idempotency key belongs to another privacy request",
          );
      if (prior)
        return tx.privacyRequest.findFirst({
          where: { id: requestId, businessId },
        });
      const request = await tx.privacyRequest.findFirst({
        where: { id: requestId, businessId },
      });
      if (!request) throw new NotFoundException("Privacy request not found");
      this.engine.transitionPrivacy(request.state as PrivacyRequestState, next);
      await tx.privacyRequestTransition.create({
        data: {
          businessId,
          requestId,
          fromState: request.state,
          toState: next,
          reason,
          actorId: user.id,
          idempotencyKey,
        },
      });
      return tx.privacyRequest.update({
        where: { id: request.id },
        data: {
          state: next,
          completedAt: next === "COMPLETED" ? new Date() : null,
        },
      });
    });
  }
  async createEnforcement(
    user: AuthenticatedUser,
    businessId: string,
    input: {
      subjectType: string;
      subjectId: string;
      type: string;
      reasonCodes: string[];
      policyEvaluationId?: string;
      financialReference?: string;
      idempotencyKey: string;
    },
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "governance:manage",
    );
    const marketId = await this.marketId(businessId);
    if (input.policyEvaluationId) {
      const evaluation = await this.db.policyEvaluation.findFirst({
        where: { id: input.policyEvaluationId, businessId },
      });
      if (!evaluation)
        throw new NotFoundException("Policy evaluation not found");
    }
    return this.db.enforcementAction.upsert({
      where: {
        businessId_idempotencyKey: {
          businessId,
          idempotencyKey: input.idempotencyKey,
        },
      },
      create: {
        businessId,
        marketId,
        ...input,
        state: "PROPOSED",
        actorId: user.id,
      },
      update: {},
    });
  }
  async transitionEnforcement(
    user: AuthenticatedUser,
    businessId: string,
    actionId: string,
    next: EnforcementState,
    reason: string,
    idempotencyKey: string,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "governance:activate",
    );
    return this.db.$transaction(async (tx: PrismaService) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        `enforcement:${businessId}:${actionId}`,
      );
      const replay = await tx.governanceEvent.findUnique({
        where: { eventId: idempotencyKey },
      });
      const action = await tx.enforcementAction.findFirst({
        where: { id: actionId, businessId },
      });
      if (!action) throw new NotFoundException("Enforcement action not found");
      if (replay) {
        if (
          replay.businessId !== businessId ||
          replay.resourceId !== actionId ||
          replay.type !== "EnforcementStateChanged"
        )
          throw new ConflictException(
            "Idempotency key belongs to another operation",
          );
        return action;
      }
      this.engine.transitionEnforcement(action.state as EnforcementState, next);
      const updated = await tx.enforcementAction.update({
        where: { id: action.id },
        data: { state: next },
      });
      await tx.governanceEvent.create({
        data: {
          eventId: idempotencyKey,
          businessId,
          marketId: action.marketId,
          type: "EnforcementStateChanged",
          actorId: user.id,
          resourceType: "EnforcementAction",
          resourceId: action.id,
          correlationId: requestContext.get()?.requestId ?? idempotencyKey,
          payload: { from: action.state, to: next, reason },
        },
      });
      return updated;
    });
  }
}
