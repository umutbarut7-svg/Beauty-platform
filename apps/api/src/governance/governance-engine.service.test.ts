import { describe, expect, it } from "vitest";
import { GovernanceEngine } from "./governance-engine.service.js";
const engine = new GovernanceEngine();
const policy = {
  policyId: "p",
  versionId: "pv1",
  version: 1,
  level: "TENANT" as const,
  failMode: "REVIEW" as const,
  rules: [
    {
      key: "blocked",
      field: "risk",
      operator: "GREATER_THAN" as const,
      value: 80,
      decision: "BLOCK" as const,
      reasonCode: "RISK_HIGH",
      priority: 10,
    },
    {
      key: "known",
      field: "verified",
      operator: "EQUALS" as const,
      value: true,
      decision: "ALLOW" as const,
      reasonCode: "VERIFIED",
      priority: 5,
    },
  ],
};
describe("GovernanceEngine", () => {
  it("enforces immutable policy lifecycle", () => {
    expect(() => engine.transitionPolicy("DRAFT", "REVIEW")).not.toThrow();
    expect(() => engine.transitionPolicy("DRAFT", "ACTIVE")).toThrow(
      "Invalid policy transition",
    );
    expect(() => engine.transitionPolicy("RETIRED", "ACTIVE")).toThrow();
  });
  it("resolves global then market then tenant precedence by rule key", () => {
    const result = engine.resolve([
      {
        ...policy,
        level: "GLOBAL",
        rules: [{ ...policy.rules[1]!, decision: "REVIEW" }],
      },
      {
        ...policy,
        versionId: "market",
        level: "MARKET",
        rules: [{ ...policy.rules[1]!, decision: "BLOCK" }],
      },
      policy,
    ]);
    expect(result.rules.find((r) => r.key === "known")?.decision).toBe("ALLOW");
  });
  it("produces ALLOW REVIEW and BLOCK deterministically", () => {
    expect(engine.evaluate(policy, { verified: true }, false).decision).toBe(
      "ALLOW",
    );
    expect(engine.evaluate(policy, { risk: 90 }, false).decision).toBe("BLOCK");
    expect(engine.evaluate(policy, { verified: false }, false).decision).toBe(
      "REVIEW",
    );
    const a = engine.evaluate(policy, { risk: 90, verified: false }, true);
    const b = engine.evaluate(policy, { verified: false, risk: 90 }, true);
    expect(a.deterministicKey).toBe(b.deterministicKey);
  });
  it("fails closed for unmatched high-risk decisions", () => {
    expect(
      engine.evaluate({ ...policy, rules: [], failMode: "OPEN" }, {}, true)
        .decision,
    ).toBe("BLOCK");
    expect(
      engine.evaluate({ ...policy, rules: [], failMode: "OPEN" }, {}, false)
        .decision,
    ).toBe("ALLOW");
  });
  it("rejects unsafe context values and keys", () => {
    expect(() =>
      engine.evaluate(policy, { nested: { bypass: true } }, false),
    ).toThrow("scalar");
    expect(() => engine.evaluate(policy, { "bad key": true }, false)).toThrow(
      "Invalid policy context key",
    );
  });
  it("enforces the full dispute and appeal lifecycle", () => {
    expect(() =>
      engine.transitionDispute("OPEN", "EVIDENCE_COLLECTION"),
    ).not.toThrow();
    expect(() => engine.transitionDispute("DECISION", "APPEAL")).not.toThrow();
    expect(() =>
      engine.transitionDispute("APPEAL", "HUMAN_REVIEW"),
    ).not.toThrow();
    expect(() => engine.transitionDispute("CLOSED", "APPEAL")).toThrow();
  });
  it("enforces privacy request lifecycle", () => {
    expect(() =>
      engine.transitionPrivacy("SUBMITTED", "IDENTITY_VERIFICATION"),
    ).not.toThrow();
    expect(() =>
      engine.transitionPrivacy("PROCESSING", "COMPLETED"),
    ).not.toThrow();
    expect(() => engine.transitionPrivacy("SUBMITTED", "COMPLETED")).toThrow();
  });
  it("enforces review before activating an enforcement action", () => {
    expect(() =>
      engine.transitionEnforcement("PROPOSED", "REVIEW"),
    ).not.toThrow();
    expect(() =>
      engine.transitionEnforcement("REVIEW", "ACTIVE"),
    ).not.toThrow();
    expect(() => engine.transitionEnforcement("PROPOSED", "ACTIVE")).toThrow(
      "Invalid enforcement transition",
    );
  });
  it("requires complete AI provenance", () => {
    expect(() =>
      engine.assertAiContext({
        tenantId: "a",
        resolvedTenantId: "a",
        model: "",
        modelVersion: "1",
        promptVersion: "1",
      }),
    ).toThrow("provenance");
  });
  it("blocks AI tenant mismatch and bypass requests", () => {
    expect(() =>
      engine.assertAiContext({
        tenantId: "b",
        resolvedTenantId: "a",
        model: "m",
        modelVersion: "1",
        promptVersion: "1",
      }),
    ).toThrow("tenant mismatch");
    expect(() =>
      engine.assertAiContext({
        tenantId: "a",
        resolvedTenantId: "a",
        model: "m",
        modelVersion: "1",
        promptVersion: "1",
        requestedBypass: true,
      }),
    ).toThrow("bypass");
  });
  it("requires human review for low confidence AI results", () => {
    expect(
      engine.assertAiContext({
        tenantId: "a",
        resolvedTenantId: "a",
        model: "m",
        modelVersion: "1",
        promptVersion: "1",
        confidence: 0.4,
      }),
    ).toEqual({ requiresHumanReview: true, reasonCode: "LOW_CONFIDENCE" });
  });
  it("guards protected and held records from deletion", () => {
    const date = new Date("2020-01-01");
    const now = new Date("2026-01-01");
    expect(
      engine.retentionDecision({
        recordClass: "ledger",
        createdAt: date,
        now,
        retentionDays: 1,
        legalHold: false,
        auditProtected: false,
        financialProtected: true,
        securityProtected: false,
      }),
    ).toMatchObject({ eligible: false, action: "ANONYMIZE" });
    expect(
      engine.retentionDecision({
        recordClass: "profile",
        createdAt: date,
        now,
        retentionDays: 1,
        legalHold: true,
        auditProtected: false,
        financialProtected: false,
        securityProtected: false,
      }),
    ).toMatchObject({ eligible: false, reasonCode: "LEGAL_HOLD" });
  });
  it("permits adapter deletion only after configured retention", () => {
    expect(
      engine.retentionDecision({
        recordClass: "profile",
        createdAt: new Date("2020-01-01"),
        now: new Date("2026-01-01"),
        retentionDays: 365,
        legalHold: false,
        auditProtected: false,
        financialProtected: false,
        securityProtected: false,
      }),
    ).toMatchObject({ eligible: true, action: "DELETE_VIA_ADAPTER" });
  });
});
