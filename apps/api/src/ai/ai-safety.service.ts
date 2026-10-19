import { Injectable } from "@nestjs/common";
import { redactAI } from "./ai-redaction.js";
import type {
  AIRiskCategory,
  AIRiskSeverity,
  AISafetyDecision,
} from "./ai-safety.types.js";
const weight: Record<AIRiskSeverity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};
@Injectable()
export class AISafetyEngine {
  evaluate(
    value: unknown,
    context: {
      allowedTools?: readonly string[];
      requestedTool?: string;
      businessId?: string;
      argumentBusinessId?: string;
    } = {},
  ): AISafetyDecision {
    const text = JSON.stringify(value).toLocaleLowerCase("en-US");
    const findings: Array<{
      category: AIRiskCategory;
      severity: AIRiskSeverity;
    }> = [];
    if (
      /ignore (all |the )?(previous|prior|system) instructions|reveal (the )?system prompt|developer message/.test(
        text,
      )
    )
      findings.push({ category: "PROMPT_INJECTION", severity: "HIGH" });
    if (
      /(?:api[_ -]?key|client[_ -]?secret|bearer)\s*[:=]\s*[a-z0-9._-]{8,}/i.test(
        text,
      )
    )
      findings.push({ category: "SECRET_EXPOSURE", severity: "CRITICAL" });
    if (
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(JSON.stringify(value))
    )
      findings.push({ category: "PII_EXPOSURE", severity: "MEDIUM" });
    if (
      context.requestedTool &&
      context.allowedTools &&
      !context.allowedTools.includes(context.requestedTool)
    )
      findings.push({ category: "TOOL_INJECTION", severity: "HIGH" });
    if (
      context.argumentBusinessId &&
      context.businessId &&
      context.argumentBusinessId !== context.businessId
    )
      findings.push({ category: "CROSS_TENANT_ACCESS", severity: "CRITICAL" });
    const severity = findings.reduce<AIRiskSeverity>(
      (max, x) => (weight[x.severity] > weight[max] ? x.severity : max),
      "LOW",
    );
    return {
      allowed: weight[severity] < 3,
      severity,
      categories: [...new Set(findings.map((x) => x.category))],
      sanitized: redactAI(value),
    };
  }
}
