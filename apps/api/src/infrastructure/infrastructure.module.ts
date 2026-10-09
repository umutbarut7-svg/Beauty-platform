import type { MiddlewareConsumer, NestModule } from "@nestjs/common";
import { Global, Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { DatabaseModule } from "../database/database.module.js";
import { BackgroundJobsService } from "./background-jobs.service.js";
import { DatabaseCacheService } from "./cache.service.js";
import { HealthController } from "./health.controller.js";
import { IdempotencyService } from "./idempotency.service.js";
import { MetricsService } from "./metrics.service.js";
import { RequestContextMiddleware } from "./request-context.js";
import { RequestLoggingInterceptor } from "./request-logging.interceptor.js";
import { SafeExceptionFilter } from "./safe-exception.filter.js";
import { AuditService } from "./audit.service.js";
import { SecurityMonitoringService } from "./security-monitoring.service.js";
import { AbuseProtectionService } from "./abuse-protection.service.js";

@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [
    MetricsService,
    AuditService,
    SecurityMonitoringService,
    AbuseProtectionService,
    DatabaseCacheService,
    IdempotencyService,
    BackgroundJobsService,
    { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
    { provide: APP_FILTER, useClass: SafeExceptionFilter },
  ],
  exports: [
    MetricsService,
    AuditService,
    SecurityMonitoringService,
    AbuseProtectionService,
    DatabaseCacheService,
    IdempotencyService,
    BackgroundJobsService,
  ],
})
export class InfrastructureModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes("*");
  }
}
