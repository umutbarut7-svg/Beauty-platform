import { ServiceUnavailableException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { describe, expect, it } from "vitest";
import { HealthController } from "./health.controller.js";
import { MetricsService } from "./metrics.service.js";
import { PRISMA_SERVICE } from "../database/database.tokens.js";

describe("health HTTP probes", () => {
  it("exposes non-sensitive liveness/readiness and returns 503 on dependency failure", async () => {
    const db = { $queryRawUnsafe: async () => [{ value: 1 }] };
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [MetricsService, { provide: PRISMA_SERVICE, useValue: db }],
    }).compile();
    const app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    expect(
      (await app.inject({ method: "GET", url: "/health" })).json(),
    ).toEqual({ status: "ok" });
    expect(
      (await app.inject({ method: "GET", url: "/health/ready" })).json(),
    ).toEqual({ status: "ready" });
    db.$queryRawUnsafe = async () => {
      throw new ServiceUnavailableException();
    };
    const unavailable = await app.inject({
      method: "GET",
      url: "/health/ready",
    });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).not.toHaveProperty("stack");
    await app.close();
  });
});
