import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { describe, expect, it, vi } from "vitest";
import { AgentController } from "./agent.controller.js";
import { AgentOrchestrator } from "./agent-orchestrator.service.js";
describe("agent HTTP contract", () => {
  it("rejects raw binary fields, invalid sources, and malformed action ids", async () => {
    const module = await Test.createTestingModule({
      controllers: [AgentController],
      providers: [
        {
          provide: AgentOrchestrator,
          useValue: {
            create: vi.fn(),
            message: vi.fn(),
            get: vi.fn(),
            confirm: vi.fn(),
            reject: vi.fn(),
          },
        },
      ],
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
          method: "POST",
          url: "/businesses/b/ai/sessions",
          payload: { agentType: "BOOKING", source: "AUDIO", raw: "binary" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/businesses/b/ai/sessions/s/confirm",
          payload: { actionId: "bad id" },
        })
      ).statusCode,
    ).toBe(400);
    await app.close();
  });
});
