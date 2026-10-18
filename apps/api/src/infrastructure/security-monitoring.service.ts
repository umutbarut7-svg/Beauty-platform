/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Inject, Injectable, Logger } from "@nestjs/common";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import { MetricsService } from "./metrics.service.js";
import { requestContext } from "./request-context.js";
import { sanitizeTelemetry } from "./sanitizer.js";

export type SecurityEventType =
  | "AUTHENTICATION_FAILED"
  | "AUTHORIZATION_DENIED"
  | "RATE_LIMIT_EXCEEDED"
  | "TENANT_BOUNDARY_DENIED"
  | "IDEMPOTENCY_REPLAY_REJECTED"
  | "SUSPICIOUS_OPERATION";
export type SecuritySeverity = "INFO" | "WARNING" | "CRITICAL";

@Injectable()
export class SecurityMonitoringService {
  private readonly logger = new Logger("SECURITY");
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly metrics: MetricsService,
  ) {}
  async record(
    type: SecurityEventType,
    severity: SecuritySeverity,
    metadata?: unknown,
  ) {
    const context = requestContext.get();
    if (type === "AUTHENTICATION_FAILED") this.metrics.authFailure();
    if (type === "AUTHORIZATION_DENIED") this.metrics.authorizationDenied();
    if (type === "RATE_LIMIT_EXCEEDED") this.metrics.rateLimitExceeded();
    const data = {
      businessId: context?.tenantId,
      actorId: context?.actorId,
      actorType: context?.actorType,
      type,
      severity,
      requestId: context?.requestId,
      route: context?.route,
      metadata: metadata ? sanitizeTelemetry(metadata) : undefined,
    };
    this.logger.warn({ event: "security_event", ...data });
    try {
      return await this.db.securityEvent.create({ data });
    } catch {
      this.metrics.dependencyFailure();
      this.logger.error({
        event: "security_event_persistence_failed",
        type,
        requestId: context?.requestId,
      });
      return null;
    }
  }
}
