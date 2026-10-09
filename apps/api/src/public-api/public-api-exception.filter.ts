/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import { requestContext } from "../infrastructure/request-context.js";
@Catch()
export class PublicApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host
      .switchToHttp()
      .getResponse<{ status(n: number): any; send(v: unknown): void }>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const raw = error instanceof HttpException ? error.getResponse() : null;
    const provided =
      typeof raw === "object" && raw && "code" in raw
        ? String((raw as any).code)
        : null;
    const code =
      provided ??
      {
        400: "INVALID_REQUEST",
        401: "UNAUTHENTICATED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        409: "CONFLICT",
        429: "RATE_LIMITED",
      }[status] ??
      "INTERNAL_ERROR";
    const message =
      status === 500
        ? "Internal error"
        : error instanceof Error
          ? error.message
          : "Request failed";
    response.status(status).send({
      error: {
        code,
        message,
        requestId: requestContext.get()?.requestId ?? "unknown",
      },
    });
  }
}
