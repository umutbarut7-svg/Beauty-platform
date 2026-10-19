import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PermissionsService } from "../src/auth/permissions.service.js";
import type { PrismaService } from "../src/database/prisma.service.js";
import { AuditService } from "../src/infrastructure/audit.service.js";
import { GovernanceEngine } from "../src/governance/governance-engine.service.js";
import { GovernanceService } from "../src/governance/governance.service.js";

// This suite must fail, rather than skip or fall back to a configured runtime DB.
if (
  process.env.STAGE32_TEST_DATABASE_URL !==
  "postgresql://postgres:postgres@localhost:5432/beauty_platform_ci?schema=public"
) {
  throw new Error(
    "Governance integration tests require the isolated Stage 32 CI database",
  );
}
const db = new PrismaClient({
  datasourceUrl: process.env.STAGE32_TEST_DATABASE_URL,
});
const database = db as unknown as PrismaService;
const service = new GovernanceService(
  database,
  new PermissionsService(database),
  new AuditService(database),
  new GovernanceEngine(),
);
const key = randomUUID();
const tenant = `stage32-${key}`;
const other = `other-${key}`;
const owner = {
  id: `owner-${key}`,
  email: `${key}@example.test`,
  role: "BUSINESS_OWNER" as const,
};
const admin = { ...owner, role: "SUPER_ADMIN" as const };
let versionId: string;

beforeAll(async () => {
  await db.user.create({
    data: {
      id: owner.id,
      email: owner.email,
      passwordHash: "integration-not-a-credential",
    },
  });
  await db.business.createMany({
    data: [
      { id: tenant, name: "Governance test", slug: tenant },
      { id: other, name: "Other tenant", slug: other },
    ],
  });
  await db.businessMember.create({
    data: { userId: owner.id, businessId: tenant, role: "BUSINESS_OWNER" },
  });
  const market = await db.market.create({ data: { key, countryCode: "TR" } });
  const config = await db.marketConfiguration.create({
    data: {
      marketId: market.id,
      version: 1,
      defaultLocale: "tr-TR",
      supportedLocales: ["tr-TR"],
      defaultCurrency: "TRY",
      supportedCurrencies: ["TRY"],
      defaultTimezone: "Europe/Istanbul",
      supportedTimezones: ["Europe/Istanbul"],
      measurementSystem: "METRIC",
      dateFormatPolicy: {},
      timeFormatPolicy: {},
      numberFormatPolicy: {},
      currencyDisplayPolicy: {},
      phonePolicy: {},
      addressPolicy: {},
      bookingPolicy: {},
      featureFlags: {},
      supportedPaymentMethods: [],
      effectiveFrom: new Date(),
    },
  });
  await db.tenantGlobalizationProfile.create({
    data: {
      businessId: tenant,
      marketId: market.id,
      marketConfigurationId: config.id,
      preferredLocale: "tr-TR",
      preferredCurrency: "TRY",
      preferredTimezone: "Europe/Istanbul",
      measurementSystem: "METRIC",
    },
  });
  const policy = await service.createPolicy(owner, tenant, {
    key: "ai-policy",
    scope: "AI",
    level: "TENANT",
    failMode: "CLOSED",
    reason: "Integration fixture",
    rules: [
      {
        key: "verified",
        field: "verified",
        operator: "EQUALS",
        value: true,
        priority: 1,
        decision: "ALLOW",
        reasonCode: "VERIFIED",
      },
    ],
  });
  versionId = policy.version.id;
  for (const next of ["REVIEW", "APPROVED", "ACTIVE"] as const) {
    await service.transitionPolicy(
      owner,
      tenant,
      versionId,
      next,
      "Reviewed fixture",
      `${key}-${next}`,
    );
  }
});
afterAll(async () => {
  await db.$disconnect();
});

describe("Stage 32 governance on real PostgreSQL and Prisma", () => {
  it("allocates distinct immutable versions under concurrent policy creation", async () => {
    const create = () =>
      service.createPolicy(owner, tenant, {
        key: "ai-policy",
        scope: "AI",
        level: "TENANT",
        failMode: "CLOSED",
        reason: "Concurrent draft",
        rules: [],
      });
    const versions = await Promise.all([create(), create()]);
    expect(versions.map((p) => p.version.version).sort()).toEqual([2, 3]);
  });
  it("enforces membership and prevents cross-tenant replay disclosure", async () => {
    await expect(
      service.transitionPolicy(
        owner,
        other,
        versionId,
        "ACTIVE",
        "denied",
        `${key}-ACTIVE`,
      ),
    ).rejects.toThrow("Business access denied");
    await expect(
      service.transitionPolicy(
        admin,
        other,
        versionId,
        "ACTIVE",
        "denied",
        `${key}-ACTIVE`,
      ),
    ).rejects.toThrow("not found");
  });
  it("requires review for low confidence and preserves immutable evaluation on override", async () => {
    const result = await service.evaluate(
      owner,
      tenant,
      "AI",
      { verified: true },
      false,
      `${key}-evaluation`,
      {
        tenantId: tenant,
        model: "deterministic",
        modelVersion: "1",
        promptVersion: "1",
        confidence: 0.4,
      },
    );
    expect(result.decision).toBe("REVIEW");
    expect(result.reasonCode).toBe("LOW_CONFIDENCE");
    const override = await service.override(
      owner,
      tenant,
      result.id,
      "BLOCK",
      "Human reviewed",
      `${key}-override`,
    );
    expect(override.previousDecision).toBe("REVIEW");
    expect(
      (
        await db.policyEvaluation.findUniqueOrThrow({
          where: { id: result.id },
        })
      ).decision,
    ).toBe("REVIEW");
    expect(
      await db.auditLog.count({
        where: { businessId: tenant, action: "governance.human_override" },
      }),
    ).toBe(1);
  });
  it("persists separate consent grant and withdrawal records", async () => {
    for (const status of ["GRANTED", "WITHDRAWN"] as const)
      await service.recordConsent(owner, tenant, {
        subjectId: owner.id,
        purpose: "MARKETING",
        noticeVersion: "1",
        status,
        idempotencyKey: `${key}-${status}`,
      });
    expect(
      await db.consentRecord.count({
        where: { businessId: tenant, subjectId: owner.id },
      }),
    ).toBe(2);
  });
  it("serializes simultaneous privacy transitions and retains a single timeline entry", async () => {
    const request = await service.createPrivacyRequest(
      owner,
      tenant,
      owner.id,
      "EXPORT",
      `${key}-privacy`,
    );
    const transition = () =>
      service.transitionPrivacy(
        owner,
        tenant,
        request.id,
        "IDENTITY_VERIFICATION",
        "Verify identity",
        `${key}-transition`,
      );
    const results = await Promise.all([transition(), transition()]);
    expect(results.every((r) => r.state === "IDENTITY_VERIFICATION")).toBe(
      true,
    );
    expect(
      await db.privacyRequestTransition.count({
        where: { requestId: request.id },
      }),
    ).toBe(1);
  });
});
