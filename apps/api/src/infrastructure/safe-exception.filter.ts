/* eslint-disable @typescript-eslint/consistent-type-imports */
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import { Catch, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { requestContext } from "./request-context.js";
import { SecurityMonitoringService } from "./security-monitoring.service.js";

interface ReplyLike {
  status(code: number): ReplyLike;
  send(value: unknown): void;
}

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SafeExceptionFilter.name);
  constructor(private readonly security: SecurityMonitoringService) {}
  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const reply = host.switchToHttp().getResponse<ReplyLike>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      if (status === 401)
        await this.security.record("AUTHENTICATION_FAILED", "WARNING");
      else if (status === 403)
        await this.security.record("AUTHORIZATION_DENIED", "WARNING");
      else if (status === 429)
        await this.security.record("RATE_LIMIT_EXCEEDED", "WARNING");
      const rawMessage =
        typeof response === "string"
          ? response
          : (response as { message?: unknown }).message;
      const details = Array.isArray(rawMessage) ? rawMessage : undefined;
      const message =
        typeof rawMessage === "string" ? rawMessage : exception.message;
      reply.status(status).send({
        code: this.code(status),
        message,
        requestId: requestContext.get()?.requestId,
        ...(details ? { details } : {}),
      });
      return;
    }
    const requestId = requestContext.get()?.requestId;
    this.logger.error({ event: "unhandled_exception", requestId });
    reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      code: "INTERNAL_ERROR",
      message: "Internal server error",
      requestId,
    });
  }
  private code(status: number) {
    if (status === 400) return "VALIDATION_ERROR";
    if (status === 401) return "AUTHENTICATION_REQUIRED";
    if (status === 403) return "AUTHORIZATION_DENIED";
    if (status === 404) return "NOT_FOUND";
    if (status === 409) return "CONFLICT";
    if (status === 429) return "RATE_LIMITED";
    if (status >= 500) return "INFRASTRUCTURE_ERROR";
    return "REQUEST_ERROR";
  }
}
