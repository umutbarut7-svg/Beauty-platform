import {
  createParamDecorator,
  SetMetadata,
  type ExecutionContext,
} from "@nestjs/common";
import type { UserRole } from "@beauty-platform/types";
import type { RequestWithUser } from "./auth.types.js";

export const IS_PUBLIC_KEY = "auth:is-public";
export const ROLES_KEY = "auth:roles";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<RequestWithUser>().user,
);
