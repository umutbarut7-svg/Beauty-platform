/* eslint-disable @typescript-eslint/consistent-type-imports, @typescript-eslint/no-explicit-any */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiCredentialService } from "./api-credential.service.js";
import { PublicApiRateLimitService } from "./public-api-rate-limit.service.js";
@Injectable()
export class PublicApiCredentialGuard implements CanActivate {
  constructor(
    private readonly credentials: ApiCredentialService,
    private readonly limits: PublicApiRateLimitService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<any>();
    const raw = String(request.headers["x-api-key"] ?? "");
    if (!raw) throw new UnauthorizedException("API credential required");
    const principal = await this.credentials.authenticate(raw);
    if (
      request.headers["x-business-id"] &&
      request.headers["x-business-id"] !== principal.businessId
    )
      throw new UnauthorizedException("Tenant spoofing denied");
    request.apiPrincipal = principal;
    request.publicRateLimit = await this.limits.consume(
      principal,
      request.routeOptions?.url ?? request.url?.split("?")[0] ?? "unknown",
    );
    return true;
  }
}
