import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { SharedServiceService } from "../src/discovery/shared-service.service.js";
import {
  SharedServiceController,
  SharedServiceQueryDto,
} from "../src/discovery/shared-service.controller.js";
import type { PrismaService } from "../src/database/prisma.service.js";
import { IS_PUBLIC_KEY } from "../src/auth/auth.decorators.js";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { APP_GUARD, Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AuthGuard } from "../src/auth/auth.guard.js";
import { PRISMA_SERVICE } from "../src/database/database.tokens.js";

const url =
  "postgresql://postgres:postgres@localhost:5432/beauty_platform_ci?schema=public";
if (process.env.STAGE32_TEST_DATABASE_URL !== url)
  throw new Error("Shared-service tests require the disposable CI database");
const db = new PrismaClient({ datasourceUrl: url });
const resolver = new SharedServiceService(db as unknown as PrismaService);
const suffix = randomUUID();
const tenant = `share-${suffix}`,
  other = `private-${suffix}`;
let categoryId: string, serviceId: string, staffId: string, strangerId: string;
let app: NestFastifyApplication | undefined;

beforeAll(async () => {
  vi.stubEnv("ORZELL_EVERYWHERE_ENABLED", "true");
  await db.business.createMany({
    data: [
      {
        id: tenant,
        name: "Published salon",
        slug: tenant,
        isPublic: true,
        status: "ACTIVE",
      },
      {
        id: other,
        name: "Private salon",
        slug: other,
        isPublic: false,
        status: "ACTIVE",
      },
    ],
  });
  const category = await db.serviceCategory.create({
    data: { businessId: tenant, name: "Hair", slug: "hair" },
  });
  categoryId = category.id;
  const service = await db.service.create({
    data: {
      businessId: tenant,
      categoryId,
      name: "Balayage",
      slug: "balayage",
      price: "1500.50",
      durationMinutes: 90,
    },
  });
  serviceId = service.id;
  const staff = await db.staff.create({
    data: {
      businessId: tenant,
      firstName: "Test",
      lastName: "Stylist",
      displayName: "Test stylist",
      email: "private@example.test",
    },
  });
  staffId = staff.id;
  const stranger = await db.staff.create({
    data: {
      businessId: other,
      firstName: "Other",
      lastName: "Tenant",
      displayName: "Other tenant",
    },
  });
  strangerId = stranger.id;
  await db.staffProfileService.create({
    data: {
      businessId: tenant,
      staffId,
      serviceId,
      customPrice: "1700.25",
      customDurationMinutes: 120,
    },
  });
  const module = await Test.createTestingModule({
    controllers: [SharedServiceController],
    providers: [
      SharedServiceService,
      { provide: PRISMA_SERVICE, useValue: db },
      {
        provide: APP_GUARD,
        useValue: new AuthGuard(new Reflector(), new JwtService()),
      },
    ],
  }).compile();
  app = module.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
afterAll(async () => {
  await app?.close();
  await db.staffProfileService.deleteMany({ where: { businessId: tenant } });
  await db.service.deleteMany({ where: { businessId: tenant } });
  await db.serviceCategory.deleteMany({ where: { businessId: tenant } });
  await db.staff.deleteMany({ where: { businessId: { in: [tenant, other] } } });
  await db.business.deleteMany({ where: { id: { in: [tenant, other] } } });
  await db.$disconnect();
  vi.unstubAllEnvs();
});

describe("Published share lookup on real PostgreSQL", () => {
  it("serves public HTTP requests through the real auth guard and rejects ambiguous query inputs", async () => {
    const path = `/discovery/shared-service?businessId=${tenant}&serviceId=${serviceId}`;
    const response = await app!.inject({ method: "GET", url: path });
    expect(response.statusCode).toBe(200);
    expect(response.json().service.id).toBe(serviceId);
    for (const suffix of [
      `&businessId=${other}`,
      "&redirect=https://foreign.test",
      "&professionalId=",
    ]) {
      expect(
        (await app!.inject({ method: "GET", url: path + suffix })).statusCode,
      ).toBe(400);
    }
    expect(
      (
        await app!.inject({
          method: "GET",
          url: path + "&professionalId=missing",
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app!.inject({
          method: "GET",
          url: path + "&resultId=private-photo",
        })
      ).statusCode,
    ).toBe(404);
  });
  it("projects only public service data and verified staff-specific prices", async () => {
    const result = await resolver.resolve({
      businessId: tenant,
      serviceId,
      professionalId: staffId,
    });
    expect(result.service).toEqual({
      id: serviceId,
      name: "Balayage",
      price: "1500.5",
      currency: "TRY",
      durationMinutes: 90,
    });
    expect(result.professionals).toEqual([
      {
        id: staffId,
        displayName: "Test stylist",
        price: "1700.25",
        durationMinutes: 120,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("private@example.test");
    await db.service.update({
      where: { id: serviceId },
      data: { price: "1600.75" },
    });
    expect(
      (await resolver.resolve({ businessId: tenant, serviceId })).service.price,
    ).toBe("1600.75");
  });
  it("returns the same generic failure for private/missing/cross-tenant content", async () => {
    for (const target of [
      { businessId: other, serviceId },
      { businessId: tenant, serviceId: "missing" },
      { businessId: tenant, serviceId, professionalId: strangerId },
      { businessId: tenant, serviceId, resultId: "unapproved-photo" },
    ])
      await expect(resolver.resolve(target)).rejects.toThrow(
        "Shared service is unavailable",
      );
    for (const data of [
      { isPublic: false },
      { status: "SUSPENDED" as const },
    ]) {
      await db.business.update({ where: { id: tenant }, data });
      await expect(
        resolver.resolve({ businessId: tenant, serviceId }),
      ).rejects.toThrow("Shared service is unavailable");
      await db.business.update({
        where: { id: tenant },
        data: { isPublic: true, status: "ACTIVE" },
      });
    }
  });
  it("respects service, category, staff and assignment withdrawal immediately", async () => {
    for (const data of [{ isActive: false }, { isBookable: false }]) {
      await db.service.update({ where: { id: serviceId }, data });
      await expect(
        resolver.resolve({ businessId: tenant, serviceId }),
      ).rejects.toThrow();
      await db.service.update({
        where: { id: serviceId },
        data: { isActive: true, isBookable: true },
      });
    }
    await db.serviceCategory.update({
      where: { id: categoryId },
      data: { isActive: false },
    });
    await expect(
      resolver.resolve({ businessId: tenant, serviceId }),
    ).rejects.toThrow();
    await db.serviceCategory.update({
      where: { id: categoryId },
      data: { isActive: true },
    });
    for (const data of [{ isActive: false }, { acceptsBookings: false }]) {
      await db.staff.update({ where: { id: staffId }, data });
      await expect(
        resolver.resolve({
          businessId: tenant,
          serviceId,
          professionalId: staffId,
        }),
      ).rejects.toThrow();
      expect(
        (await resolver.resolve({ businessId: tenant, serviceId }))
          .professionals,
      ).toEqual([]);
      await db.staff.update({
        where: { id: staffId },
        data: { isActive: true, acceptsBookings: true },
      });
    }
    await db.staffProfileService.update({
      where: { staffId_serviceId: { staffId, serviceId } },
      data: { isActive: false },
    });
    await expect(
      resolver.resolve({
        businessId: tenant,
        serviceId,
        professionalId: staffId,
      }),
    ).rejects.toThrow();
  });
  it("is disabled by default and validates duplicate/unknown query inputs", async () => {
    vi.stubEnv("ORZELL_EVERYWHERE_ENABLED", "false");
    await expect(
      resolver.resolve({ businessId: tenant, serviceId }),
    ).rejects.toThrow();
    vi.stubEnv("ORZELL_EVERYWHERE_ENABLED", "true");
    for (const query of [
      { businessId: [tenant, other], serviceId },
      { businessId: tenant, serviceId, redirect: "https://foreign.test" },
      { businessId: tenant, serviceId, professionalId: "" },
    ])
      expect(
        (
          await validate(plainToInstance(SharedServiceQueryDto, query), {
            whitelist: true,
            forbidNonWhitelisted: true,
          })
        ).length,
      ).toBeGreaterThan(0);
    const handler = SharedServiceController.prototype.resolve;
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
    expect(Reflect.getMetadata("THROTTLER:LIMITdefault", handler)).toBe(30);
  });
});
