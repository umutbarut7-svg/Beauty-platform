/* eslint-disable @typescript-eslint/consistent-type-imports */
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from "@nestjs/common";
import { HttpException, Injectable, Logger } from "@nestjs/common";
import type { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { MetricsService } from "./metrics.service.js";
import { requestContext } from "./request-context.js";

interface HttpRequest {
  method: string;
  params?: Record<string, string>;
  routeOptions?: { url?: string };
  url?: string;
}
interface HttpResponse {
  statusCode: number;
}

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HTTP");
  constructor(private readonly metrics: MetricsService) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const started = Date.now();
    const http = context.switchToHttp();
    const request = http.getRequest<HttpRequest>();
    const response = http.getResponse<HttpResponse>();
    const route = request.routeOptions?.url ?? request.url?.split("?")[0];
    requestContext.setRequest(request.params?.businessId, route);
    const finish = (failed: boolean, error?: unknown) => {
      const durationMs = Date.now() - started;
      this.metrics.request(durationMs, failed);
      this.logger.log({
        timestamp: new Date().toISOString(),
        requestId: requestContext.get()?.requestId,
        method: request.method,
        tenantId: requestContext.get()?.tenantId,
        actorId: requestContext.get()?.actorId,
        actorType: requestContext.get()?.actorType,
        route,
        statusCode:
          error instanceof HttpException
            ? error.getStatus()
            : failed
              ? 500
              : response.statusCode,
        durationMs,
      });
    };
    return next.handle().pipe(
      tap({
        next: () => finish(false),
        error: (error) => finish(true, error),
      }),
    );
  }
}
