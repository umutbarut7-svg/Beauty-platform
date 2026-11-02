export interface PhotoCapability {
  available: boolean;
  policy: { version: string; notice: string; retentionHours: number } | null;
  reason: string;
}
export interface MvpVisualSession {
  id: string;
  status: string;
  attempts: number;
  expiresAt: string;
  provider: string | null;
  model: string | null;
  output: null | {
    status: "NEEDS_INFORMATION" | "PLAN";
    observations: string[];
    questions: string[];
    steps: string[];
    searchQuery: string;
    limitations: string[];
  };
}
export interface MvpVisualSessionSummary {
  id: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  intent: string;
  target: string;
  consentId: string;
}
export interface SemanticMatches {
  provider: "OPENAI_PGVECTOR";
  status: "MATCHED" | "NO_MATCH";
  reason?: "CONSULTATION_UNCLEAR";
  items: Array<{
    businessId: string;
    serviceId: string;
    businessName: string;
    serviceName: string;
    similarity: number;
  }>;
}
export interface VisualMatchingStatus {
  status: "NOT_REQUESTED" | "RUNNING" | "READY" | "FAILED";
  result: SemanticMatches | null;
}
export interface MvpVerificationPolicy {
  automatic: false;
  policy: null | {
    version: string;
    notice: string;
    fields: Array<{ key: string; label: string }>;
  };
}
export interface MvpVerificationRequest {
  id: string;
  policyVersion: string;
  answers: Record<string, string>;
  status: string;
  reviewNote: string | null;
}
