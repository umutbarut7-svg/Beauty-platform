/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, ValidationPipe } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterEach, describe, expect, it } from "vitest";
import { BranchesController } from "./salon-core.controller.js";
import { SalonCoreService } from "./salon-core.service.js";

@Injectable()
class TestIdentityGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest().user = {
      id: "owner",
      email: "owner@test.invalid",
      role: "BUSINESS_OWNER",
    };
    return true;
  }
}

describe("branch HTTP validation", () => {
  let app: NestFastifyApplication | undefined;
  afterEach(async () => app?.close());
  it("returns 400 for invalid and non-whitelisted branch input", async () => {
    const core = {
      createBranch: async (_user: any, businessId: string, dto: any) => ({
        businessId,
        ...dto,
      }),
    };
    const module = await Test.createTestingModule({
      controllers: [BranchesController],
      providers: [{ provide: SalonCoreService, useValue: core }],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalGuards(new TestIdentityGuard());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    const response = await app.inject({
      method: "POST",
      url: "/businesses/a/branches",
      payload: { name: "X", city: "I", address: "x", businessId: "b" },
    });
    expect(response.statusCode).toBe(400);
  });
});
