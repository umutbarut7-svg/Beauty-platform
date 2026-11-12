import { afterEach, describe, expect, it, vi } from "vitest";
import { MvpService } from "./mvp.service.js";
import { PassportWorker } from "./passport-worker.service.js";
import { BackgroundJobsService } from "../infrastructure/background-jobs.service.js";
import { MetricsService } from "../infrastructure/metrics.service.js";
const user = { id: "u", email: "u@example.test", role: "CUSTOMER" as const };
afterEach(() => vi.unstubAllEnvs());
describe("MVP fail-closed boundaries (unit doubles only)", () => {
  it("keeps private workflows disabled unless explicitly enabled", async () => {
    vi.stubEnv("STAGE33_MVP_ENABLED", "false");
    const service = new MvpService({} as never, {} as never, {} as never);
    expect(service.capabilities().privatePhotos.available).toBe(false);
    await expect(service.passport(user)).rejects.toThrow(
      "MVP_FEATURE_DISABLED",
    );
  });
  it("denies result mutation before accessing the transaction without business authority", async () => {
    vi.stubEnv("STAGE33_MVP_ENABLED", "true");
    const db = { $transaction: vi.fn() };
    const appointments = { get: vi.fn() };
    const service = new MvpService(
      db as never,
      appointments as never,
      {
        assertBusinessAccess: vi.fn().mockRejectedValue(new Error("denied")),
      } as never,
    );
    await expect(
      service.recordResult(user, "b", "a", {
        summary: "test",
        idempotencyKey: "k",
      }),
    ).rejects.toThrow("denied");
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(appointments.get).not.toHaveBeenCalled();
  });
  it("does not allow administrator role to supply another customer's voice", async () => {
    vi.stubEnv("STAGE33_MVP_ENABLED", "true");
    const db = {
      appointment: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    };
    const service = new MvpService(db as never, {} as never, {} as never);
    await expect(
      service.satisfy({ ...user, role: "SUPER_ADMIN" }, "b", "a", {
        outcome: "SATISFIED",
        idempotencyKey: "k",
      }),
    ).rejects.toThrow("Only the booking customer");
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("does not publish a forged tenant/actor result job", async () => {
    vi.stubEnv("STAGE33_MVP_ENABLED", "true");
    const db = {
      beautyJobResult: {
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn(),
      },
      $transaction: vi.fn(async (f) => f(db)),
    };
    const worker = new PassportWorker(db as never, {} as never);
    await expect(
      worker.publish({
        id: "j",
        businessId: "foreign",
        actorId: "attacker",
        type: "MVP_PASSPORT_PUBLISH_V1",
        payload: { resultId: "r" },
        correlationId: "c",
        attempts: 1,
        maxAttempts: 3,
      }),
    ).rejects.toThrow("AuthorizationDenied");
    expect(db.beautyJobResult.updateMany).not.toHaveBeenCalled();
  });
  it("does not claim other consumers' jobs from the shared queue", async () => {
    const db = { $queryRawUnsafe: vi.fn().mockResolvedValue([]) };
    const service = new BackgroundJobsService(
      db as never,
      new MetricsService(),
    );
    expect(await service.processNext(true)).toBe(false);
    expect(db.$queryRawUnsafe).not.toHaveBeenCalled();
    service.register("MVP_PASSPORT_PUBLISH_V1", async () => {});
    expect(await service.processNext(true)).toBe(false);
    expect(db.$queryRawUnsafe.mock.calls[0]?.[0]).toContain(
      '"type" = ANY($1::text[])',
    );
    expect(db.$queryRawUnsafe.mock.calls[0]?.[1]).toEqual([
      "MVP_PASSPORT_PUBLISH_V1",
    ]);
  });
});
