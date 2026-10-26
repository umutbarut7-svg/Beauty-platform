import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { compare } from "bcryptjs";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";

// Only records owned exclusively by the account are automatically erasable.
// Domain records, even without FKs, must not silently become retained or deleted.
const ownedRows: Record<string, string> = {
  User: 'record."id" = $3',
  Customer: 'record."userId" = $3',
  RefreshSession: 'record."userId" = $3',
  Review: 'record."customerId" = $4',
  NotificationPreference: 'record."userId" = $3',
  PushDevice: 'record."userId" = $3',
  AccountDeletionRequest: 'record."id" = $2',
  MvpPhotoConsent: 'record."ownerId" = $3',
  MvpPhoto: 'record."ownerId" = $3',
  MvpPhotoAnalysis: 'record."ownerId" = $3',
  MvpPrivacyEvent: 'record."ownerId" = $3',
};
const authTelemetryTypes = [
  "AUTHENTICATION_FAILED",
  "AUTHORIZATION_DENIED",
  "RATE_LIMIT_EXCEEDED",
];
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const missing = () => new NotFoundException("Silme kaydı bulunamadı.");

@Injectable()
export class AccountErasureService {
  constructor(@Inject(PRISMA_SERVICE) private readonly db: PrismaService) {}

  async tracking(userId: string, password: string) {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user || !(await compare(password, user.passwordHash)))
      throw new ForbiddenException("Parolanız doğrulanamadı.");
    const request = await this.db.accountDeletionRequest.findUnique({
      where: { userId },
    });
    if (!request) throw missing();
    const token = `${request.id}.${randomBytes(32).toString("base64url")}`;
    const updated = await this.db.accountDeletionRequest.updateMany({
      where: { id: request.id, userId, processingAt: null, completedAt: null },
      data: { receiptTokenHash: digest(token) },
    });
    if (updated.count !== 1)
      throw new ConflictException(
        "İşleme alınmış talebin takip anahtarı değiştirilemez.",
      );
    return { token };
  }

  async receipt(token: string) {
    if (!/^[a-zA-Z0-9_-]{1,100}\.[a-zA-Z0-9_-]{43}$/.test(token))
      throw missing();
    const id = token.split(".")[0]!;
    const request = await this.db.accountDeletionRequest.findUnique({
      where: { id },
      include: { user: { select: { restoreQuarantinedAt: true } } },
    });
    const expected = request?.receiptTokenHash;
    if (
      !expected ||
      !/^[0-9a-f]{64}$/.test(expected) ||
      !timingSafeEqual(
        Buffer.from(expected, "hex"),
        Buffer.from(digest(token), "hex"),
      )
    )
      throw missing();
    return {
      status: request.user?.restoreQuarantinedAt
        ? "RESTORE_REVIEW"
        : request.completedAt && !request.userId
          ? "COMPLETED"
          : request.processingAt
            ? "PROCESSING"
            : "REQUESTED",
      deletionCompleted: Boolean(request.completedAt && !request.userId),
      requestedAt: request.requestedAt,
      completedAt: request.completedAt,
    };
  }

  async inspect(requestId: string) {
    return this.db.$transaction(async (tx: Prisma.TransactionClient) => {
      const request = await tx.accountDeletionRequest.findUnique({
        where: { id: requestId },
        include: { user: { include: { customer: true } } },
      });
      if (!request) throw missing();
      if (request.completedAt && !request.userId)
        return { status: "COMPLETED", blockers: [], pendingPhotos: 0 };
      if (!request.user)
        throw new ConflictException(
          "Eksik hesap durumu inceleme gerektiriyor.",
        );
      const blockers = await this.blockers(
        tx,
        requestId,
        request.user.id,
        request.user.email,
        request.user.customer?.id,
      );
      const pendingPhotos = await tx.mvpPhoto.count({
        where: {
          ownerId: request.user.id,
          OR: [
            { deletedAt: null },
            { uploadExpiresAt: { gte: new Date(Date.now() - 30000) } },
          ],
        },
      });
      return {
        status: request.processingAt ? "PROCESSING" : "REQUESTED",
        blockers,
        pendingPhotos,
      };
    });
  }

  async finalize(requestId: string, operatorId: string) {
    if (process.env.ACCOUNT_DELETION_ERASURE_ENABLED !== "true")
      throw new ServiceUnavailableException(
        "Kalıcı silme işleme kuyruğu etkin değil.",
      );
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.db.$transaction(
          async (tx: Prisma.TransactionClient) => {
            const initial = await tx.accountDeletionRequest.findUnique({
              where: { id: requestId },
            });
            if (!initial) throw missing();
            if (initial.completedAt && !initial.userId)
              return { status: "COMPLETED", deletionCompleted: true };
            if (!initial.userId || !initial.processingAt)
              throw new ConflictException("Önce silme işlemi başlatılmalı.");
            await tx.$queryRawUnsafe(
              "SELECT pg_advisory_xact_lock(hashtext($1))::text",
              `mvp-photo:${initial.userId}`,
            );
            const request = await tx.accountDeletionRequest.findUniqueOrThrow({
              where: { id: requestId },
              include: { user: { include: { customer: true } } },
            });
            if (request.completedAt && !request.userId)
              return { status: "COMPLETED", deletionCompleted: true };
            if (!request.user)
              throw new ConflictException(
                "Eksik hesap durumu inceleme gerektiriyor.",
              );
            const user = request.user;
            if (user.restoreQuarantinedAt)
              throw new ConflictException(
                "Yedekten dönen hesap önce inceleme gerektiriyor.",
              );
            if (user.role === "SUPER_ADMIN")
              throw new ConflictException(
                "Yönetici hesabı ayrı inceleme gerektirir.",
              );
            const pending = await tx.mvpPhoto.count({
              where: {
                ownerId: user.id,
                OR: [
                  { deletedAt: null },
                  { uploadExpiresAt: { gte: new Date(Date.now() - 30000) } },
                ],
              },
            });
            if (pending)
              throw new ConflictException(
                "Fotoğrafların fiziksel silinmesi henüz doğrulanmadı.",
              );
            const blockers = await this.blockers(
              tx,
              requestId,
              user.id,
              user.email,
              user.customer?.id,
            );
            if (blockers.length)
              throw new ConflictException({
                message:
                  "İlişkili işletme/veri kayıtları saklama incelemesi gerektiriyor.",
                blockers,
              });
            const now = new Date();
            const consents = await tx.mvpPhotoConsent.findMany({
              where: { ownerId: user.id, auditExpiresAt: { gt: now } },
            });
            const events = await tx.mvpPrivacyEvent.findMany({
              where: { ownerId: user.id, expiresAt: { gt: now } },
            });
            const evidence: Prisma.AccountDeletionEvidenceCreateManyInput[] = [
              ...consents.map((consent) => ({
                requestId,
                kind: "PHOTO_CONSENT",
                sourceHash: digest(consent.id),
                policyVersion: consent.policyVersion,
                noticeHash: consent.noticeHash,
                recordedAt: consent.createdAt,
                expiresAt: consent.auditExpiresAt,
              })),
              ...events.map((event) => ({
                requestId,
                kind: "PHOTO_EVENT",
                sourceHash: digest(event.id),
                action: event.action,
                recordedAt: event.createdAt,
                expiresAt: event.expiresAt,
              })),
            ];
            if (evidence.length)
              await tx.accountDeletionEvidence.createMany({
                data: evidence,
                skipDuplicates: true,
              });
            // Keep coarse platform security facts, without an account/request/path link.
            // Tenant events or events with metadata remain unreviewed blockers.
            await tx.securityEvent.updateMany({
              where: {
                actorId: user.id,
                businessId: null,
                type: { in: authTelemetryTypes },
                OR: [
                  { metadata: { equals: Prisma.DbNull } },
                  { metadata: { equals: Prisma.JsonNull } },
                ],
              },
              data: {
                actorId: null,
                actorType: null,
                requestId: null,
                route: null,
              },
            });
            await tx.mvpPhotoAnalysis.deleteMany({
              where: { ownerId: user.id },
            });
            await tx.mvpPhoto.deleteMany({ where: { ownerId: user.id } });
            await tx.mvpPhotoConsent.deleteMany({
              where: { ownerId: user.id },
            });
            await tx.mvpPrivacyEvent.deleteMany({
              where: { ownerId: user.id },
            });
            // Preserve the operator event without leaving a direct account identity.
            await tx.securityEvent.updateMany({
              where: {
                type: "ACCOUNT_DELETION_PROCESSING_STARTED",
                AND: [
                  { metadata: { path: ["requestId"], equals: requestId } },
                  { metadata: { path: ["subjectId"], equals: user.id } },
                ],
              },
              data: { metadata: { requestId } },
            });
            await tx.abuseLimitBucket.deleteMany({
              where: {
                keyHash: {
                  in: [
                    digest(`mvp-uploads:${user.id}`),
                    digest(`mvp-external:60000:${user.id}`),
                    digest(`mvp-external:86400000:${user.id}`),
                  ],
                },
              },
            });
            await tx.user.delete({ where: { id: user.id } });
            const completedAt = new Date();
            await tx.accountDeletionRequest.update({
              where: { id: requestId },
              data: { completedAt },
            });
            await tx.securityEvent.create({
              data: {
                actorId: operatorId,
                actorType: "USER",
                type: "ACCOUNT_DELETION_COMPLETED",
                severity: "INFO",
                metadata: { requestId },
              },
            });
            return { status: "COMPLETED", deletionCompleted: true };
          },
          { isolationLevel: "Serializable", maxWait: 5000, timeout: 20000 },
        );
      } catch (error) {
        if (
          attempt < 2 &&
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2034"
        )
          continue;
        throw error;
      }
    }
    throw new ConflictException("İşlem yeniden denenmeli.");
  }

  private async blockers(
    tx: Prisma.TransactionClient,
    requestId: string,
    userId: string,
    email: string,
    customerId?: string,
  ) {
    // Schema-derived discovery also catches loose String/JSON references that an
    // FK-only cascade would miss. Results expose model names, never record bodies.
    // This is an explicit operator inspection, not a periodic background table scan.
    const patterns = [userId, email, ...(customerId ? [customerId] : [])].map(
      (value) => `%${JSON.stringify(value).replace(/[%_\\]/g, "\\$&")}%`,
    );
    const queries = Prisma.dmmf.datamodel.models.map((model) => {
      const table =
        '"' + (model.dbName ?? model.name).replace(/"/g, '""') + '"';
      const name = model.name.replace(/'/g, "''");
      const excludeOwned = ownedRows[model.name]
        ? ` AND NOT COALESCE((${ownedRows[model.name]}), FALSE)`
        : "";
      const excludeProcessing =
        model.name === "SecurityEvent"
          ? ` AND NOT COALESCE(((record."type" = 'ACCOUNT_DELETION_PROCESSING_STARTED' AND record."metadata"->>'requestId' = $2 AND record."metadata"->>'subjectId' = $3) OR (record."actorId" = $3 AND record."businessId" IS NULL AND record."type" IN ('AUTHENTICATION_FAILED','AUTHORIZATION_DENIED','RATE_LIMIT_EXCEEDED') AND (record."metadata" IS NULL OR record."metadata" = 'null'::jsonb))), FALSE)`
          : "";
      return `SELECT '${name}'::text AS model WHERE EXISTS (SELECT 1 FROM ${table} AS record WHERE to_jsonb(record)::text ILIKE ANY($1::text[])${excludeProcessing}${excludeOwned})`;
    });
    const rows = await tx.$queryRawUnsafe<Array<{ model: string }>>(
      queries.join(" UNION ALL "),
      patterns,
      requestId,
      userId,
      customerId ?? "",
    );
    return rows.map((row) => row.model).sort();
  }
}
