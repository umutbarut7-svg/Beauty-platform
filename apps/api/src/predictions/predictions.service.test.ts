/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { PredictionsService } from "./predictions.service.js";
import { FeatureExtractionService } from "./feature-extraction.service.js";
import { PredictionConfidenceService } from "./confidence.service.js";
import { PredictionTypeRegistry } from "./prediction-registry.service.js";
const user = { id: "u", email: "u@x.test", role: "CUSTOMER" as const };
function setup(appointments: any[] = []) {
  const event = vi.fn();
  const abuse = { consume: vi.fn().mockResolvedValue({ allowed: true }) };
  const db = {
    businessMember: { findUnique: vi.fn().mockResolvedValue(null) },
    businessCustomer: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: "c", userCustomer: { userId: "u" } }),
    },
    appointment: { findMany: vi.fn().mockResolvedValue(appointments) },
    predictionEvent: { create: event },
    prediction: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    predictionStrategyVersion: { upsert: vi.fn() },
    predictionFeedback: {
      upsert: vi.fn().mockResolvedValue({
        id: "feedback",
        kind: "ACCEPTED",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      }),
    },
  };
  return {
    db,
    event,
    service: new PredictionsService(
      db as never,
      new FeatureExtractionService(),
      new PredictionConfidenceService(),
      new PredictionTypeRegistry(),
      abuse as never,
    ),
    abuse,
  };
}
describe("PredictionsService", () => {
  it("returns explicit insufficient evidence and emits an event", async () => {
    const { service, event } = setup();
    await expect(
      service.refresh(user, "b", "c", "NEXT_LIKELY_SERVICE", new Date()),
    ).resolves.toEqual({ status: "INSUFFICIENT_EVIDENCE", prediction: null });
    expect(event).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId: "b",
          type: "prediction.insufficient_evidence",
        }),
      }),
    );
  });
  it("denies a customer who does not own the tenant subject", async () => {
    const { service, db } = setup();
    db.businessCustomer.findFirst.mockResolvedValue({
      id: "c",
      userCustomer: { userId: "other" },
    });
    await expect(service.list(user, "b", "c")).rejects.toThrow("denied");
  });
  it("scopes list queries and expires stale records", async () => {
    const { service, db } = setup();
    db.prediction.findMany.mockResolvedValue([]);
    await service.list(user, "b", "c", 10);
    expect(db.prediction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "b",
          subjectId: "c",
          status: "ACTIVE",
        }),
      }),
    );
    expect(db.prediction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ businessId: "b", subjectId: "c" }),
        take: 10,
      }),
    );
  });
  it("rejects prohibited or unsupported inference types", async () => {
    const { service } = setup();
    await expect(
      service.refresh(user, "b", "c", "medicalDiagnosis"),
    ).rejects.toThrow("Unsupported");
  });
  it("enforces deterministic recomputation limits", async () => {
    const { service, abuse } = setup();
    abuse.consume.mockResolvedValue({ allowed: false });
    await expect(
      service.refresh(user, "b", "c", "NEXT_LIKELY_SERVICE"),
    ).rejects.toThrow("rate exceeded");
  });
  it("records sanitized tenant-scoped feedback and an observability event", async () => {
    const { service, db, event } = setup();
    db.prediction.findFirst.mockResolvedValue({ id: "p" });
    await service.feedback(user, "b", "c", "p", "ACCEPTED", {
      authorization: "secret",
      reason: "useful",
    });
    expect(db.predictionFeedback.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          businessId: "b",
          predictionId: "p",
          metadata: { authorization: "[REDACTED]", reason: "useful" },
        }),
      }),
    );
    expect(event).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId: "b",
          predictionId: "p",
          type: "prediction.feedback_received",
        }),
      }),
    );
  });
});
