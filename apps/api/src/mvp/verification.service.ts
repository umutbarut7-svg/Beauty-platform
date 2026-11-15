/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionsService } from "../auth/permissions.service.js";
import {
  assertMvpEnabled,
  configuredInteger,
} from "./providers/provider-config.js";

export function verificationPolicy() {
  if (process.env.MVP_VERIFICATION_POLICY_REVIEWED !== "true") return null;
  const version = process.env.MVP_VERIFICATION_POLICY_VERSION;
  const notice = process.env.MVP_VERIFICATION_NOTICE;
  try {
    const fields = JSON.parse(
      process.env.MVP_VERIFICATION_FIELDS_JSON ?? "null",
    ) as Array<{ key: string; label: string }>;
    if (
      !version ||
      version.length > 100 ||
      !notice ||
      notice.length > 10000 ||
      !Array.isArray(fields) ||
      !fields.length ||
      fields.length > 6 ||
      fields.some(
        (f) =>
          !f ||
          !/^[a-z][a-z0-9_]{0,39}$/.test(f.key) ||
          typeof f.label !== "string" ||
          !f.label.trim() ||
          f.label.length > 300,
      ) ||
      new Set(fields.map((f) => f.key)).size !== fields.length
    )
      return null;
    return {
      version,
      notice,
      fields,
      retentionDays: configuredInteger(
        "MVP_VERIFICATION_RETENTION_DAYS",
        1,
        3650,
      ),
    };
  } catch {
    return null;
  }
}
@Injectable()
export class VerificationService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}
  policy() {
    return { automatic: false, policy: verificationPolicy() };
  }
  private enabled() {
    assertMvpEnabled();
    const policy = verificationPolicy();
    if (!policy)
      throw new ServiceUnavailableException(
        "REVIEWED_VERIFICATION_POLICY_REQUIRED",
      );
    return policy;
  }
  async list(user: AuthenticatedUser, businessId: string) {
    assertMvpEnabled();
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "business:read",
    );
    // A profile STAFF member cannot read the business's verification evidence.
    if (user.role !== "SUPER_ADMIN")
      await this.permissions.assertBusinessAccess(
        user,
        businessId,
        "business:update",
      );
    const rows = await this.db.mvpVerificationRequest.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        policyVersion: true,
        answers: true,
        status: true,
        reviewNote: true,
        evidenceExpiresAt: true,
      },
    });
    return rows.map(
      (row: {
        id: string;
        policyVersion: string;
        answers: unknown;
        status: string;
        reviewNote: string | null;
        evidenceExpiresAt: Date;
      }) =>
        new Date(row.evidenceExpiresAt).getTime() <= Date.now()
          ? {
              ...row,
              answers: {},
              reviewNote: null,
              status: row.status === "SUBMITTED" ? "EXPIRED" : row.status,
            }
          : row,
    );
  }
  async submit(
    user: AuthenticatedUser,
    businessId: string,
    version: string,
    answers: Record<string, string>,
  ) {
    const policy = this.enabled();
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "business:update",
    );
    if (version !== policy.version)
      throw new ConflictException("VERIFICATION_NOTICE_CHANGED");
    if (
      !answers ||
      Array.isArray(answers) ||
      Object.keys(answers).sort().join() !==
        policy.fields
          .map((f) => f.key)
          .sort()
          .join() ||
      Object.values(answers).some(
        (v) => typeof v !== "string" || !v.trim() || v.length > 1000,
      )
    )
      throw new BadRequestException("VERIFICATION_EVIDENCE_INVALID");
    return this.db.$transaction(async (tx: PrismaService) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))::text",
        `mvp-verification:${businessId}`,
      );
      const business = await tx.business.findUnique({
        where: { id: businessId },
        select: { isVerified: true },
      });
      if (!business) throw new NotFoundException("BUSINESS_UNAVAILABLE");
      if (business.isVerified)
        throw new ConflictException("BUSINESS_ALREADY_VERIFIED");
      const pending = await tx.mvpVerificationRequest.findFirst({
        where: { businessId, status: "SUBMITTED" },
      });
      if (pending)
        throw new ConflictException("VERIFICATION_ALREADY_SUBMITTED");
      const request = await tx.mvpVerificationRequest.create({
        data: {
          businessId,
          requesterId: user.id,
          policyVersion: policy.version,
          answers,
          evidenceExpiresAt: new Date(
            Date.now() + policy.retentionDays * 86400000,
          ),
        },
      });
      await this.audit(tx, user, businessId, request.id, "submitted");
      return request;
    });
  }
  async decide(
    user: AuthenticatedUser,
    businessId: string,
    requestId: string,
    decision: "APPROVED" | "REJECTED" | "REVOKED",
    note: string,
  ) {
    const policy = this.enabled();
    if (user.role !== "SUPER_ADMIN")
      throw new ForbiddenException("PLATFORM_REVIEWER_REQUIRED");
    return this.db.$transaction(async (tx: PrismaService) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))::text",
        `mvp-verification:${businessId}`,
      );
      if (
        await tx.businessMember.findUnique({
          where: { userId_businessId: { userId: user.id, businessId } },
        })
      )
        throw new ForbiddenException("INDEPENDENT_REVIEWER_REQUIRED");
      const request = await tx.mvpVerificationRequest.findFirst({
        where: { id: requestId, businessId },
      });
      if (!request)
        throw new NotFoundException("VERIFICATION_REQUEST_UNAVAILABLE");
      if (
        decision !== "REVOKED" &&
        new Date(request.evidenceExpiresAt).getTime() <= Date.now()
      )
        throw new ConflictException("VERIFICATION_EVIDENCE_EXPIRED");
      if (decision !== "REVOKED" && request.policyVersion !== policy.version)
        throw new ConflictException("VERIFICATION_POLICY_CHANGED");
      if (request.status === decision && request.reviewerId === user.id)
        return request;
      if (
        decision === "REVOKED"
          ? request.status !== "APPROVED"
          : request.status !== "SUBMITTED"
      )
        throw new ConflictException("VERIFICATION_STATE_INVALID");
      const updated = await tx.mvpVerificationRequest.update({
        where: { id: request.id },
        data: {
          status: decision,
          reviewerId: user.id,
          reviewedAt: new Date(),
          reviewNote: note,
        },
      });
      await tx.business.update({
        where: { id: businessId },
        data: { isVerified: decision === "APPROVED" },
      });
      await this.audit(
        tx,
        user,
        businessId,
        request.id,
        decision.toLowerCase(),
      );
      return updated;
    });
  }
  async cancel(user: AuthenticatedUser, businessId: string, id: string) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "business:update",
    );
    return this.db.$transaction(async (tx: PrismaService) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))::text",
        `mvp-verification:${businessId}`,
      );
      const row = await tx.mvpVerificationRequest.findFirst({
        where: { id, businessId },
      });
      if (!row) throw new NotFoundException("VERIFICATION_REQUEST_UNAVAILABLE");
      if (row.status === "CANCELLED") return { status: "CANCELLED" };
      if (row.status !== "SUBMITTED")
        throw new ConflictException("VERIFICATION_STATE_INVALID");
      await tx.mvpVerificationRequest.update({
        where: { id },
        data: { status: "CANCELLED", answers: {} },
      });
      await this.audit(tx, user, businessId, id, "cancelled");
      return { status: "CANCELLED" };
    });
  }
  private audit(
    tx: PrismaService,
    user: AuthenticatedUser,
    businessId: string,
    requestId: string,
    action: string,
  ) {
    return tx.auditLog.create({
      data: {
        businessId,
        actorId: user.id,
        actorType: user.role,
        action: `mvp.verification.${action}`,
        resourceType: "MvpVerificationRequest",
        resourceId: requestId,
        metadata: { version: "v1" },
        result: "SUCCEEDED",
      },
    });
  }
}
