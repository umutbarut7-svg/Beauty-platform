import { describe, expect, it, vi } from "vitest";
import { GlobalizationEngine } from "../globalization/globalization-engine.service.js";
import { MonetizationEngine } from "./monetization-engine.service.js";
import { MonetizationService } from "./monetization.service.js";
const user = { id: "u", email: "u@x.com", role: "BUSINESS_OWNER" as const };
function fixture() {
  const charge = {
    id: "charge",
    businessId: "a",
    type: "CHARGE",
    amountMinor: 1000n,
    currency: "GBP",
  };
  const db: Record<string, unknown> = {
    $queryRawUnsafe: vi.fn(),
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
    tenantGlobalizationProfile: {
      findFirst: vi.fn().mockResolvedValue({ marketId: "m" }),
    },
    monetizationPlan: { findMany: vi.fn().mockResolvedValue([]) },
    monetizationSubscription: {
      findFirst: vi.fn().mockResolvedValue({
        id: "sub",
        businessId: "a",
        status: "ACTIVE",
        version: 1,
        planVersion: {
          entitlements: [{ key: "ai.requests.max", limitValue: 10n }],
        },
      }),
      update: vi.fn().mockResolvedValue({ id: "sub", status: "PAUSED" }),
    },
    subscriptionChange: { create: vi.fn().mockResolvedValue({ id: "change" }) },
    monetizationUsageRecord: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi
        .fn()
        .mockImplementation(({ data }) => ({ id: "usage", ...data })),
    },
    financialLedgerEntry: {
      findFirst: vi.fn().mockResolvedValue(charge),
      create: vi.fn().mockImplementation(({ data }) => ({
        id: data.type === "REFUND" ? "reversal" : "entry",
        ...data,
      })),
      findMany: vi.fn().mockResolvedValue([charge]),
    },
    business: { findUnique: vi.fn().mockResolvedValue({ id: "a" }) },
    paymentWebhookEvent: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi
        .fn()
        .mockImplementation(({ data }) => ({ id: "webhook", ...data })),
    },
    financialSettlement: { findMany: vi.fn().mockResolvedValue([]) },
    financialCreditGrant: { findMany: vi.fn().mockResolvedValue([]) },
    refundRecord: {
      findFirst: vi.fn().mockResolvedValue(null),
      aggregate: vi.fn().mockResolvedValue({ _sum: { amountMinor: 0n } }),
      create: vi
        .fn()
        .mockImplementation(({ data }) => ({ id: "refund", ...data })),
    },
  };
  const permissions = {
    assertBusinessAccess: vi.fn().mockResolvedValue(undefined),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const globalization = new GlobalizationEngine();
  return {
    db,
    permissions,
    audit,
    service: new MonetizationService(
      db as never,
      permissions as never,
      audit as never,
      new MonetizationEngine(globalization),
      globalization,
    ),
  };
}
describe("MonetizationService", () => {
  it("binds reads to server-side tenant authorization", async () => {
    const { service, permissions } = fixture();
    await service.summary(user, "a");
    expect(permissions.assertBusinessAccess).toHaveBeenCalledWith(
      user,
      "a",
      "financial:read",
    );
  });
  it("rejects cross-tenant refund references", async () => {
    const { service, db } = fixture();
    (
      db.financialLedgerEntry as { findFirst: ReturnType<typeof vi.fn> }
    ).findFirst.mockResolvedValueOnce(null);
    await expect(
      service.refund(user, "b", {
        originalEntryId: "charge-a",
        amountMinor: 100n,
        idempotencyKey: "r",
        reason: "requested",
      }),
    ).rejects.toThrow("Charge not found");
  });
  it("makes usage ingestion idempotent", async () => {
    const { service, db } = fixture();
    const input = {
      marketId: "m",
      metric: "ai.request",
      quantity: 1n,
      source: "AI",
      idempotencyKey: "event",
      occurredAt: new Date(),
    };
    const first = await service.ingestUsage(user, "a", input);
    (
      db.monetizationUsageRecord as { findFirst: ReturnType<typeof vi.fn> }
    ).findFirst.mockResolvedValueOnce(first);
    const replay = await service.ingestUsage(user, "a", input);
    expect(replay).toEqual(first);
    expect(
      (db.monetizationUsageRecord as { create: ReturnType<typeof vi.fn> })
        .create,
    ).toHaveBeenCalledTimes(1);
  });
  it("prevents double and over refund", async () => {
    const { service, db } = fixture();
    (
      db.refundRecord as { aggregate: ReturnType<typeof vi.fn> }
    ).aggregate.mockResolvedValueOnce({ _sum: { amountMinor: 900n } });
    await expect(
      service.refund(user, "a", {
        originalEntryId: "charge",
        amountMinor: 200n,
        idempotencyKey: "r",
        reason: "partial",
      }),
    ).rejects.toThrow("exceeds");
  });
  it("returns an existing refund on idempotent replay", async () => {
    const { service, db } = fixture();
    (
      db.refundRecord as { findFirst: ReturnType<typeof vi.fn> }
    ).findFirst.mockResolvedValueOnce({ id: "existing" });
    await expect(
      service.refund(user, "a", {
        originalEntryId: "charge",
        amountMinor: 100n,
        idempotencyKey: "r",
        reason: "partial",
      }),
    ).resolves.toEqual({ id: "existing" });
  });
  it("writes refund reversal and audit records", async () => {
    const { service, audit } = fixture();
    await service.refund(user, "a", {
      originalEntryId: "charge",
      amountMinor: 100n,
      idempotencyKey: "r",
      reason: "partial",
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "financial.refund_created",
        businessId: "a",
      }),
    );
  });
  it("enforces entitlements without plan-name branching", async () => {
    const { service } = fixture();
    await expect(
      service.assertEntitlement("a", "ai.requests.max", 11n),
    ).rejects.toThrow("limit");
    await expect(
      service.assertEntitlement("a", "ai.requests.max", 10n),
    ).resolves.toMatchObject({ key: "ai.requests.max" });
  });
  it("serializes subscription transitions and audits them", async () => {
    const { service, audit } = fixture();
    await service.transitionSubscription(
      user,
      "a",
      "sub",
      "PAUSED",
      "seasonal",
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "financial.subscription_transition" }),
    );
  });
  it("deduplicates verified payment webhooks and resolves tenant server-side", async () => {
    const { service, db } = fixture();
    const provider = {
      verifyAndParseWebhook: vi.fn().mockResolvedValue({
        eventId: "evt",
        type: "payment.succeeded",
        tenantReference: "a",
        resourceReference: "pay",
      }),
    };
    const first = await service.processPaymentWebhook(
      provider as never,
      Buffer.from("signed"),
      "sig",
    );
    (
      db.paymentWebhookEvent as { findFirst: ReturnType<typeof vi.fn> }
    ).findFirst.mockResolvedValueOnce(first);
    const second = await service.processPaymentWebhook(
      provider as never,
      Buffer.from("signed"),
      "sig",
    );
    expect(second).toEqual(first);
    expect(
      (db.paymentWebhookEvent as { create: ReturnType<typeof vi.fn> }).create,
    ).toHaveBeenCalledTimes(1);
  });
  it("returns no-data rather than financial zero for an empty ledger", async () => {
    const { service, db } = fixture();
    (
      db.financialLedgerEntry as { findMany: ReturnType<typeof vi.fn> }
    ).findMany.mockResolvedValueOnce([]);
    await expect(service.summary(user, "a")).resolves.toMatchObject({
      status: "INSUFFICIENT_DATA",
    });
  });
});
