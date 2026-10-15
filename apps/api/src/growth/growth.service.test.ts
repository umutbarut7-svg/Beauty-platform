import { describe, expect, it, vi } from "vitest";
import { GrowthService } from "./growth.service.js";
import { GrowthEngine } from "./growth-engine.service.js";
import { GlobalizationEngine } from "../globalization/globalization-engine.service.js";
const user = {
  id: "actor",
  email: "owner@example.test",
  role: "BUSINESS_OWNER",
} as const;
function setup(overrides: Record<string, unknown> = {}) {
  const db = {
    tenantGlobalizationProfile: {
      findUnique: vi.fn().mockResolvedValue({ marketId: "market-1" }),
    },
    referralProgram: { findMany: vi.fn(), findFirst: vi.fn() },
    referralCode: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    attributionTouch: { upsert: vi.fn(), updateMany: vi.fn() },
    growthExperiment: { findFirst: vi.fn() },
    experimentAssignment: { findUnique: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(async (callback) => callback(db)),
    $queryRawUnsafe: vi.fn(),
    referral: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    referralTransition: { findUnique: vi.fn(), create: vi.fn() },
    growthEvent: { create: vi.fn() },
    growthRiskAssessment: { create: vi.fn() },
    financialCreditGrant: { create: vi.fn() },
    financialLedgerEntry: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    growthReward: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    challengeProgressEvent: { findUnique: vi.fn(), create: vi.fn() },
    growthChallenge: { findFirst: vi.fn() },
    challengeProgress: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    ...overrides,
  };
  const permissions = {
    assertBusinessAccess: vi.fn().mockResolvedValue(undefined),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const abuse = { consume: vi.fn().mockResolvedValue({ allowed: true }) };
  return {
    db,
    permissions,
    audit,
    abuse,
    service: new GrowthService(
      db as never,
      permissions as never,
      audit as never,
      abuse as never,
      new GrowthEngine(new GlobalizationEngine()),
      new GlobalizationEngine(),
    ),
  };
}
describe("GrowthService security and exactly-once writes", () => {
  it("scopes program reads to the authorized tenant", async () => {
    const { service, db, permissions } = setup();
    (db.referralProgram.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
      [],
    );
    await service.programs(user, "tenant-a");
    expect(permissions.assertBusinessAccess).toHaveBeenCalledWith(
      user,
      "tenant-a",
      "growth:read",
    );
    expect(db.referralProgram.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { businessId: "tenant-a" } }),
    );
  });
  it("returns a generic response for revoked and expired referral codes", async () => {
    const { service, db } = setup();
    (db.referralCode.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      code: "ABC123",
      revokedAt: new Date(),
      expiresAt: null,
      usageLimit: null,
      usageCount: 0,
      program: { status: "ACTIVE" },
    });
    await expect(service.resolveCode("abc123", "ip-hash")).rejects.toThrow(
      "Referral unavailable",
    );
  });
  it("rate limits code enumeration without disclosing existence", async () => {
    const { service, abuse } = setup();
    (abuse.consume as ReturnType<typeof vi.fn>).mockResolvedValue({
      allowed: false,
    });
    await expect(service.resolveCode("abc123", "ip-hash")).rejects.toThrow(
      "Referral unavailable",
    );
  });
  it("prevents cross-tenant code use", async () => {
    const { service, db } = setup();
    (db.referralCode.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    await expect(
      service.createReferral(user, "tenant-b", {
        code: "ABC123",
        referredType: "USER",
        referredId: "u2",
        idempotencyKey: "evt",
      }),
    ).rejects.toThrow("Referral unavailable");
    expect(db.referralCode.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ businessId: "tenant-b" }),
      }),
    );
  });
  it("makes challenge progress replay-safe", async () => {
    const { service, db } = setup();
    (
      db.growthChallenge.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ id: "c", target: 3 });
    (
      db.challengeProgressEvent.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ progressId: "p" });
    (
      db.challengeProgress.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ id: "p", progress: 1 });
    expect(
      await service.progressChallenge(
        user,
        "tenant",
        "c",
        "subject",
        "event-1",
        1,
      ),
    ).toMatchObject({ progress: 1 });
    expect(db.challengeProgress.upsert).not.toHaveBeenCalled();
  });
  it("keeps an existing experiment assignment after weights change", async () => {
    const { service, db } = setup();
    (
      db.growthExperiment.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: "e",
      variants: [{ id: "v", key: "offer", weight: 1 }],
    });
    (
      db.experimentAssignment.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ id: "a", variantId: "old" });
    expect(
      await service.assignExperiment(user, "tenant", "e", "subject"),
    ).toMatchObject({ variantId: "old" });
    expect(db.experimentAssignment.create).not.toHaveBeenCalled();
  });
  it("records reward reversal as a negative immutable ledger event", async () => {
    const { service, db } = setup();
    (
      db.financialLedgerEntry.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null);
    (db.growthReward.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "reward",
      businessId: "tenant",
      referralId: "ref",
      status: "GRANTED",
      ledgerEntryId: "ledger",
      amountMinor: 500n,
      currency: "USD",
    });
    (
      db.financialLedgerEntry.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ id: "ledger" });
    (db.growthReward.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "reward",
      status: "REVERSED",
    });
    await service.reverseReward(
      user,
      "tenant",
      "reward",
      "booking refunded",
      "reverse-1",
    );
    expect(db.financialLedgerEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "REVERSAL",
        amountMinor: -500n,
        reversalOfId: "ledger",
      }),
    });
    expect(db.referral.update).toHaveBeenCalledWith({
      where: { id: "ref" },
      data: { state: "REVERSED" },
    });
  });
});
