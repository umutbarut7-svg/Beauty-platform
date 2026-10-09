/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import { ProfessionalIntelligenceService } from "./professional-intelligence.service.js";
import { ProfessionalConfidenceService } from "./professional-confidence.service.js";
import { ProfessionalTaxonomyService } from "./professional-taxonomy.service.js";
const user = { id: "u", email: "u@test", role: "CUSTOMER" as const };
function setup() {
  const tx: any = {
    $queryRawUnsafe: vi.fn(),
    professionalSkillEvidence: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    professionalSkill: {
      upsert: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    professionalCareerEvent: { upsert: vi.fn() },
    professionalIntelligenceProfile: {
      findUnique: vi.fn().mockResolvedValue({ version: 1 }),
      update: vi.fn(),
    },
    professionalIntelligenceVersion: { create: vi.fn() },
  };
  const db: any = {
    staff: { findFirst: vi.fn().mockResolvedValue({ userId: "u" }) },
    businessMember: { findUnique: vi.fn().mockResolvedValue(null) },
    professionalIntelligenceProfile: {
      findUnique: vi.fn(),
      upsert: vi.fn().mockResolvedValue({ id: "p", version: 1 }),
    },
    professionalSkill: { findMany: vi.fn() },
    professionalSkillEvidence: { findMany: vi.fn() },
    professionalPerformanceSignal: { findMany: vi.fn() },
    professionalIntelligenceVersion: { findMany: vi.fn() },
    $transaction: vi.fn((cb) => cb(tx)),
  };
  return {
    db,
    tx,
    service: new ProfessionalIntelligenceService(
      db,
      new ProfessionalConfidenceService(),
      new ProfessionalTaxonomyService(),
    ),
  };
}
describe("ProfessionalIntelligenceService", () => {
  it("returns explicit insufficient evidence", async () => {
    const { db, service } = setup();
    db.professionalIntelligenceProfile.findUnique.mockResolvedValue(null);
    await expect(service.get(user, "b", "s")).resolves.toEqual({
      status: "INSUFFICIENT_EVIDENCE",
      profile: null,
    });
  });
  it("denies cross-tenant/self mutation", async () => {
    const { db, service } = setup();
    db.staff.findFirst.mockResolvedValue({ userId: "other" });
    await expect(
      service.declare(user, "b", "s", "HAIR", "BALAYAGE"),
    ).rejects.toThrow("denied");
    expect(db.staff.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ businessId: "b", id: "s" }),
      }),
    );
  });
  it("creates declared skills with low confidence and immutable history", async () => {
    const { service, tx } = setup();
    tx.professionalSkill.upsert.mockResolvedValue({
      id: "skill",
      status: "ACTIVE",
    });
    await service.declare(user, "b", "s", "HAIR", "BALAYAGE");
    expect(tx.professionalSkill.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sourceType: "DECLARED",
          confidence: 0.2,
        }),
      }),
    );
    expect(tx.professionalIntelligenceVersion.create).toHaveBeenCalled();
  });
  it("does not directly edit observed/verified skills during declared deactivation", async () => {
    const { service, tx, db } = setup();
    db.professionalIntelligenceProfile.findUnique.mockResolvedValue({
      id: "p",
    });
    tx.professionalSkill.findUnique.mockResolvedValue(null);
    await expect(
      service.deactivate(user, "b", "s", "HAIR", "BALAYAGE"),
    ).rejects.toThrow("Declared skill not found");
  });
  it("processes evidence idempotently", async () => {
    const { service, tx } = setup();
    tx.professionalSkillEvidence.findUnique.mockResolvedValue({
      id: "existing",
    });
    await expect(
      service.processEvidence({
        eventId: "e",
        businessId: "b",
        professionalId: "s",
        category: "HAIR",
        skillCode: "BALAYAGE",
        eventType: "JOB_COMPLETED",
        sourceId: "job",
        occurredAt: new Date(),
        weight: 1,
      }),
    ).resolves.toEqual({ status: "DUPLICATE" });
    expect(tx.professionalSkillEvidence.create).not.toHaveBeenCalled();
  });
  it("requires specialization thresholds", async () => {
    const { service, db } = setup();
    db.professionalIntelligenceProfile.findUnique.mockResolvedValue({
      id: "p",
    });
    db.professionalSkill.findMany.mockResolvedValue([]);
    await expect(service.specializations(user, "b", "s")).resolves.toEqual({
      status: "INSUFFICIENT_EVIDENCE",
      specializations: [],
    });
    expect(db.professionalSkill.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          completedJobCount: { gte: 5 },
          verifiedResultCount: { gte: 1 },
        }),
      }),
    );
  });
});
