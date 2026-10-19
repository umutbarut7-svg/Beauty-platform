import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import type {
  DisputeState,
  EnforcementState,
  GovernanceDecision,
  PolicyResult,
  PolicyRuleInput,
  PolicyStatus,
  PrivacyRequestState,
  ResolvedPolicy,
} from "./governance.types.js";

const policyTransitions: Record<PolicyStatus, readonly PolicyStatus[]> = {
  DRAFT: ["REVIEW"],
  REVIEW: ["APPROVED", "DRAFT"],
  APPROVED: ["ACTIVE", "RETIRED"],
  ACTIVE: ["SUPERSEDED", "RETIRED"],
  SUPERSEDED: [],
  RETIRED: [],
};
const disputeTransitions: Record<DisputeState, readonly DisputeState[]> = {
  OPEN: ["EVIDENCE_COLLECTION", "CANCELLED", "REJECTED"],
  EVIDENCE_COLLECTION: ["AI_TRIAGE", "HUMAN_REVIEW", "CANCELLED"],
  AI_TRIAGE: ["HUMAN_REVIEW", "DECISION"],
  HUMAN_REVIEW: ["DECISION"],
  DECISION: ["APPEAL", "RESOLUTION"],
  APPEAL: ["HUMAN_REVIEW", "RESOLUTION"],
  RESOLUTION: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
  REJECTED: [],
};
const privacyTransitions: Record<
  PrivacyRequestState,
  readonly PrivacyRequestState[]
> = {
  SUBMITTED: ["IDENTITY_VERIFICATION", "CANCELLED"],
  IDENTITY_VERIFICATION: ["IN_REVIEW", "REJECTED"],
  IN_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["PROCESSING"],
  PROCESSING: ["COMPLETED"],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};
const enforcementTransitions: Record<
  EnforcementState,
  readonly EnforcementState[]
> = {
  PROPOSED: ["REVIEW", "CANCELLED"],
  REVIEW: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["LIFTED", "EXPIRED"],
  LIFTED: [],
  EXPIRED: [],
  CANCELLED: [],
};

