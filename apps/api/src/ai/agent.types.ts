import type { AuthenticatedUser } from "../auth/auth.types.js";
export const AGENT_INTENTS = [
  "DISCOVER_BUSINESS",
  "DISCOVER_SERVICE",
  "DISCOVER_PROFESSIONAL",
  "CHECK_AVAILABILITY",
  "CREATE_BOOKING",
  "MODIFY_BOOKING",
  "CANCEL_BOOKING",
  "VIEW_BOOKING",
  "BEAUTY_ADVICE",
  "BUSINESS_INSIGHT",
  "PROFESSIONAL_ASSISTANCE",
  "UNKNOWN",
] as const;
export type AgentIntent = (typeof AGENT_INTENTS)[number];
export type AgentStatus =
  | "ACTIVE"
  | "NEEDS_INFORMATION"
  | "NEEDS_CONFIRMATION"
  | "EXECUTING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "NO_MATCH";
export type AgentSource = "TEXT" | "VOICE" | "PHOTO";
export type AgentType =
  "BOOKING" | "CUSTOMER_BEAUTY" | "BUSINESS_GROWTH" | "PROFESSIONAL_COPILOT";
export type ToolOperation = "READ" | "WRITE";
export interface AgentIdentity {
  user: AuthenticatedUser;
  businessId: string;
}
export interface SmartQuestion {
  field: string;
  reason: string;
  priority: number;
  questionKey: string;
}
export interface AgentPlan {
  intent: AgentIntent;
  goal: string | null;
  toolName?: string;
  arguments: Record<string, unknown>;
  missingInformation: string[];
  question?: SmartQuestion;
}
export interface ToolContext extends AgentIdentity {
  sessionId: string;
  confirmedActionId?: string;
}
export interface AgentTool {
  name: string;
  description: string;
  category: string;
  version: "1";
  permission: string;
  operationType: ToolOperation;
  requiresConfirmation: boolean;
  timeoutMs: number;
  enabled: boolean;
  inputKeys: readonly string[];
  execute(
    input: Record<string, unknown>,
    context: ToolContext,
  ): Promise<unknown>;
}
export interface PolicyDecision {
  decision: "ALLOW" | "DENY" | "REQUIRE_CONFIRMATION" | "REQUIRE_INFORMATION";
  code: string;
}
export interface AgentLimits {
  maxPlannerSteps: number;
  maxToolCalls: number;
  maxWriteActions: number;
  maxContextSize: number;
  maxTokens: number;
  maxExecutionTimeMs: number;
  maxRetries: number;
  maxEstimatedCostMicros: number;
}
export interface AgentPublicResponse {
  sessionId: string;
  status: AgentStatus;
  message: string;
  intent: AgentIntent;
  goal: string | null;
  question: SmartQuestion | null;
  options: unknown[];
  pendingAction: null | {
    actionId: string;
    toolName: string;
    summary: string;
    expiresAt: string;
  };
  result: unknown | null;
  meta: { noMatch: boolean; capability?: "AVAILABLE" | "NOT_AVAILABLE" };
}
