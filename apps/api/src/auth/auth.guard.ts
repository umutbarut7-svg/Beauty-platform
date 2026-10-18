import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Injectable, UnauthorizedException } from "@nestjs/common";
/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { IS_PUBLIC_KEY } from "./auth.decorators.js";
import type { RequestWithUser, TokenPayload } from "./auth.types.js";
import { requestContext } from "../infrastructure/request-context.js";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context
      .switchToHttp()
      .getRequest<RequestWithUser & { headers: { authorization?: string } }>();
    const [kind, token] = request.headers.authorization?.split(" ") ?? [];
    if (kind !== "Bearer" || !token)
      throw new UnauthorizedException("Authentication required");
    try {
      const payload = await this.jwt.verifyAsync<TokenPayload>(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
      if (payload.type !== "access") throw new Error("wrong token type");
      request.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };
      requestContext.setIdentity(payload.sub, payload.role);
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired access token");
    }
  }
}