@Injectable()
export class GovernanceEngine {
  transitionPolicy(from: PolicyStatus, to: PolicyStatus) {
    if (!policyTransitions[from].includes(to))
      throw new ConflictException(
        `Invalid policy transition: ${from} -> ${to}`,
      );
  }
  transitionDispute(from: DisputeState, to: DisputeState) {
    if (!disputeTransitions[from].includes(to))
      throw new ConflictException(
        `Invalid dispute transition: ${from} -> ${to}`,
      );
  }
  transitionPrivacy(from: PrivacyRequestState, to: PrivacyRequestState) {
    if (!privacyTransitions[from].includes(to))
      throw new ConflictException(
        `Invalid privacy request transition: ${from} -> ${to}`,
      );
  }
  transitionEnforcement(from: EnforcementState, to: EnforcementState) {
    if (!enforcementTransitions[from].includes(to))
      throw new ConflictException(
        `Invalid enforcement transition: ${from} -> ${to}`,
      );
  }
  resolve(policies: readonly ResolvedPolicy[]) {
    const rank = { GLOBAL: 0, MARKET: 1, TENANT: 2 } as const;
    const sorted = [...policies].sort(
      (a, b) => rank[a.level] - rank[b.level] || a.version - b.version,
    );
    const merged = new Map<string, PolicyRuleInput>();
    for (const policy of sorted)
      for (const rule of policy.rules) merged.set(rule.key, rule);
    const selected = sorted.at(-1);
    if (!selected) throw new ConflictException("No active governance policy");
    return {
      ...selected,
      rules: [...merged.values()].sort(
        (a, b) => b.priority - a.priority || a.key.localeCompare(b.key),
      ),
    };
  }
  evaluate(
    policy: ResolvedPolicy,
    context: Readonly<Record<string, unknown>>,
    highRisk: boolean,
  ): PolicyResult {
    const safeContext = this.canonicalContext(context);
    for (const rule of policy.rules)
      if (this.matches(rule, safeContext))
        return this.result(
          policy,
          rule.decision,
          rule.reasonCode,
          safeContext,
          rule.key,
        );
    const fallback: GovernanceDecision =
      highRisk || policy.failMode === "CLOSED"
        ? "BLOCK"
        : policy.failMode === "REVIEW"
          ? "REVIEW"
          : "ALLOW";
    return this.result(
      policy,
      fallback,
      `DEFAULT_${policy.failMode}`,
      safeContext,
    );
  }
  assertAiContext(input: {
    tenantId: string;
    resolvedTenantId: string;
    model: string;
    modelVersion: string;
    promptVersion: string;
    tool?: string;
    confidence?: number;
    requestedBypass?: boolean;
  }) {
    if (input.tenantId !== input.resolvedTenantId)
      throw new ConflictException("AI governance tenant mismatch");
    if (!input.model || !input.modelVersion || !input.promptVersion)
      throw new BadRequestException("AI governance provenance is required");
    if (input.requestedBypass)
      throw new ConflictException("Governance bypass is prohibited");
    if (
      input.confidence !== undefined &&
      (!Number.isFinite(input.confidence) ||
        input.confidence < 0 ||
        input.confidence > 1)
    )
      throw new BadRequestException("Invalid AI confidence");
    return {
      requiresHumanReview:
        input.confidence !== undefined && input.confidence < 0.7,
      reasonCode:
        input.confidence !== undefined && input.confidence < 0.7
          ? "LOW_CONFIDENCE"
          : "AI_PROVENANCE_VALID",
    };
  }
  retentionDecision(input: {
    recordClass: string;
    createdAt: Date;
    now: Date;
    retentionDays: number;
    legalHold: boolean;
    auditProtected: boolean;
    financialProtected: boolean;
    securityProtected: boolean;
  }) {
    if (input.legalHold)
      return { eligible: false, action: "RETAIN", reasonCode: "LEGAL_HOLD" };
    if (
      input.auditProtected ||
      input.financialProtected ||
      input.securityProtected
    )
      return {
        eligible: false,
        action: "ANONYMIZE",
        reasonCode: "PROTECTED_RECORD_CLASS",
      };
    const eligible =
      input.now.getTime() >=
      input.createdAt.getTime() + input.retentionDays * 86_400_000;
    return {
      eligible,
      action: eligible ? "DELETE_VIA_ADAPTER" : "RETAIN",
      reasonCode: eligible ? "RETENTION_EXPIRED" : "RETENTION_ACTIVE",
    };
  }
  fingerprint(parts: readonly string[]) {
    return createHash("sha256").update(parts.join("\u001f")).digest("hex");
  }
  private result(
    policy: ResolvedPolicy,
    decision: GovernanceDecision,
    reasonCode: string,
    context: Record<string, string | number | boolean | null>,
    ruleKey?: string,
  ): PolicyResult {
    return {
      decision,
      reasonCode,
      policyVersionId: policy.versionId,
      ruleKey,
      deterministicKey: this.fingerprint([
        policy.versionId,
        JSON.stringify(context),
        decision,
        reasonCode,
      ]),
    };
  }
  private canonicalContext(context: Readonly<Record<string, unknown>>) {
    const entries = Object.entries(context).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const output: Record<string, string | number | boolean | null> = {};
    for (const [key, value] of entries) {
      if (!/^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/.test(key))
        throw new BadRequestException("Invalid policy context key");
      if (
        (typeof value === "number" && !Number.isFinite(value)) ||
        (value !== null &&
          !["string", "number", "boolean"].includes(typeof value))
      )
        throw new BadRequestException(
          "Policy context accepts scalar values only",
        );
      output[key] = value as string | number | boolean | null;
    }
    return output;
  }
  private matches(
    rule: PolicyRuleInput,
    context: Record<string, string | number | boolean | null>,
  ) {
    const actual = context[rule.field];
    switch (rule.operator) {
      case "EXISTS":
        return actual !== undefined && actual !== null;
      case "EQUALS":
        return actual === rule.value;
      case "IN":
        return Array.isArray(rule.value) && rule.value.includes(String(actual));
      case "GREATER_THAN":
        return (
          typeof actual === "number" &&
          typeof rule.value === "number" &&
          actual > rule.value
        );
      case "LESS_THAN":
        return (
          typeof actual === "number" &&
          typeof rule.value === "number" &&
          actual < rule.value
        );
    }
  }
}
