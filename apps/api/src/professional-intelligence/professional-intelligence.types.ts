export const PROFESSIONAL_SKILL_CATEGORIES = [
  "HAIR",
  "NAIL",
  "MAKEUP",
  "SKIN",
  "BARBER",
  "LASH_BROW",
  "AESTHETICS",
] as const;
export const PROFESSIONAL_SOURCES = [
  "DECLARED",
  "OBSERVED",
  "DERIVED",
  "INFERRED",
  "VERIFIED",
] as const;
export type ProfessionalSource = (typeof PROFESSIONAL_SOURCES)[number];
export interface SkillEvidenceEvent {
  eventId: string;
  businessId: string;
  professionalId: string;
  category: string;
  skillCode: string;
  eventType:
    | "JOB_COMPLETED"
    | "RESULT_VERIFIED"
    | "REPEAT_CUSTOMER"
    | "PORTFOLIO_VERIFIED"
    | "CREDENTIAL_VERIFIED";
  sourceId: string;
  occurredAt: Date;
  weight: number;
}
export interface ProfessionalSkillReadModel {
  professionalId: string;
  skills: Array<{
    category: string;
    skillCode: string;
    confidence: number;
    evidenceCount: number;
    verified: boolean;
  }>;
  specializations: Array<{
    category: string;
    skillCode: string;
    confidence: number;
    explanation: string;
  }>;
}
