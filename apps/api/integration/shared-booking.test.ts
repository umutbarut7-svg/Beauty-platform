import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { APP_GUARD, Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { PrismaClient, type DayOfWeek } from "@prisma/client";
import { DateTime } from "luxon";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SharedBookingController } from "../src/discovery/shared-booking.controller.js";
import { SharedBookingService } from "../src/discovery/shared-booking.service.js";
import { SharedServiceService } from "../src/discovery/shared-service.service.js";
import { AppointmentsService } from "../src/appointments/appointments.service.js";
import { AppointmentsController } from "../src/appointments/appointments.controller.js";
import { AvailabilityService } from "../src/appointments/availability.service.js";
import { AuthGuard } from "../src/auth/auth.guard.js";
import { PermissionsService } from "../src/auth/permissions.service.js";
import { PRISMA_SERVICE } from "../src/database/database.tokens.js";
import type { PrismaService } from "../src/database/prisma.service.js";
import { IS_PUBLIC_KEY } from "../src/auth/auth.decorators.js";

const url =
  "postgresql://postgres:postgres@localhost:5432/beauty_platform_ci?schema=public";
if (process.env.STAGE32_TEST_DATABASE_URL !== url)
  throw new Error("Shared-booking tests require the disposable CI database");
const db = new PrismaClient({ datasourceUrl: url });
const key = randomUUID();
const businessId = `web-${key}`,
  otherId = `other-web-${key}`;
const userId = `buyer-${key}`,
  strangerId = `stranger-${key}`,
  ownerId = `owner-${key}`;
const day = DateTime.utc().plus({ days: 7 }).startOf("day");
const date = day.toISODate()!;
const startsAt = day.set({ hour: 10 }).toISO()!;
let serviceId: string, professionalId: string, locationId: string;
let app: NestFastifyApplication | undefined;
const jwt = new JwtService({
  secret: "synthetic-web-booking-access-at-least-32-characters",
});
const token = (id: string, role = "CUSTOMER") =>
  jwt.sign({ sub: id, email: `${id}@example.test`, role, type: "access" });
function request(
  method: "GET" | "POST",
  path: string,
  actor: string | null = userId,
  payload?: unknown,
) {
  return app!.inject({
    method,
    url: path,
    headers: actor
      ? {
          authorization: `Bearer ${token(actor, actor === ownerId ? "BUSINESS_OWNER" : "CUSTOMER")}`,
        }
      : {},
    ...(payload ? { payload } : {}),
  });
}
const target = () => ({ businessId, serviceId, professionalId, locationId });
const body = () => ({
  idempotencyKey: randomUUID(),
  ...target(),
  startsAt,
  expectedPrice: "1700.25",
  expectedCurrency: "TRY",
  expectedDurationMinutes: 120,
});
const query = () => new URLSearchParams({ ...target(), date }).toString();

