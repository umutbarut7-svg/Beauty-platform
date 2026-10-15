import { Injectable } from "@nestjs/common";
import type { AgentLimits, AgentTool, PolicyDecision } from "./agent.types.js";
@Injectable()
export class AgentPolicyEngine {
  evaluate(input: {
    tool: AgentTool;
    authenticated: boolean;
    sameTenant: boolean;
    permissionGranted?: boolean;
    confirmed: boolean;
    missing: string[];
    toolCalls: number;
    writeActions: number;
    limits: AgentLimits;
  }): PolicyDecision {
    if (!input.authenticated || !input.sameTenant)
      return { decision: "DENY", code: "AUTHORIZATION_DENIED" };
    if (input.permissionGranted === false)
      return { decision: "DENY", code: "TOOL_PERMISSION_DENIED" };
    if (!input.tool.enabled) return { decision: "DENY", code: "TOOL_DISABLED" };
    if (input.missing.length)
      return { decision: "REQUIRE_INFORMATION", code: "MISSING_INFORMATION" };
    if (
      input.toolCalls >= input.limits.maxToolCalls ||
      input.writeActions >= input.limits.maxWriteActions
    )
      return { decision: "DENY", code: "AGENT_LIMIT_EXCEEDED" };
    if (
      input.tool.operationType === "WRITE" &&
      input.tool.requiresConfirmation &&
      !input.confirmed
    )
      return {
        decision: "REQUIRE_CONFIRMATION",
        code: "CONFIRMATION_REQUIRED",
      };
    return { decision: "ALLOW", code: "ALLOWED" };
  }
}
