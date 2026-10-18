/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { MarketplaceLiquidityEngine } from "./marketplace-liquidity.engine.js";
import { MarketplaceLiquidityService } from "./marketplace-liquidity.service.js";
const owner = { id: "owner", email: "o@test", role: "BUSINESS_OWNER" as const };
function setup() {
  const tx: any = {
    $queryRawUnsafe: vi.fn(),
    marketplaceDemandSignal: { findUnique: vi.fn(), create: vi.fn() },
    marketplaceSupplySignal: { findUnique: vi.fn(), create: vi.fn() },
    marketplaceCapacityObservation: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    marketplaceLiquidityProfile: {
      upsert: vi.fn().mockResolvedValue({ id: "profile", version: 1 }),
      update: vi.fn(),
    },
    marketplaceLiquiditySnapshot: {
      create: vi.fn().mockResolvedValue({ id: "snapshot" }),
    },
    marketplaceSupplyGap: { create: vi.fn() },
    marketplaceSupplyOpportunity: { create: vi.fn() },
    marketplaceLiquidityVersion: { create: vi.fn() },
  };
  const db: any = {
    businessMember: {
      findUnique: vi.fn().mockResolvedValue({ role: "OWNER" }),
    },
    marketplaceLiquiditySnapshot: { findFirst: vi.fn() },
    marketplaceDemandSignal: { findMany: vi.fn() },
    marketplaceSupplySignal: { findMany: vi.fn() },
    marketplaceCapacityObservation: { findMany: vi.fn() },
    marketplaceSupplyGap: { findMany: vi.fn() },
    marketplaceSupplyOpportunity: { findMany: vi.fn() },
    appointment: { findFirst: vi.fn() },
    service: { findFirst: vi.fn() },
    $transaction: vi.fn((cb) => cb(tx)),
  };
  return {
    db,
    tx,
    service: new MarketplaceLiquidityService(
      db,
      new MarketplaceLiquidityEngine(),
    ),
  };
}
const demand = {
  eventId: "event-1",
  type: "SEARCH" as const,
  source: "OBSERVED" as const,
  sourceEntityType: "DISCOVERY_SEARCH",
  sourceEntityId: "search-1",
  timeWindow: "ROLLING_30_DAYS",
  value: 1,
  confidence: 0.8,
  freshness: 1,
  observedAt: new Date("2026-09-01T00:00:00Z"),
  evidence: { aggregate: true },
};
describe("MarketplaceLiquidityService", () => {
  it("denies cross-tenant reads and writes", async () => {
    const { db, service } = setup();
    db.businessMember.findUnique.mockResolvedValue(null);
    await expect(service.demand(owner, "other")).rejects.toThrow("denied");
    await expect(service.ingestDemand(owner, "other", demand)).rejects.toThrow(
      "denied",
    );
  });
  it("returns no data instead of invented liquidity", async () => {
    const { db, service } = setup();
    db.marketplaceLiquiditySnapshot.findFirst.mockResolvedValue(null);
    await expect(
      service.overview(owner, "b", "ROLLING_30_DAYS"),
    ).resolves.toEqual({ status: "NO_DATA", snapshot: null });
  });
  it("marks expired liquidity snapshots as stale", async () => {
    const { db, service } = setup();
    db.marketplaceLiquiditySnapshot.findFirst.mockResolvedValue({
      dataState: "AVAILABLE",
      periodEnd: new Date("2020-01-01T00:00:00Z"),
    });
    await expect(
      service.overview(owner, "b", "ROLLING_30_DAYS"),
    ).resolves.toMatchObject({ status: "STALE_DATA" });
  });
  it("makes signal replay idempotent under an advisory lock", async () => {
    const { tx, service } = setup();
    tx.marketplaceDemandSignal.findUnique.mockResolvedValue({ id: "existing" });
    await expect(service.ingestDemand(owner, "b", demand)).resolves.toEqual({
      status: "DUPLICATE",
    });
    expect(tx.$queryRawUnsafe).toHaveBeenCalledOnce();
    expect(tx.marketplaceDemandSignal.create).not.toHaveBeenCalled();
  });
  it("rejects malformed, non-finite, and invalid taxonomy signals", async () => {
    const { service } = setup();
    await expect(
      service.ingestDemand(owner, "b", {
        ...demand,
        value: Number.POSITIVE_INFINITY,
      }),
    ).rejects.toThrow("Malformed");
    await expect(
      service.ingestDemand(owner, "b", {
        ...demand,
        observedAt: new Date("bad"),
      }),
    ).rejects.toThrow("Malformed");
    await expect(
      service.ingestDemand(owner, "b", { ...demand, type: "MONEY" as any }),
    ).rejects.toThrow("taxonomy");
  });
  it("rejects cross-tenant evidence references", async () => {
    const { service } = setup();
    await expect(
      service.ingestDemand(owner, "tenant-a", {
        ...demand,
        sourceEntityType: "BUSINESS",
        sourceEntityId: "tenant-b",
      }),
    ).rejects.toThrow("Cross-tenant");
  });
  it("keeps predicted demand separate and requires validity evidence", async () => {
    const { service } = setup();
    await expect(
      service.ingestDemand(owner, "b", {
        ...demand,
        source: "PREDICTED",
        type: "PREDICTED_DEMAND",
        evidence: {},
      }),
    ).rejects.toThrow("validity");
  });
  it("returns only tenant-filtered safe projections", async () => {
    const { db, service } = setup();
    db.marketplaceDemandSignal.findMany.mockResolvedValue([]);
    await service.demand(owner, "tenant-a", 10);
    expect(db.marketplaceDemandSignal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { businessId: "tenant-a" }, take: 10 }),
    );
  });
  it("prevents prohibited interventions and confirmation bypass", () => {
    const { service } = setup();
    expect(() =>
      service.assertIntervention("HIDDEN_SPONSOR_BOOST", true),
    ).toThrow("prohibited");
    expect(() => service.assertIntervention("MESSAGE_CUSTOMERS")).toThrow(
      "confirmation",
    );
  });
  it("validates usable capacity and makes replay idempotent", async () => {
    const { tx, service } = setup();
    const event = {
      eventId: "capacity-1",
      timeWindow: "DAILY" as const,
      availableSlots: 0,
      usableMinutes: 480,
      bookedMinutes: 480,
      confidence: 1,
      freshness: 1,
      observedAt: new Date(),
      evidence: { schedule: true },
    };
    tx.marketplaceCapacityObservation.findUnique.mockResolvedValue({ id: "x" });
    await expect(service.ingestCapacity(owner, "b", event)).resolves.toEqual({
      status: "DUPLICATE",
    });
    await expect(
      service.ingestCapacity(owner, "b", {
        ...event,
        eventId: "bad",
        bookedMinutes: 481,
      }),
    ).rejects.toThrow("Malformed capacity");
  });
  it("appends an immutable liquidity snapshot and version", async () => {
    const { db, tx, service } = setup();
    db.marketplaceDemandSignal.findMany.mockResolvedValue([
      { signalType: "SEARCH", value: 1, freshness: 1 },
      { signalType: "MATCH_REQUEST", value: 1, freshness: 1 },
      { signalType: "COMPLETED_BOOKING", value: 1, freshness: 1 },
    ]);
    db.marketplaceSupplySignal.findMany.mockResolvedValue([
      { value: 3, freshness: 1 },
    ]);
    db.marketplaceCapacityObservation.findMany.mockResolvedValue([
      { availableSlots: 3, freshness: 1 },
    ]);
    await expect(
      service.recalculate(
        owner,
        "b",
        "DAILY",
        new Date("2026-09-28T12:00:00Z"),
      ),
    ).resolves.toMatchObject({ version: 2, snapshotId: "snapshot" });
    expect(tx.marketplaceLiquiditySnapshot.create).toHaveBeenCalledOnce();
    expect(tx.marketplaceLiquidityVersion.create).toHaveBeenCalledOnce();
    expect(tx.marketplaceLiquiditySnapshot.update).toBeUndefined();
  });
});