beforeAll(async () => {
  vi.stubEnv(
    "JWT_ACCESS_SECRET",
    "synthetic-web-booking-access-at-least-32-characters",
  );
  vi.stubEnv("ORZELL_EVERYWHERE_ENABLED", "true");
  vi.stubEnv("ORZELL_EVERYWHERE_WEB_BOOKING_ENABLED", "true");
  for (const id of [userId, strangerId, ownerId])
    await db.user.create({
      data: {
        id,
        email: `${id}@example.test`,
        passwordHash: "fixture-not-a-credential",
        customer: { create: {} },
      },
    });
  await db.business.createMany({
    data: [
      {
        id: businessId,
        name: "Web booking fixture",
        slug: businessId,
        isPublic: true,
        status: "ACTIVE",
        timezone: "UTC",
      },
      {
        id: otherId,
        name: "Other tenant",
        slug: otherId,
        isPublic: true,
        status: "ACTIVE",
        timezone: "UTC",
      },
    ],
  });
  await db.businessMember.create({
    data: { businessId, userId: ownerId, role: "BUSINESS_OWNER" },
  });
  await db.businessSettings.create({
    data: {
      businessId,
      bookingEnabled: true,
      appointmentIntervalMinutes: 30,
      cancellationEnabled: true,
      cancellationWindowMinutes: 0,
    },
  });
  const category = await db.serviceCategory.create({
    data: { businessId, name: "Hair", slug: "hair" },
  });
  const service = await db.service.create({
    data: {
      businessId,
      categoryId: category.id,
      name: "Balayage",
      slug: "balayage",
      price: "1500.00",
      durationMinutes: 90,
    },
  });
  serviceId = service.id;
  const location = await db.location.create({
    data: {
      businessId,
      name: "Salon",
      address: "Synthetic address",
      city: "Test city",
      timezone: "UTC",
    },
  });
  locationId = location.id;
  const staff = await db.staff.create({
    data: {
      businessId,
      firstName: "Test",
      lastName: "Stylist",
      displayName: "Stylist",
    },
  });
  professionalId = staff.id;
  await db.staffLocation.create({
    data: { businessId, staffId: professionalId, locationId },
  });
  await db.staffProfileService.create({
    data: {
      businessId,
      staffId: professionalId,
      serviceId,
      customPrice: "1700.25",
      customDurationMinutes: 120,
    },
  });
  const dayOfWeek = [
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
  ][day.weekday - 1] as DayOfWeek;
  await db.workingHour.create({
    data: {
      businessId,
      dayOfWeek,
      isOpen: true,
      openTime: "09:00",
      closeTime: "18:00",
    },
  });
  await db.staffWorkingHour.create({
    data: {
      businessId,
      staffId: professionalId,
      dayOfWeek,
      startTime: "09:00",
      endTime: "18:00",
    },
  });
  const database = db as unknown as PrismaService;
  const availability = new AvailabilityService(database);
  const appointments = new AppointmentsService(
    database,
    new PermissionsService(database),
    availability,
  );
  const module = await Test.createTestingModule({
    controllers: [SharedBookingController, AppointmentsController],
    providers: [
      SharedBookingService,
      SharedServiceService,
      { provide: PRISMA_SERVICE, useValue: db },
      { provide: AvailabilityService, useValue: availability },
      { provide: AppointmentsService, useValue: appointments },
      { provide: APP_GUARD, useValue: new AuthGuard(new Reflector(), jwt) },
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
  await db.appointmentStatusHistory.deleteMany({ where: { businessId } });
  await db.appointment.deleteMany({ where: { businessId } });
  await db.staffWorkingHour.deleteMany({ where: { businessId } });
  await db.staffProfileService.deleteMany({ where: { businessId } });
  await db.staffLocation.deleteMany({ where: { businessId } });
  await db.staff.deleteMany({ where: { businessId } });
  await db.service.deleteMany({ where: { businessId } });
  await db.serviceCategory.deleteMany({ where: { businessId } });
  await db.business.deleteMany({
    where: { id: { in: [businessId, otherId] } },
  });
  await db.user.deleteMany({
    where: { id: { in: [userId, strangerId, ownerId] } },
  });
  await db.$disconnect();
  vi.unstubAllEnvs();
});

describe("Authenticated shared booking on real HTTP and PostgreSQL", () => {
  it("requires authentication and rejects forged customer/photo/price fields", async () => {
    expect(
      (
        await request(
          "GET",
          `/discovery/shared-service/availability?${query()}`,
          null,
        )
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await request(
          "POST",
          "/discovery/shared-service/bookings",
          null,
          body(),
        )
      ).statusCode,
    ).toBe(401);
    for (const extra of [
      { customerId: "another-customer" },
      { resultId: "private-photo" },
      { expectedPrice: "-1" },
    ])
      expect(
        (
          await request("POST", "/discovery/shared-service/bookings", userId, {
            ...body(),
            ...extra,
          })
        ).statusCode,
      ).toBe(400);
    for (const method of ["availability", "book", "mine", "cancel"] as const)
      expect(
        Reflect.getMetadata(
          IS_PUBLIC_KEY,
          SharedBookingController.prototype[method],
        ),
      ).not.toBe(true);
  });
  it("resolves current staff/location slots and rejects foreign or withdrawn records", async () => {
    const quote = await request(
      "GET",
      `/discovery/shared-service/availability?${query()}`,
    );
    expect(quote.statusCode).toBe(200);
    expect(quote.json().published.professionals[0].price).toBe("1700.25");
    expect(quote.json().slots).toContainEqual(
      expect.objectContaining({
        startsAt: day.set({ hour: 10 }).toISO()!.replace("+00:00", "Z"),
        staffId: professionalId,
      }),
    );
    for (const changed of [
      { businessId: otherId },
      { professionalId: "foreign-staff" },
      { locationId: "foreign-location" },
    ])
      expect(
        (
          await request(
            "GET",
            `/discovery/shared-service/availability?${new URLSearchParams({ ...target(), date, ...changed })}`,
          )
        ).statusCode,
      ).toBe(404);
    await db.business.update({
      where: { id: businessId },
      data: { isPublic: false },
    });
    expect(
      (
        await request(
          "POST",
          "/discovery/shared-service/bookings",
          userId,
          body(),
        )
      ).statusCode,
    ).toBe(404);
    await db.business.update({
      where: { id: businessId },
      data: { isPublic: true },
    });
    expect(await db.appointment.count({ where: { businessId } })).toBe(0);
  });
  it("rejects stale staff price, currency, duration and unavailable slots without writes", async () => {
    for (const changed of [
      { expectedPrice: "1500.00" },
      { expectedCurrency: "EUR" },
      { expectedDurationMinutes: 90 },
      { startsAt: day.set({ hour: 3 }).toISO()! },
    ])
      expect(
        (
          await request("POST", "/discovery/shared-service/bookings", userId, {
            ...body(),
            ...changed,
          })
        ).statusCode,
      ).toBe(409);
    await db.staffProfileService.update({
      where: { staffId_serviceId: { staffId: professionalId, serviceId } },
      data: { customPrice: "1800.00" },
    });
    expect(
      (
        await request(
          "POST",
          "/discovery/shared-service/bookings",
          userId,
          body(),
        )
      ).statusCode,
    ).toBe(409);
    await db.staffProfileService.update({
      where: { staffId_serviceId: { staffId: professionalId, serviceId } },
      data: { customPrice: "1700.25" },
    });
    expect(await db.appointment.count({ where: { businessId } })).toBe(0);
  });
  it("persists exactly one pending self-booking, exposes it to the business, and permits only owner cancellation", async () => {
    const inputs = [body(), body()];
    const attempts = await Promise.all(
      inputs.map((input) =>
        request("POST", "/discovery/shared-service/bookings", userId, input),
      ),
    );
    expect(attempts.map((response) => response.statusCode).sort()).toEqual([
      201, 409,
    ]);
    const created = attempts
      .find((response) => response.statusCode === 201)!
      .json();
    expect(created).toMatchObject({
      businessId,
      serviceId,
      professionalId,
      locationId,
      price: "1700.25",
      currency: "TRY",
      status: "PENDING",
    });
    const winningInput =
      inputs[attempts.findIndex((response) => response.statusCode === 201)]!;
    const replay = await request(
      "POST",
      "/discovery/shared-service/bookings",
      userId,
      winningInput,
    );
    expect(replay.statusCode).toBe(201);
    expect(replay.json().id).toBe(created.id);
    expect(
      (
        await request("POST", "/discovery/shared-service/bookings", userId, {
          ...winningInput,
          expectedPrice: "1700.24",
        })
      ).statusCode,
    ).toBe(409);
    expect(created).not.toHaveProperty("customer");
    expect(Date.parse(created.endsAt) - Date.parse(created.startsAt)).toBe(
      120 * 60_000,
    );
    expect(await db.appointment.count({ where: { businessId } })).toBe(1);
    const business = await request(
      "GET",
      `/businesses/${businessId}/appointments`,
      ownerId,
    );
    expect(business.statusCode).toBe(200);
    expect(business.json()).toContainEqual(
      expect.objectContaining({ id: created.id, status: "PENDING" }),
    );
    await db.business.update({
      where: { id: businessId },
      data: { isPublic: false },
    });
    const minePath = `/discovery/shared-service/bookings?businessId=${businessId}&serviceId=${serviceId}`;
    expect((await request("GET", minePath)).json().items).toContainEqual(
      expect.objectContaining({ id: created.id }),
    );
    expect((await request("GET", minePath, strangerId)).json().items).toEqual(
      [],
    );
    expect((await request("GET", minePath, ownerId)).json().items).toEqual([]);
    expect(
      (
        await request(
          "POST",
          `/discovery/shared-service/bookings/${created.id}/cancel`,
          strangerId,
          { businessId },
        )
      ).statusCode,
    ).toBe(404);
    await db.businessSettings.update({
      where: { businessId },
      data: { cancellationEnabled: false },
    });
    expect(
      (
        await request(
          "POST",
          `/discovery/shared-service/bookings/${created.id}/cancel`,
          userId,
          { businessId },
        )
      ).statusCode,
    ).toBe(403);
    await db.businessSettings.update({
      where: { businessId },
      data: { cancellationEnabled: true },
    });
    const cancelled = await request(
      "POST",
      `/discovery/shared-service/bookings/${created.id}/cancel`,
      userId,
      { businessId },
    );
    expect(cancelled.statusCode).toBe(201);
    const afterCancellation = await request(
      "POST",
      "/discovery/shared-service/bookings",
      userId,
      winningInput,
    );
    expect(afterCancellation.statusCode).toBe(201);
    expect(afterCancellation.json()).toMatchObject({
      id: created.id,
      status: "CANCELLED",
    });
    expect(await db.appointment.count({ where: { businessId } })).toBe(1);
    await db.idempotencyRecord.updateMany({
      where: {
        businessId,
        actorId: userId,
        operation: "ORZELL_SHARED_BOOKING_V1",
      },
      data: { expiresAt: new Date(0) },
    });
    expect(
      (
        await request(
          "POST",
          "/discovery/shared-service/bookings",
          userId,
          winningInput,
        )
      ).statusCode,
    ).toBe(409);
    expect(await db.appointment.count({ where: { businessId } })).toBe(1);
    expect(cancelled.json()).toMatchObject({
      id: created.id,
      status: "CANCELLED",
    });
    expect(
      (await db.appointment.findUnique({ where: { id: created.id } }))?.status,
    ).toBe("CANCELLED");
  });
  it("replays concurrent identical request keys as the same appointment", async () => {
    await db.business.update({
      where: { id: businessId },
      data: { isPublic: true },
    });
    const input = { ...body(), startsAt: day.set({ hour: 14 }).toISO()! };
    const results = await Promise.all([
      request("POST", "/discovery/shared-service/bookings", userId, input),
      request("POST", "/discovery/shared-service/bookings", userId, input),
    ]);
    expect(results.map((result) => result.statusCode)).toEqual([201, 201]);
    expect(results[0]!.json().id).toBe(results[1]!.json().id);
    expect(await db.appointment.count({ where: { businessId } })).toBe(2);
    expect(
      await db.idempotencyRecord.count({
        where: { businessId, operation: "ORZELL_SHARED_BOOKING_V1" },
      }),
    ).toBe(2);
  });
  it("keeps the web write flow disabled independently of public discovery", async () => {
    vi.stubEnv("ORZELL_EVERYWHERE_WEB_BOOKING_ENABLED", "false");
    expect(
      (
        await request(
          "GET",
          `/discovery/shared-service/availability?${query()}`,
        )
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await request(
          "POST",
          "/discovery/shared-service/bookings",
          userId,
          body(),
        )
      ).statusCode,
    ).toBe(404);
    vi.stubEnv("ORZELL_EVERYWHERE_WEB_BOOKING_ENABLED", "true");
  });
});
