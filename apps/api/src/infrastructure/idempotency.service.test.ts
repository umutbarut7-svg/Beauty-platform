import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { IdempotencyService } from "./idempotency.service.js";

describe("IdempotencyService", () => {
  const security = { record: vi.fn().mockResolvedValue({}) };
  const scope = {
    businessId: "business-a",
    actorId: "user-a",
    operation: "booking.create",
  };
  it("uses a tenant and actor composite scope for race-safe reservation", async () => {
    const db = {
      idempotencyRecord: {
        create: vi.fn().mockResolvedValue({ id: "one" }),
        findUnique: vi.fn(),
      },
    };
    await new IdempotencyService(db as never, security as never).reserve(
      scope,
      "request-123",
      "payload",
    );
    expect(db.idempotencyRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining(scope),
    });
  });
  it("replays the same fingerprint and rejects key reuse for another request", async () => {
    const matching = {
      id: "one",
      requestHash:
        "239f59ed55e737c77147cf55ad0c1b030b6d7ee748a7426952f9b852d5a935e5",
    };
    const db = {
      idempotencyRecord: {
        create: vi.fn().mockRejectedValue(new Error("unique")),
        findUnique: vi.fn().mockResolvedValue(matching),
      },
    };
    const service = new IdempotencyService(db as never, security as never);
    await expect(
      service.reserve(scope, "request-123", "payload"),
    ).resolves.toBe(matching);
    db.idempotencyRecord.findUnique.mockResolvedValue({
      ...matching,
      requestHash: "different",
    });
    await expect(
      service.reserve(scope, "request-123", "payload"),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(security.record).toHaveBeenCalledWith(
      "IDEMPOTENCY_REPLAY_REJECTED",
      "WARNING",
      { operation: "booking.create" },
    );
  });
});
