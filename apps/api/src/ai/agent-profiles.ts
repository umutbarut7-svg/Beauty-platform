import { Injectable } from "@nestjs/common";
export interface DomainAgentProfile {
  readonly type: string;
  readonly allowedTools: readonly string[];
  readonly unavailableCapabilities: readonly string[];
}
@Injectable()
export class CustomerBeautyAgent implements DomainAgentProfile {
  readonly type = "CUSTOMER_BEAUTY";
  readonly allowedTools = [
    "discovery.search",
    "availability.check",
    "business.get",
    "prediction.list",
    "prediction.next_service",
    "prediction.maintenance_window",
    "prediction.rebooking",
  ] as const;
  readonly unavailableCapabilities = [
    "beautyPassport",
    "beautyDna",
    "resultHistory",
  ] as const;
}
@Injectable()
export class BusinessGrowthAgent implements DomainAgentProfile {
  readonly type = "BUSINESS_GROWTH";
  readonly allowedTools = ["business.get"] as const;
  readonly unavailableCapabilities = [
    "businessInsights",
    "automaticPricing",
    "campaignMutation",
  ] as const;
}
@Injectable()
export class ProfessionalCopilot implements DomainAgentProfile {
  readonly type = "PROFESSIONAL_COPILOT";
  readonly allowedTools = ["availability.check", "booking.get"] as const;
  readonly unavailableCapabilities = [
    "professionalIntelligence",
    "careerIntelligence",
  ] as const;
}
