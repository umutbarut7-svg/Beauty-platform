import { Injectable, ValidationPipe } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterEach, describe, expect, it } from "vitest";
import { CatalogServicesController } from "./catalog.controller.js";
import { CatalogService } from "./catalog.service.js";
import { ResourceIdPipe } from "./resource-id.pipe.js";

@Injectable()
class IdentityGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest().user = {
      id: "owner",
      email: "owner@test.invalid",
      role: "BUSINESS_OWNER",
    };
    return true;
  }
}

describe("catalog HTTP validation", () => {
  let app: NestFastifyApplication | undefined;
  afterEach(async () => app?.close());
  it("returns 400 for unsafe IDs and invalid monetary input", async () => {
    const module = await Test.createTestingModule({
      controllers: [CatalogServicesController],
      providers: [
        ResourceIdPipe,
        {
          provide: CatalogService,
          useValue: { createService: async () => ({}) },
        },
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalGuards(new IdentityGuard());
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
      url: "/businesses/bad$id/services",
      payload: {
        categoryId: "cat",
        name: "Cut",
        durationMinutes: 0,
        price: "-1",
      },
    });
    expect(response.statusCode).toBe(400);
  });
});
