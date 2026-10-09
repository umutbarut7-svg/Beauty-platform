/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { BeautyDNAService } from "./beauty-dna.service.js";
import { BeautyDNAIntelligenceService } from "./beauty-dna-intelligence.service.js";
import { BeautyDNARegistry } from "./beauty-dna-registry.service.js";
const user = { id: "u", email: "u@test", role: "CUSTOMER" as const };
function setup() {
  const tx: any = {
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    beautyDNAEvidence: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    beautyDNAProfile: { findFirst: vi.fn() },
  };
  const db: any = {
    businessMember: { findUnique: vi.fn().mockResolvedValue(null) },
    businessCustomer: {
      findFirst: vi.fn().mockResolvedValue({ userCustomer: { userId: "u" } }),
    },
    beautyDNAProfile: {
      findUnique: vi.fn(),
      upsert: vi.fn().mockResolvedValue({ id: "p" }),
    },
    beautyDNAVersion: { findMany: vi.fn() },
    appointment: { findMany: vi.fn().mockResolvedValue([]) },
    prediction: { findFirst: vi.fn() },
    $transaction: vi.fn((callback) => callback(tx)),
  };
  return {
    db,
    tx,
    service: new BeautyDNAService(
      db,
      new BeautyDNAIntelligenceService(),
      new BeautyDNARegistry(),
    ),
  };
}
describe("BeautyDNAService", () => {
  it("returns explicit insufficient evidence without creating a profile on read", async () => {
    const { db, service } = setup();
    db.beautyDNAProfile.findUnique.mockResolvedValue(null);
    await expect(service.get(user, "b", "c")).resolves.toEqual({
      status: "INSUFFICIENT_EVIDENCE",
      profile: null,
    });
    expect(db.beautyDNAProfile.upsert).not.toHaveBeenCalled();
  });
  it("denies cross-customer and cross-tenant IDOR", async () => {
    const { db, service } = setup();
    db.businessCustomer.findFirst.mockResolvedValue({
      userCustomer: { userId: "other" },
    });
    await expect(service.get(user, "b", "c")).rejects.toThrow("denied");
    expect(db.businessCustomer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "c", businessId: "b" }),
      }),
    );
  });
  it("returns a minimal AI context without evidence or raw profile history", async () => {
    const { db, service } = setup();
    db.beautyDNAProfile.findUnique.mockResolvedValue({
      id: "p",
      version: 2,
      status: "ACTIVE",
      confidence: 0.8,
      completeness: 0.2,
      lastCalculatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      traits: [
        {
          category: "HAIR",
          traitType: "preferred_color_family",
          normalizedValue: "brunette",
          confidence: 0.8,
          sourceType: "INFERRED",
          evidenceCount: 3,
          firstObservedAt: new Date(),
          lastObservedAt: new Date(),
          expiresAt: null,
        },
      ],
    });
    const context = await service.getCustomerBeautyContext(user, "b", "c");
    expect(context).toEqual({
      status: "AVAILABLE",
      categories: ["HAIR"],
      preferences: [
        {
          category: "HAIR",
          traitType: "preferred_color_family",
          value: "brunette",
          confidence: 0.8,
          certainty: "POSSIBLE",
        },
      ],
    });
    expect(JSON.stringify(context)).not.toContain("evidenceCount");
  });
  it("does not derive a preference from a single completed booking", async () => {
    const { db, service } = setup();
    db.appointment.findMany.mockResolvedValue([
      { id: "a", serviceId: "s", startsAt: new Date() },
    ]);
    await expect(service.recalculate(user, "b", "c")).resolves.toEqual({
      status: "INSUFFICIENT_EVIDENCE",
      profile: null,
    });
  });
  it("serializes updates and treats repeated evidence as idempotent", async () => {
    const { service, tx } = setup();
    tx.beautyDNAEvidence.findUnique.mockResolvedValue({ id: "existing" });
    tx.beautyDNAProfile.findFirst.mockResolvedValue({ id: "p", traits: [] });
    await service.declare(
      user,
      "b",
      "c",
      "HAIR",
      "preferred_color_family",
      "Brunette",
      "event-1",
    );
    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("pg_advisory_xact_lock"),
      "beauty-dna:p",
    );
    expect(tx.beautyDNAEvidence.create).not.toHaveBeenCalled();
  });
  it("accepts only an active tenant-scoped prediction as labelled inference", async () => {
    const { service, db, tx } = setup();
    db.prediction.findFirst.mockResolvedValue({
      predictionType: "NEXT_LIKELY_SERVICE",
      predictedValue: { serviceId: "s" },
      confidence: 0.6,
      generatedAt: new Date(),
    });
    tx.beautyDNAEvidence.findUnique.mockResolvedValue({ id: "existing" });
    tx.beautyDNAProfile.findFirst.mockResolvedValue({ id: "p", traits: [] });
    await service.applyPredictionInference(
      user,
      "b",
      "c",
      "prediction-1",
      "HAIR",
      "likely_service",
    );
    expect(db.prediction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "prediction-1",
          businessId: "b",
          subjectId: "c",
          status: "ACTIVE",
        }),
      }),
    );
  });
  it("ingests a verified observed result through an idempotent source reference", async () => {
    const { service, tx } = setup();
    tx.beautyDNAEvidence.findUnique.mockResolvedValue({ id: "existing" });
    tx.beautyDNAProfile.findFirst.mockResolvedValue({ id: "p", traits: [] });
    await service.ingestVerifiedObservation({
      user,
      businessId: "b",
      customerId: "c",
      category: "HAIR",
      traitType: "color_history",
      value: "Brunette",
      evidenceSource: "RESULT",
      sourceReferenceId: "result-1",
      occurredAt: new Date(),
      reliability: 0.9,
    });
    expect(tx.beautyDNAEvidence.findUnique).toHaveBeenCalledWith({
      where: {
        businessId_idempotencyKey: {
          businessId: "b",
          idempotencyKey: "RESULT:result-1:HAIR:color_history",
        },
      },
    });
  });
  it("derives a booking preference only from repeated completed outcomes", async () => {
    const { service, db, tx } = setup();
    const startsAt = new Date();
    db.appointment.findMany.mockResolvedValue([
      { id: "a", serviceId: "s", startsAt },
      { id: "b", serviceId: "s", startsAt },
    ]);
    tx.beautyDNAEvidence.findUnique.mockResolvedValue({ id: "existing" });
    tx.beautyDNAProfile.findFirst.mockResolvedValue({ id: "p", traits: [] });
    await expect(service.recalculate(user, "b", "c")).resolves.toEqual({
      status: "UPDATED",
      profile: { id: "p", traits: [] },
    });
  });
});
