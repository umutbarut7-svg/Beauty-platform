/* eslint-disable @typescript-eslint/consistent-type-imports */
import { randomUUID } from "node:crypto";
import type { OnModuleDestroy } from "@nestjs/common";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import { MetricsService } from "./metrics.service.js";
import { requestContext } from "./request-context.js";
import { sanitizeTelemetry } from "./sanitizer.js";

export interface EnqueueJob {
  businessId: string;
  type: string;
  idempotencyKey: string;
  payload: unknown;
  maxAttempts?: number;
  availableAt?: Date;
  correlationId?: string;
  actorId?: string;
}
export interface ClaimedJob {
  id: string;
  businessId: string;
  type: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
  correlationId: string;
  actorId: string | null;
}
export type JobHandler = (job: ClaimedJob) => Promise<void>;

const sanitizeError = (error: unknown) => {
  return error instanceof Error
    ? error.name.slice(0, 100)
    : "JobExecutionError";
};

@Injectable()
export class BackgroundJobsService implements OnModuleDestroy {
  private readonly logger = new Logger(BackgroundJobsService.name);
  private readonly handlers = new Map<string, JobHandler>();
  private acceptingWork = true;
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly metrics: MetricsService,
  ) {}
  register(type: string, handler: JobHandler) {
    if (this.handlers.has(type))
      throw new Error(`Handler already registered: ${type}`);
    this.handlers.set(type, handler);
  }
  onModuleDestroy() {
    this.acceptingWork = false;
  }
  enqueue(job: EnqueueJob) {
    const maxAttempts = job.maxAttempts ?? 3;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10)
      throw new Error("maxAttempts must be between 1 and 10");
    const context = requestContext.get();
    return this.db.backgroundJob.upsert({
      where: {
        businessId_type_idempotencyKey: {
          businessId: job.businessId,
          type: job.type,
          idempotencyKey: job.idempotencyKey,
        },
      },
      create: {
        ...job,
        maxAttempts,
        correlationId: job.correlationId ?? context?.requestId ?? randomUUID(),
        actorId: job.actorId ?? context?.actorId,
      },
      update: {},
    });
  }
  async processNext(): Promise<boolean> {
    if (!this.acceptingWork) return false;
    const rows = (await this.db.$queryRawUnsafe(
      `UPDATE "BackgroundJob" SET "status" = 'PROCESSING', "lockedAt" = NOW(), "attempts" = "attempts" + 1, "updatedAt" = NOW()
       WHERE "id" = (SELECT "id" FROM "BackgroundJob"
         WHERE (("status" IN ('PENDING','RETRYING') AND "availableAt" <= NOW() AND "attempts" < "maxAttempts")
           OR ("status" = 'PROCESSING' AND "lockedAt" < NOW() - INTERVAL '5 minutes' AND "attempts" <= "maxAttempts"))
         ORDER BY "availableAt", "id" FOR UPDATE SKIP LOCKED LIMIT 1)
       RETURNING "id", "businessId", "type", "payload", "attempts", "maxAttempts", "correlationId", "actorId"`,
    )) as ClaimedJob[];
    const job = rows[0];
    if (!job) return false;
    const handler = this.handlers.get(job.type);
    if (!handler) {
      await this.fail(job, new Error("No registered handler"), false);
      return true;
    }
    try {
      await handler(job);
      await this.db.backgroundJob.update({
        where: { id: job.id },
        data: { status: "SUCCEEDED", completedAt: new Date(), lockedAt: null },
      });
      this.metrics.job(true);
      this.logger.log({
        event: "background_job_succeeded",
        tenantId: job.businessId,
        jobType: job.type,
        correlationId: job.correlationId,
        attempt: job.attempts,
      });
    } catch (error) {
      await this.fail(job, error, job.attempts < job.maxAttempts);
    }
    return true;
  }
  private async fail(job: ClaimedJob, error: unknown, retry: boolean) {
    const delayMs = Math.min(60_000, 1000 * 2 ** Math.max(0, job.attempts - 1));
    await this.db.backgroundJob.update({
      where: { id: job.id },
      data: retry
        ? {
            status: "RETRYING",
            availableAt: new Date(Date.now() + delayMs),
            lockedAt: null,
            lastError: sanitizeError(error),
          }
        : {
            status: "DEAD_LETTER",
            failedAt: new Date(),
            lockedAt: null,
            lastError: sanitizeError(error),
          },
    });
    this.metrics.job(false);
    if (retry) this.metrics.retry();
    this.logger[retry ? "warn" : "error"]({
      event: retry ? "background_job_retry" : "background_job_dead_letter",
      tenantId: job.businessId,
      jobType: job.type,
      correlationId: job.correlationId,
      attempt: job.attempts,
      error: sanitizeTelemetry({
        name: error instanceof Error ? error.name : "UnknownError",
      }),
    });
  }
}
