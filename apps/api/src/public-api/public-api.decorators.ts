import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { ApiPrincipal } from "./public-api.types.js";
export const ApiPrincipalParam = createParamDecorator(
  (_d: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<{ apiPrincipal: ApiPrincipal }>()
      .apiPrincipal,
);
