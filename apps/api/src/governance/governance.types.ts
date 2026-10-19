export type GovernanceDecision = "ALLOW" | "REVIEW" | "BLOCK";
export type PolicyStatus =
  "DRAFT" | "REVIEW" | "APPROVED" | "ACTIVE" | "SUPERSEDED" | "RETIRED";
export type DisputeState =
  | "OPEN"
  | "EVIDENCE_COLLECTION"
  | "AI_TRIAGE"
  | "HUMAN_REVIEW"
  | "DECISION"
  | "APPEAL"
  | "RESOLUTION"
  | "CLOSED"
  | "CANCELLED"
  | "REJECTED";
export type PrivacyRequestState =
  | "SUBMITTED"
  | "IDENTITY_VERIFICATION"
  | "IN_REVIEW"
  | "APPROVED"
  | "PROCESSING"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELLED";
export type EnforcementState =
  "PROPOSED" | "REVIEW" | "ACTIVE" | "LIFTED" | "EXPIRED" | "CANCELLED";
export type RuleOperator =
  "EQUALS" | "IN" | "GREATER_THAN" | "LESS_THAN" | "EXISTS";
export interface PolicyRuleInput {
  key: string;
  field: string;
  operator: RuleOperator;
  value?: string | number | boolean | readonly string[];
  decision: GovernanceDecision;
  reasonCode: string;
  priority: number;
}
export interface ResolvedPolicy {
  policyId: string;
  versionId: string;
  version: number;
  level: "GLOBAL" | "MARKET" | "TENANT";
  failMode: "OPEN" | "CLOSED" | "REVIEW";
  rules: readonly PolicyRuleInput[];
}
export interface PolicyResult {
  decision: GovernanceDecision;
  reasonCode: string;
  policyVersionId: string;
  ruleKey?: string;
  deterministicKey: string;
}
