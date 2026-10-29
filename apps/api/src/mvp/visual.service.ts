/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  HttpException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import type { PrismaService } from "../database/prisma.service.js";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import { AbuseProtectionService } from "../infrastructure/abuse-protection.service.js";
import { requestContext } from "../infrastructure/request-context.js";
import { AISafetyEngine } from "../ai/ai-safety.service.js";
import {
  OpenAiBeautyProvider,
  type VisualPlan,
} from "./providers/openai-beauty.provider.js";
import {
  PrivatePhotoStore,
  storageConfigured,
} from "./providers/private-photo-store.js";
import {
  assertMvpEnabled,
  configuredInteger,
  photoPolicy,
  visionConfigured,
} from "./providers/provider-config.js";
import type { PhotoConsentDto, VisualSessionDto } from "./visual.dto.js";

type VisualSessionSummaryRow = {
  id: string;
  status: string;
  expiresAt: Date;
  createdAt: Date;
  intent: string;
  target: string;
  photo: { consentId: string };
};

export const visualProjection = {
  attempts: true,
  id: true,
  status: true,
  output: true,
  provider: true,
  model: true,
  expiresAt: true,
};
@Injectable()
export class MvpExternalGuard {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly abuse: AbuseProtectionService,
    private readonly safety: AISafetyEngine,
  ) {}
  assertOutput(input: unknown) {
    if (!this.safety.evaluate(input).allowed)
      throw new ServiceUnavailableException("AI_OUTPUT_REQUIRES_REVIEW");
  }
  async consume(ownerId: string, input: unknown, agentType = "MVP_VISUAL") {
    assertMvpEnabled();
    if (!this.safety.evaluate(input).allowed)
      throw new BadRequestException("AI_INPUT_REQUIRES_REVIEW");
    if (
      await this.db.aIKillSwitch.findFirst({
        where: {
          enabled: true,
          businessId: null,
          OR: [
            { scope: "GLOBAL", target: "*" },
            { scope: "AGENT_TYPE", target: agentType },
          ],
        },
      })
    )
      throw new ServiceUnavailableException("AI_CAPABILITY_DISABLED");
    const daily = configuredInteger("MVP_AI_DAILY_REQUEST_LIMIT", 1, 100);
    const globalDaily = configuredInteger(
      "MVP_AI_GLOBAL_DAILY_REQUEST_LIMIT",
      1,
      10000,
    );
    if (
      !(
        await this.abuse.consume(
          { scope: "ENDPOINT", limit: globalDaily, windowMs: 86400000 },
          "mvp-external-global",
        )
      ).allowed
    )
      throw new HttpException("AI_USAGE_LIMIT_REACHED", 429);
    for (const policy of [
      { limit: 5, windowMs: 60000 },
      { limit: daily, windowMs: 86400000 },
    ]) {
      if (
        !(
          await this.abuse.consume(
            { scope: "AI_USER", ...policy },
            `mvp-external:${policy.windowMs}:${ownerId}`,
          )
        ).allowed
      )
        throw new HttpException("AI_USAGE_LIMIT_REACHED", 429);
    }
  }
}

