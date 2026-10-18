import { describe, expect, it, vi } from "vitest";
import { GovernanceEngine } from "./governance-engine.service.js";
import { GovernanceService } from "./governance.service.js";
const user = {
  id: "actor",
  email: "owner@example.test",
  role: "BUSINESS_OWNER",
} as const;
function setup() {
  const db = {
    tenantGlobalizationProfile: {
      findUnique: vi.fn().mockResolvedValue({ marketId: "m1" }),
    },
    governancePolicy: {
      upsert: vi.fn().mockResolvedValue({ id: "p", marketId: "m1" }),
    },
    governancePolicyVersion: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    governanceEvent: { create: vi.fn(), findUnique: vi.fn() },
    policyEvaluation: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    humanOverride: { upsert: vi.fn() },
    governanceDispute: { upsert: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    governanceAppeal: { create: vi.fn() },
    disputeTransition: { findUnique: vi.fn(), create: vi.fn() },
    consentRecord: { upsert: vi.fn() },
    privacyRequest: { upsert: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    privacyRequestTransition: { findUnique: vi.fn(), create: vi.fn() },
    enforcementAction: { upsert: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    $queryRawUnsafe: vi.fn(),
    $transaction: vi.fn(async (cb) => cb(db)),
  };
  const permissions = {
    assertBusinessAccess: vi.fn().mockResolvedValue(undefined),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  return {
    db,
    permissions,
    audit,
    service: new GovernanceService(
      db as never,
      permissions as never,
      audit as never,
      new GovernanceEngine(),
    ),
  };
}
describe("GovernanceService boundaries", () => {
  it("authorizes and tenant-scopes policy activation", async () => {
    const { db, permissions, service } = setup();
    db.governanceEvent.findUnique.mockResolvedValue(null);
    db.governancePolicyVersion.findFirst.mockResolvedValue({
      id: "v",
      policyId: "p",
      status: "APPROVED",
      policy: { businessId: "a", marketId: "m1" },
    });
    db.governancePolicyVersion.update.mockResolvedValue({
      id: "v",
      status: "ACTIVE",
    });
    await service.transitionPolicy(
      user,
      "a",
      "v",
      "ACTIVE",
      "approved",
      "event-1",
    );
    expect(permissions.assertBusinessAccess).toHaveBeenCalledWith(
      user,
      "a",
      "governance:activate",
    );
    expect(db.governancePolicyVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "v", policy: { businessId: "a" } },
      }),
    );
  });
  it("returns an idempotent evaluation replay", async () => {
    const { db, service } = setup();
    db.policyEvaluation.findUnique.mockResolvedValue({
      id: "existing",
      decision: "ALLOW",
    });
    expect(
      await service.evaluate(user, "a", "AI", {}, true, "same"),
    ).toMatchObject({ id: "existing" });
    expect(db.governancePolicyVersion.findMany).not.toHaveBeenCalled();
  });
  it("rejects cross-tenant override lookup", async () => {
    const { db, service } = setup();
    db.policyEvaluation.findFirst.mockResolvedValue(null);
    await expect(
      service.override(
        user,
        "tenant-b",
        "evaluation-a",
        "ALLOW",
        "reason",
        "key",
      ),
    ).rejects.toThrow("not found");
    expect(db.policyEvaluation.findFirst).toHaveBeenCalledWith({
      where: { id: "evaluation-a", businessId: "tenant-b" },
    });
  });
  it("records consent withdrawal as a new immutable record", async () => {
    const { db, service } = setup();
    db.consentRecord.upsert.mockResolvedValue({ id: "c", status: "WITHDRAWN" });
    await service.recordConsent(user, "a", {
      subjectId: "u",
      purpose: "MARKETING",
      noticeVersion: "2",
      status: "WITHDRAWN",
      idempotencyKey: "withdraw-1",
    });
    expect(db.consentRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: "WITHDRAWN",
          withdrawnAt: expect.any(Date),
          businessId: "a",
        }),
        update: {},
      }),
    );
  });
  it("prevents invalid dispute transitions", async () => {
    const { db, service } = setup();
    db.disputeTransition.findUnique.mockResolvedValue(null);
    db.governanceDispute.findFirst.mockResolvedValue({
      id: "d",
      state: "CLOSED",
    });
    await expect(
      service.transitionDispute(user, "a", "d", "APPEAL", "late", "event"),
    ).rejects.toThrow("Invalid dispute transition");
  });
  it("makes privacy transitions replay safe", async () => {
    const { db, service } = setup();
    db.privacyRequestTransition.findUnique.mockResolvedValue({
      requestId: "r",
    });
    db.privacyRequest.findFirst.mockResolvedValue({
      id: "r",
      state: "IN_REVIEW",
    });
    expect(
      await service.transitionPrivacy(user, "a", "r", "APPROVED", "ok", "same"),
    ).toMatchObject({ id: "r" });
    expect(db.privacyRequestTransition.create).not.toHaveBeenCalled();
  });
});
