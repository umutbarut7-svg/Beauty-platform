/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { describe, expect, it } from "vitest";
import { AuthGuard } from "./auth.guard.js";
import { PermissionsService } from "./permissions.service.js";
import { RolesGuard } from "./roles.guard.js";

process.env.JWT_ACCESS_SECRET = "test-access-secret-at-least-32-characters";

function context(request: any): any {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Test {},
    switchToHttp: () => ({ getRequest: () => request }),
  };
}

describe("authorization security", () => {
  it("rejects a protected endpoint without a token and accepts a valid token", async () => {
    const jwt = new JwtService();
    const guard = new AuthGuard(new Reflector(), jwt);
    await expect(
      guard.canActivate(context({ headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const token = await jwt.signAsync(
      { sub: "u1", email: "a@example.com", role: "CUSTOMER", type: "access" },
      { secret: process.env.JWT_ACCESS_SECRET },
    );
    const request = { headers: { authorization: `Bearer ${token}` } };
    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect((request as any).user.id).toBe("u1");
  });
  it("prevents a customer from business administration", () => {
    const reflector = {
      getAllAndOverride: () => ["BUSINESS_OWNER", "BUSINESS_ADMIN"],
    } as any;
    expect(() =>
      new RolesGuard(reflector).canActivate(
        context({ user: { role: "CUSTOMER" } }),
      ),
    ).toThrow(ForbiddenException);
  });
  it("prevents tenant A from accessing tenant B", async () => {
    const prisma = {
      businessMember: {
        findUnique: async ({ where }: any) =>
          where.userId_businessId.businessId === "tenant-a"
            ? { id: "member", role: "BUSINESS_OWNER" }
            : null,
      },
    };
    const permissions = new PermissionsService(prisma as never);
    await expect(
      permissions.assertBusinessAccess(
        { id: "u1", email: "a@example.com", role: "BUSINESS_OWNER" },
        "tenant-a",
        "business:update",
      ),
    ).resolves.toBeUndefined();
    await expect(
      permissions.assertBusinessAccess(
        { id: "u1", email: "a@example.com", role: "BUSINESS_OWNER" },
        "tenant-b",
        "business:update",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