@Injectable()
export class VisualService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly storage: PrivatePhotoStore,
    private readonly ai: OpenAiBeautyProvider,
    private readonly guard: MvpExternalGuard,
    private readonly abuse: AbuseProtectionService,
  ) {}
  capability() {
    const policy = photoPolicy();
    return {
      available:
        process.env.STAGE33_MVP_ENABLED === "true" &&
        Boolean(policy) &&
        storageConfigured() &&
        visionConfigured(),
      policy: policy
        ? {
            version: policy.version,
            notice: policy.notice,
            retentionHours: policy.retentionHours,
          }
        : null,
      reason: !policy
        ? "REVIEWED_PHOTO_POLICY_REQUIRED"
        : !storageConfigured()
          ? "PRIVATE_STORAGE_REQUIRED"
          : !visionConfigured()
            ? "VISION_PROVIDER_REQUIRED"
            : "RUNTIME_PROBE_REQUIRED",
    };
  }
  private enabled() {
    assertMvpEnabled();
    const policy = photoPolicy();
    if (!policy || !storageConfigured() || !visionConfigured())
      throw new ServiceUnavailableException("VISUAL_WORKFLOW_UNAVAILABLE");
    return policy;
  }
  private lock(tx: PrismaService, ownerId: string) {
    return tx.$queryRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext($1))::text",
      `mvp-photo:${ownerId}`,
    );
  }
  private event(
    tx: PrismaService,
    ownerId: string,
    resourceId: string,
    action: string,
    expiresAt: Date,
  ) {
    return tx.mvpPrivacyEvent.create({
      data: {
        ownerId,
        resourceId,
        action,
        expiresAt,
        correlationId: requestContext.get()?.requestId ?? randomUUID(),
      },
    });
  }
  consents(user: AuthenticatedUser) {
    return this.db.mvpPhotoConsent.findMany({
      where: {
        ownerId: user.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, policyVersion: true, expiresAt: true },
    });
  }
  async consent(user: AuthenticatedUser, dto: PhotoConsentDto) {
    const policy = this.enabled();
    if (dto.policyVersion !== policy.version || dto.accepted !== true)
      throw new ConflictException("PHOTO_NOTICE_CHANGED");
    await this.storage.assertPrivateBucket();
    const row = await this.db.$transaction(async (tx: PrismaService) => {
      await this.lock(tx, user.id);
      const consent = await tx.mvpPhotoConsent.create({
        data: {
          ownerId: user.id,
          policyVersion: policy.version,
          noticeHash: createHash("sha256").update(policy.notice).digest("hex"),
          expiresAt: new Date(Date.now() + policy.retentionHours * 3600000),
          auditExpiresAt: new Date(Date.now() + policy.auditDays * 86400000),
        },
      });
      await this.event(
        tx,
        user.id,
        consent.id,
        "photo.consent.granted",
        consent.auditExpiresAt,
      );
      return consent;
    });
    return {
      id: row.id,
      expiresAt: row.expiresAt,
      policyVersion: row.policyVersion,
    };
  }
  private activePhoto(ownerId: string, photoId: string, db = this.db) {
    const policy = photoPolicy();
    return db.mvpPhoto.findFirst({
      where: {
        id: photoId,
        ownerId,
        deletedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        consent: {
          revokedAt: null,
          expiresAt: { gt: new Date() },
          policyVersion: policy?.version ?? "DISABLED",
        },
      },
      include: { consent: true },
    });
  }
  async upload(
    user: AuthenticatedUser,
    consentId: string,
    bytes: Buffer,
    mime: string,
  ) {
    const policy = this.enabled();
    if (
      !(
        await this.abuse.consume(
          { scope: "ACTOR", limit: 10, windowMs: 86400000 },
          `mvp-uploads:${user.id}`,
        )
      ).allowed
    )
      throw new HttpException("PHOTO_UPLOAD_LIMIT_REACHED", 429);
    const jpeg = await this.storage.normalize(bytes, mime);
    const photo = await this.db.$transaction(async (tx: PrismaService) => {
      await this.lock(tx, user.id);
      const consent = await tx.mvpPhotoConsent.findFirst({
        where: {
          id: consentId,
          ownerId: user.id,
          policyVersion: policy.version,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (!consent) throw new NotFoundException("PHOTO_CONSENT_UNAVAILABLE");
      const photo = await tx.mvpPhoto.create({
        data: {
          ownerId: user.id,
          consentId: consent.id,
          objectKey: `private/mvp/${randomUUID()}`,
          mime: "image/jpeg",
          bytes: jpeg.length,
          uploadExpiresAt: new Date(Date.now() + 120000),
          expiresAt: consent.expiresAt,
        },
      });
      await this.event(
        tx,
        user.id,
        photo.id,
        "photo.upload.authorized",
        consent.auditExpiresAt,
      );
      return photo;
    });
    try {
      if (Date.now() > new Date(photo.uploadExpiresAt).getTime() - 30000)
        throw new ServiceUnavailableException("PHOTO_UPLOAD_EXPIRED");
      await this.storage.put(photo.objectKey, jpeg);
      if (!(await this.activePhoto(user.id, photo.id))) {
        await this.storage.erase(photo.objectKey);
        throw new NotFoundException("PHOTO_UNAVAILABLE");
      }
      return { id: photo.id, expiresAt: photo.expiresAt };
    } catch (error) {
      await this.db.mvpPhoto.updateMany({
        where: { id: photo.id, ownerId: user.id },
        data: { revokedAt: new Date() },
      });
      throw error;
    }
  }
  async create(user: AuthenticatedUser, dto: VisualSessionDto) {
    this.enabled();
    return this.db.$transaction(async (tx: PrismaService) => {
      await this.lock(tx, user.id);
      const photo = await this.activePhoto(user.id, dto.photoId, tx);
      if (!photo) throw new NotFoundException("PHOTO_UNAVAILABLE");
      return tx.mvpPhotoAnalysis.create({
        data: {
          ownerId: user.id,
          photoId: photo.id,
          intent: dto.intent,
          target: dto.target,
          answers: [],
          expiresAt: photo.expiresAt,
        },
        select: visualProjection,
      });
    });
  }
  async list(user: AuthenticatedUser) {
    assertMvpEnabled();
    const policy = photoPolicy();
    if (!policy) return { items: [] };
    const now = new Date();
    const rows: VisualSessionSummaryRow[] =
      await this.db.mvpPhotoAnalysis.findMany({
        where: {
          ownerId: user.id,
          status: {
            in: ["CREATED", "RUNNING", "NEEDS_INFORMATION", "PLAN", "FAILED"],
          },
          expiresAt: { gt: now },
          photo: {
            ownerId: user.id,
            deletedAt: null,
            revokedAt: null,
            expiresAt: { gt: now },
            consent: {
              ownerId: user.id,
              revokedAt: null,
              expiresAt: { gt: now },
              policyVersion: policy.version,
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 20,
        select: {
          id: true,
          status: true,
          expiresAt: true,
          createdAt: true,
          intent: true,
          target: true,
          photo: { select: { consentId: true } },
        },
      });
    return {
      items: rows.map(({ photo, ...row }) => ({
        ...row,
        consentId: photo.consentId,
      })),
    };
  }
  async get(user: AuthenticatedUser, id: string) {
    assertMvpEnabled();
    const row = await this.db.mvpPhotoAnalysis.findFirst({
      where: {
        id,
        ownerId: user.id,
        expiresAt: { gt: new Date() },
        photo: {
          deletedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          consent: {
            revokedAt: null,
            expiresAt: { gt: new Date() },
            policyVersion: photoPolicy()?.version ?? "DISABLED",
          },
        },
      },
      select: visualProjection,
    });
    if (!row) throw new NotFoundException("VISUAL_SESSION_UNAVAILABLE");
    return row;
  }
  async analyze(
    user: AuthenticatedUser,
    id: string,
    answers: string[],
    expectedAttempt: number,
  ) {
    this.enabled();
    const session = await this.db.mvpPhotoAnalysis.findFirst({
      where: { id, ownerId: user.id },
    });
    if (!session || !(await this.activePhoto(user.id, session.photoId)))
      throw new NotFoundException("VISUAL_SESSION_UNAVAILABLE");
    if (session.status === "PLAN") return this.get(user, id);
    if (session.attempts !== expectedAttempt)
      throw new ConflictException("VISUAL_SESSION_CHANGED");
    if (
      !["CREATED", "NEEDS_INFORMATION", "FAILED"].includes(session.status) ||
      session.attempts >= 3
    )
      throw new ConflictException("VISUAL_SESSION_BUSY_OR_LIMITED");
    const previous = (session.answers ?? []) as string[];
    const questions = (session.output as VisualPlan | null)?.questions ?? [];
    if (
      (session.status === "CREATED" && answers.length) ||
      (session.status === "NEEDS_INFORMATION" &&
        answers.length !== questions.length) ||
      previous.length + answers.length > 9
    )
      throw new BadRequestException("VISUAL_ANSWERS_INVALID");
    const claim = await this.db.mvpPhotoAnalysis.updateMany({
      where: {
        id,
        ownerId: user.id,
        status: session.status,
        attempts: session.attempts,
      },
      data: { status: "RUNNING", attempts: { increment: 1 } },
    });
    if (claim.count !== 1)
      throw new ConflictException("VISUAL_SESSION_BUSY_OR_LIMITED");
    try {
      await this.guard.consume(user.id, {
        intent: session.intent,
        target: session.target,
        answers: [...previous, ...answers],
      });
      const photo = await this.activePhoto(user.id, session.photoId);
      if (!photo) throw new NotFoundException("PHOTO_UNAVAILABLE");
      const jpeg = await this.storage.sanitizedJpeg(
        photo.objectKey,
        photo.bytes,
        photo.mime,
      );
      const result = await this.ai.analyze({
        jpeg,
        intent: session.intent,
        target: session.target,
        answers: [...previous, ...answers],
      });
      this.guard.assertOutput(result.plan);
      await this.db.$transaction(async (tx: PrismaService) => {
        await this.lock(tx, user.id);
        if (!(await this.activePhoto(user.id, session.photoId, tx)))
          throw new NotFoundException("PHOTO_UNAVAILABLE");
        const committed = await tx.mvpPhotoAnalysis.updateMany({
          where: {
            id,
            ownerId: user.id,
            status: "RUNNING",
            attempts: session.attempts + 1,
            expiresAt: { gt: new Date() },
          },
          data: {
            status: result.plan.status,
            output: result.plan,
            provider: result.provider,
            model: result.model,
            answers: [...previous, ...answers],
          },
        });
        if (committed.count !== 1)
          throw new ConflictException("VISUAL_SESSION_CHANGED");
        await this.event(
          tx,
          user.id,
          id,
          "visual.analysis.completed",
          photo.consent.auditExpiresAt,
        );
      });
      return this.get(user, id);
    } catch (error) {
      await this.db.mvpPhotoAnalysis.updateMany({
        where: {
          id,
          ownerId: user.id,
          status: "RUNNING",
          attempts: session.attempts + 1,
        },
        data: { status: "FAILED" },
      });
      throw error;
    }
  }
  async withdraw(user: AuthenticatedUser, consentId: string) {
    // Withdrawal remains possible when rollout/provider/policy is disabled.
    return this.db.$transaction(async (tx: PrismaService) => {
      await this.lock(tx, user.id);
      const consent = await tx.mvpPhotoConsent.findFirst({
        where: { id: consentId, ownerId: user.id },
      });
      if (!consent) throw new NotFoundException("PHOTO_CONSENT_UNAVAILABLE");
      if (!consent.revokedAt) {
        await tx.mvpPhotoConsent.update({
          where: { id: consent.id },
          data: { revokedAt: new Date() },
        });
        await tx.mvpPhoto.updateMany({
          where: { ownerId: user.id, consentId },
          data: { revokedAt: new Date() },
        });
        await tx.mvpPhotoAnalysis.updateMany({
          where: { ownerId: user.id, photo: { consentId } },
          data: {
            status: "REVOKED",
            output: null,
            intent: "",
            target: "",
            answers: [],
          },
        });
        await this.event(
          tx,
          user.id,
          consent.id,
          "photo.consent.withdrawn",
          consent.auditExpiresAt,
        );
      }
      return { status: "REVOKED", physicalErasure: "PENDING_WORKER" };
    });
  }
}
