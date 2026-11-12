/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import { PrivatePhotoStore } from "./providers/private-photo-store.js";
@Injectable()
export class PhotoMaintenanceService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly storage: PrivatePhotoStore,
  ) {}
  async sweep() {
    const now = new Date();
    await this.db.mvpPhotoAnalysis.updateMany({
      where: {
        expiresAt: { lte: now },
        status: { notIn: ["EXPIRED", "REVOKED"] },
      },
      data: {
        status: "EXPIRED",
        intent: "",
        target: "",
        answers: [],
        output: null,
      },
    });
    await this.db.mvpPhotoAnalysis.updateMany({
      where: {
        status: "RUNNING",
        updatedAt: { lt: new Date(Date.now() - 120000) },
      },
      data: { status: "FAILED" },
    });
    const photos = await this.db.mvpPhoto.findMany({
      where: {
        deletedAt: null,
        uploadExpiresAt: { lt: new Date(Date.now() - 30000) },
        OR: [{ expiresAt: { lte: now } }, { revokedAt: { not: null } }],
      },
      take: 50,
      include: { consent: true },
      orderBy: { expiresAt: "asc" },
    });
    let erased = 0;
    for (const photo of photos) {
      try {
        await this.storage.erase(photo.objectKey);
        await this.db.$transaction(async (tx: PrismaService) => {
          const marked = await tx.mvpPhoto.updateMany({
            where: { id: photo.id, deletedAt: null },
            data: { deletedAt: new Date() },
          });
          if (marked.count !== 1) return;
          await tx.mvpPrivacyEvent.create({
            data: {
              ownerId: photo.ownerId,
              resourceId: photo.id,
              action: "photo.object.erased",
              expiresAt: photo.consent.auditExpiresAt,
              correlationId: randomUUID(),
            },
          });
        });
        erased++;
      } catch {
        /* Keep the tombstone pending and retry on the next sweep. Never claim physical erasure. */
      }
    }
    await this.db.mvpVerificationRequest.updateMany({
      where: { evidenceExpiresAt: { lte: now }, status: "SUBMITTED" },
      data: { status: "EXPIRED", answers: {}, reviewNote: null },
    });
    await this.db.mvpVerificationRequest.updateMany({
      where: { evidenceExpiresAt: { lte: now } },
      data: { answers: {}, reviewNote: null },
    });
    await this.db.mvpPrivacyEvent.deleteMany({
      where: { expiresAt: { lte: now } },
    });
    const obsolete = await this.db.mvpPhotoConsent.findMany({
      where: {
        expiresAt: { lte: now },
        auditExpiresAt: { lte: now },
        photos: { every: { deletedAt: { not: null } } },
      },
      take: 50,
    });
    for (const consent of obsolete)
      await this.db.$transaction(async (tx: PrismaService) => {
        await tx.$queryRawUnsafe(
          "SELECT pg_advisory_xact_lock(hashtext($1))::text",
          `mvp-photo:${consent.ownerId}`,
        );
        await tx.mvpPhotoAnalysis.deleteMany({
          where: { ownerId: consent.ownerId, photo: { consentId: consent.id } },
        });
        await tx.mvpPhoto.deleteMany({
          where: {
            ownerId: consent.ownerId,
            consentId: consent.id,
            deletedAt: { not: null },
          },
        });
        await tx.mvpPhotoConsent.delete({ where: { id: consent.id } });
      });
    return { erased, pending: photos.length - erased };
  }
}
