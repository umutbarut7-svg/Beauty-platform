import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { describe, expect, it, vi } from "vitest";
import { DiscoveryController } from "./discovery.controller.js";
import { DiscoveryService } from "./discovery.service.js";

describe("discovery HTTP validation", () => {
  it("validates geo and structured intent without authentication", async () => {
    const search = vi
      .fn()
      .mockResolvedValue({ items: [], meta: { noMatch: true } });
    const match = vi
      .fn()
      .mockResolvedValue({ items: [], meta: { noMatch: true } });
    const module = await Test.createTestingModule({
      controllers: [DiscoveryController],
      providers: [{ provide: DiscoveryService, useValue: { search, match } }],
    }).compile();
    const app = module.createNestApplication<NestFastifyApplication>(
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
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/discovery/search?latitude=91&longitude=29&radiusKm=5",
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/discovery/match",
          payload: { source: "LLM", query: "cut" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/discovery/match",
          payload: { source: "TEXT", serviceId: "service-a" },
        })
      ).statusCode,
    ).toBe(201);
    expect(match).toHaveBeenCalled();
    await app.close();
  });
});
