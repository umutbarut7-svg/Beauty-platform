import { describe, expect, it, vi } from "vitest";
import { BackgroundJobsService } from "./background-jobs.service.js";
import { MetricsService } from "./metrics.service.js";

describe("BackgroundJobsService", () => {
  it("enqueues with tenant-scoped idempotency and atomically completes a claimed job", async () => {
    const db = {
      backgroundJob: {
        upsert: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      $queryRawUnsafe: vi.fn().mockResolvedValue([
        {
          id: "j1",
          businessId: "a",
          type: "notify",
          payload: {},
          attempts: 1,
          maxAttempts: 3,
          correlationId: "correlation-1",
          actorId: "actor-1",
        },
      ]),
    };
    const metrics = new MetricsService();
    const service = new BackgroundJobsService(db as never, metrics);
    await service.enqueue({
      businessId: "a",
      type: "notify",
      idempotencyKey: "event-1",
      payload: {},
    });
    expect(db.backgroundJob.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId_type_idempotencyKey: {
            businessId: "a",
            type: "notify",
            idempotencyKey: "event-1",
          },
        },
      }),
    );
    service.register("notify", vi.fn().mockResolvedValue(undefined));
    await expect(service.processNext()).resolves.toBe(true);
    expect(db.$queryRawUnsafe.mock.calls[0]?.[0]).toContain(
      "FOR UPDATE SKIP LOCKED",
    );
    expect(db.backgroundJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SUCCEEDED" }),
      }),
    );
  });
  it("uses bounded retries and dead-letters exhausted jobs", async () => {
    const db = {
      backgroundJob: { update: vi.fn().mockResolvedValue({}) },
      $queryRawUnsafe: vi
        .fn()
        .mockResolvedValueOnce([
          {
            id: "j1",
            businessId: "a",
            type: "fail",
            payload: {},
            attempts: 1,
            maxAttempts: 2,
            correlationId: "correlation-1",
            actorId: null,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "j1",
            businessId: "a",
            type: "fail",
            payload: {},
            attempts: 2,
            maxAttempts: 2,
            correlationId: "correlation-1",
            actorId: null,
          },
        ]),
    };
    const service = new BackgroundJobsService(
      db as never,
      new MetricsService(),
    );
    service.register(
      "fail",
      vi.fn().mockRejectedValue(new Error("secret details\nline")),
    );
    await service.processNext();
    expect(db.backgroundJob.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "RETRYING" }),
      }),
    );
    await service.processNext();
    expect(db.backgroundJob.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "DEAD_LETTER",
          lastError: "Error",
        }),
      }),
    );
  });
  it("stops claiming work during graceful shutdown", async () => {
    const db = { $queryRawUnsafe: vi.fn() };
    const service = new BackgroundJobsService(
      db as never,
      new MetricsService(),
    );
    service.onModuleDestroy();
    await expect(service.processNext()).resolves.toBe(false);
    expect(db.$queryRawUnsafe).not.toHaveBeenCalled();
  });
});
