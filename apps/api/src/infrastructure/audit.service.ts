import { Inject, Injectable } from "@nestjs/common";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import { requestContext } from "./request-context.js";
import { sanitizeTelemetry } from "./sanitizer.js";

export type AuditResult = "SUCCEEDED" | "DENIED" | "FAILED";
export interface AuditEvent {
  businessId: string;
  actorId?: string;
  actorType: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  correlationId?: string;
  metadata?: unknown;
  result: AuditResult;
}

@Injectable()
export class AuditService {
  constructor(@Inject(PRISMA_SERVICE) private readonly db: PrismaService) {}
  record(event: AuditEvent) {
    const context = requestContext.get();
    return this.db.auditLog.create({
      data: {
        ...event,
        actorId: event.actorId ?? context?.actorId,
        requestId: context?.requestId,
        correlationId: event.correlationId ?? context?.requestId,
        metadata: event.metadata
          ? sanitizeTelemetry(event.metadata)
          : undefined,
      },
    });
  }
}
