import { Injectable } from "@nestjs/common";
@Injectable()
export class AgentCapabilities {
  readonly values = {
    booking: "AVAILABLE",
    discovery: "AVAILABLE",
    availability: "AVAILABLE",
    beautyPassport: "NOT_AVAILABLE",
    beautyDna: "NOT_AVAILABLE",
    businessInsights: "NOT_AVAILABLE",
    professionalIntelligence: "NOT_AVAILABLE",
    voiceTranscription: "NOT_AVAILABLE",
    visionExtraction: "NOT_AVAILABLE",
  } as const;
  get(name: keyof typeof this.values) {
    return this.values[name];
  }
}
