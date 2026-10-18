/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { BusinessIntelligenceService } from "./business-intelligence.service.js";
import { BusinessIntelligenceEngine } from "./business-intelligence.engine.js";
const owner = { id: "u", email: "u@test", role: "BUSINESS_OWNER" as const };
function setup() {
  const tx: any = {
    $queryRawUnsafe: vi.fn(),
    businessMetricObservation: { findUnique: vi.fn(), create: vi.fn() },
    businessMetricDefinition: {
      upsert: vi.fn().mockResolvedValue({ id: "d" }),
    },
  };
  const db: any = {
    businessMember: {
      findUnique: vi.fn().mockResolvedValue({ role: "OWNER" }),
    },
    businessIntelligenceProfile: { findUnique: vi.fn() },
    businessMetricSnapshot: { findMany: vi.fn() },
    businessInsight: { findMany: vi.fn() },
    businessOpportunity: { findMany: vi.fn() },
    businessRiskSignal: { findMany: vi.fn() },
    businessGrowthRecommendation: { findMany: vi.fn() },
    businessGrowthExperiment: { findFirst: vi.fn(), update: vi.fn() },
    businessGrowthExperimentResult: { create: vi.fn() },
    businessBenchmark: { findFirst: vi.fn() },
    businessIntelligenceVersion: { findMany: vi.fn() },
    appointment: { findFirst: vi.fn().mockResolvedValue({ id: "a" }) },
    $transaction: vi.fn((cb) => cb(tx)),
  };
  return {
    db,
    tx,
    s: new BusinessIntelligenceService(db, new BusinessIntelligenceEngine()),
  };
}
describe("BusinessIntelligenceService", () => {
  it("denies cross-tenant reads and writes", async () => {
    const { db, s } = setup();
    db.businessMember.findUnique.mockResolvedValue(null);
    await expect(s.metrics(owner, "other")).rejects.toThrow("denied");
  });
  it("returns insufficient overview instead of invented metrics", async () => {
    const { db, s } = setup();
    db.businessIntelligenceProfile.findUnique.mockResolvedValue(null);
    await expect(s.overview(owner, "b")).resolves.toEqual({
      status: "INSUFFICIENT_DATA",
      profile: null,
    });
  });
  it("ingests source evidence idempotently", async () => {
    const { tx, s } = setup();
    tx.businessMetricObservation.findUnique.mockResolvedValue({ id: "old" });
    await expect(
      s.ingest(owner, "b", {
        eventId: "e",
        metric: "BOOKINGS",
        value: 1,
        sourceEntityType: "BOOKING",
        sourceEntityId: "a",
        observedAt: new Date(),
        source: "OBSERVED",
      }),
    ).resolves.toEqual({ status: "DUPLICATE" });
    expect(tx.businessMetricObservation.create).not.toHaveBeenCalled();
    expect(tx.$queryRawUnsafe).toHaveBeenCalledOnce();
  });
  it("rejects malformed and cross-tenant booking evidence", async () => {
    const { db, s } = setup();
    db.appointment.findFirst.mockResolvedValue(null);
    await expect(
      s.ingest(owner, "b", {
        eventId: "event-1",
        metric: "BOOKINGS",
        value: 1,
        sourceEntityType: "BOOKING",
        sourceEntityId: "other-tenant-appointment",
        observedAt: new Date(),
        source: "OBSERVED",
      }),
    ).rejects.toThrow("does not belong to tenant");
    await expect(
      s.ingest(owner, "b", {
        eventId: "",
        metric: "BOOKINGS",
        value: Number.NaN,
        sourceEntityType: "UNKNOWN",
        sourceEntityId: "x",
        observedAt: new Date("invalid"),
        source: "OBSERVED",
      }),
    ).rejects.toThrow("Malformed");
  });
  it("keeps missing data distinct from a measured zero", () => {
    const { s } = setup();
    const missing = (s as any).points([], []);
    expect(
      missing.find((x: any) => x.category === "BOOKINGS").value,
    ).toBeNull();
    const measured = [
      { status: "COMPLETED", price: 10, businessCustomerId: "c" },
    ];
    const points = (s as any).points([], measured);
    expect(points.find((x: any) => x.category === "BOOKINGS").value).toBe(0);
    expect(points.find((x: any) => x.category === "REVENUE").value).toBe(0);
  });
  it("rejects invalid experiment transitions", async () => {
    const { db, s } = setup();
    db.businessGrowthExperiment.findFirst.mockResolvedValue({
      status: "DRAFT",
    });
    await expect(
      s.transitionExperiment(owner, "b", "e", "COMPLETED"),
    ).rejects.toThrow("Invalid");
  });
  it("prevents confirmation bypass and prohibited autonomy", () => {
    const { s } = setup();
    expect(() => s.assertAction("SEND_CUSTOMER_MESSAGE")).toThrow(
      "confirmation",
    );
    expect(() => s.assertAction("TRANSFER_FUNDS", true)).toThrow("prohibited");
  });
  it("does not leak small benchmark cohorts", async () => {
    const { db, s } = setup();
    db.businessBenchmark.findFirst.mockResolvedValue({
      cohortSize: 2,
      privacyThreshold: 5,
      aggregateValue: 99,
    });
    await expect(s.benchmark(owner, "b", "REVENUE")).resolves.toEqual({
      status: "INSUFFICIENT_BENCHMARK_DATA",
      metric: "REVENUE",
      value: null,
    });
  });
  it("rejects invalid metric taxonomy at the service boundary", async () => {
    const { s } = setup();
    await expect(
      s.benchmark(owner, "b", "VANITY_SCORE" as any),
    ).rejects.toThrow("Invalid metric");
  });
  it("keeps a completed experiment result immutable", async () => {
    const { db, s } = setup();
    db.businessGrowthExperiment.findFirst.mockResolvedValue({
      status: "COMPLETED",
      expectedDirection: "INCREASE",
      result: { id: "existing" },
    });
    await expect(s.result(owner, "b", "e", 10, 12, 20)).rejects.toThrow(
      "immutable",
    );
  });
});
