/* eslint-disable @typescript-eslint/consistent-type-imports, @typescript-eslint/no-explicit-any */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { catchError, tap, throwError } from "rxjs";
import { PublicApiService } from "./public-api.service.js";
@Injectable()
export class PublicApiUsageInterceptor implements NestInterceptor {
  constructor(private readonly service: PublicApiService) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest<any>(),
      started = Date.now(),
      operation = `${req.method} ${req.routeOptions?.url ?? req.url?.split("?")[0]}`;
    return next.handle().pipe(
      tap(
        () =>
          void this.service
            .recordUsage(req.apiPrincipal, operation, 200, Date.now() - started)
            .catch(() => undefined),
      ),
      catchError((error) => {
        void this.service
          .recordUsage(
            req.apiPrincipal,
            operation,
            error?.status ?? 500,
            Date.now() - started,
          )
          .catch(() => undefined);
        return throwError(() => error);
      }),
    );
  }
}
