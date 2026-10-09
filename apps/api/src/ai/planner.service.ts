import { Injectable } from "@nestjs/common";
import type { AgentIntent, AgentPlan } from "./agent.types.js";
import type { AgentMessageDto } from "./agent.dto.js";
const TOOL_BY_INTENT: Partial<Record<AgentIntent, string>> = {
  DISCOVER_BUSINESS: "discovery.search",
  DISCOVER_SERVICE: "discovery.search",
  DISCOVER_PROFESSIONAL: "discovery.search",
  CHECK_AVAILABILITY: "availability.check",
  CREATE_BOOKING: "booking.create",
  MODIFY_BOOKING: "booking.modify",
  CANCEL_BOOKING: "booking.cancel",
  VIEW_BOOKING: "booking.get",
};
@Injectable()
export class AgentPlanner {
  plan(message: AgentMessageDto): AgentPlan {
    const text = message.content
      .normalize("NFC")
      .trim()
      .toLocaleLowerCase("tr-TR");
    const intent = message.intent ?? this.detect(text);
    const toolName = message.requestedTool ?? TOOL_BY_INTENT[intent];
    const args = { ...(message.arguments ?? {}) };
    const missing = this.required(toolName).filter(
      (key) => args[key] === undefined,
    );
    const field = missing[0];
    return {
      intent,
      goal: intent === "UNKNOWN" ? null : intent,
      toolName,
      arguments: args,
      missingInformation: missing,
      question: field
        ? {
            field,
            reason: "Tool execution requires this value",
            priority: 100,
            questionKey: `agent.question.${field}`,
          }
        : undefined,
    };
  }
  private detect(text: string): AgentIntent {
    if (/iptal|cancel/.test(text)) return "CANCEL_BOOKING";
    if (/değiştir|reschedule|modify/.test(text)) return "MODIFY_BOOKING";
    if (/randevu|ayırt|book/.test(text)) return "CREATE_BOOKING";
    if (/müsait|availability/.test(text)) return "CHECK_AVAILABILITY";
    if (/salon|işletme|hizmet|professional|uzman|ara|bul/.test(text))
      return "DISCOVER_SERVICE";
    return "UNKNOWN";
  }
  private required(tool?: string) {
    return tool === "availability.check"
      ? ["serviceId", "locationId", "date"]
      : tool === "booking.create"
        ? ["locationId", "serviceId", "staffMemberId", "startsAt"]
        : tool === "booking.modify"
          ? ["appointmentId"]
          : tool === "booking.cancel" || tool === "booking.get"
            ? ["appointmentId"]
            : [];
  }
}
