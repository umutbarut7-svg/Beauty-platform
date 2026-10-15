/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, ValidationPipe } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import { AppointmentsController } from "./appointments.controller.js";
import { AppointmentsService } from "./appointments.service.js";

@Injectable()
class IdentityGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest().user = {
      id: "customer",
      email: "customer@test.invalid",
      role: "CUSTOMER",
    };
    return true;
  }
}

describe("appointment HTTP validation", () => {
  let app: NestFastifyApplication | undefined;
  afterEach(async () => app?.close());
  it("returns 400 for invalid appointment payloads", async () => {
    const module = await Test.createTestingModule({
      controllers: [AppointmentsController],
      providers: [
        ResourceIdPipe,
        {
          provide: AppointmentsService,
          useValue: {
            create: async (_user: any, _businessId: string, dto: any) => dto,
            changeStatus: async (
              _user: any,
              _businessId: string,
              _appointmentId: string,
              status: string,
            ) => ({ status }),
          },
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
      url: "/businesses/business/appointments",
      payload: {
        serviceId: "../other",
        staffMemberId: "staff",
        startsAt: "yesterday",
        price: "0.01",
      },
    });
    expect(response.statusCode).toBe(400);
    const statusResponse = await app.inject({
      method: "PATCH",
      url: "/businesses/business/appointments/appointment/status",
      payload: { status: "CONFIRMED", confirmedAt: new Date().toISOString() },
    });
    expect(statusResponse.statusCode).toBe(400);
  });
});
