/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Inject, Injectable } from "@nestjs/common";
import type { OnModuleInit } from "@nestjs/common";
import {
  BackgroundJobsService,
  type ClaimedJob,
} from "../infrastructure/background-jobs.service.js";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
@Injectable()
export class PassportWorker implements OnModuleInit {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly jobs: BackgroundJobsService,
  ) {}
  onModuleInit() {
    this.jobs.register("MVP_PASSPORT_PUBLISH_V1", (job) => this.publish(job));
  }
  async publish(job: ClaimedJob) {
    if (process.env.STAGE33_MVP_ENABLED !== "true")
      throw new Error("MVP_FEATURE_DISABLED");
    const payload = job.payload as { resultId?: unknown } | null;
    if (!payload || typeof payload.resultId !== "string" || !job.actorId)
      throw new Error("InvalidPassportJob");
    return this.db.$transaction(async (tx: PrismaService) => {
      const record = await tx.beautyJobResult.findFirst({
        where: {
          id: payload.resultId,
          businessId: job.businessId,
          appointment: {
            businessId: job.businessId,
            status: "COMPLETED",
            customer: { userId: job.actorId },
          },
          satisfaction: { customerUserId: job.actorId },
        },
        select: { id: true },
      });
      if (!record) throw new Error("PassportJobAuthorizationDenied");
      const updated = await tx.beautyJobResult.updateMany({
        where: {
          id: record.id,
          businessId: job.businessId,
          passportPublishedAt: null,
        },
        data: { passportPublishedAt: new Date() },
      });
      if (updated.count === 1)
        await tx.auditLog.create({
          data: {
            businessId: job.businessId,
            actorId: job.actorId,
            actorType: "WORKER",
            action: "mvp.passport.published",
            resourceType: "BeautyJobResult",
            resourceId: record.id,
            correlationId: job.correlationId,
            metadata: { version: "v1", jobId: job.id },
            result: "SUCCEEDED",
          },
        });
    });
  }
}
