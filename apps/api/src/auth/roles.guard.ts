import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { ForbiddenException, Injectable } from "@nestjs/common";
/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Reflector } from "@nestjs/core";
import type { UserRole } from "@beauty-platform/types";
import { ROLES_KEY } from "./auth.decorators.js";
import type { RequestWithUser } from "./auth.types.js";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!allowed?.length) return true;
    const { user } = context.switchToHttp().getRequest<RequestWithUser>();
    if (!user || !allowed.includes(user.role))
      throw new ForbiddenException("Insufficient permission");
    return true;
  }
}
