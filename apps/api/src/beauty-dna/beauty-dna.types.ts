export const BEAUTY_DNA_CATEGORIES = [
  "HAIR",
  "SKIN",
  "NAIL",
  "MAKEUP",
  "BROW",
  "LASH",
  "BEARD",
  "BODY",
  "WELLNESS",
] as const;
export type BeautyDNACategory = (typeof BEAUTY_DNA_CATEGORIES)[number];
export const BEAUTY_DNA_SOURCES = [
  "DECLARED",
  "OBSERVED",
  "DERIVED",
  "INFERRED",
] as const;
export type BeautyDNASource = (typeof BEAUTY_DNA_SOURCES)[number];
export const EVIDENCE_SOURCES = [
  "BOOKING",
  "BEAUTY_JOB",
  "RESULT",
  "BEAUTY_PASSPORT",
  "CUSTOMER_FEEDBACK",
  "VERIFIED_PROFILE_INPUT",
  "PREDICTION",
] as const;
export const PROHIBITED_TRAITS = [
  "face_recognition",
  "identity",
  "ethnicity",
  "race",
  "health_diagnosis",
  "medical_diagnosis",
  "religion",
  "political_affiliation",
  "sexual_orientation",
] as const;
export interface TraitEvidenceInput {
  value: string;
  reliability: number;
  occurredAt: Date;
}
export interface ResolvedTrait {
  value: string;
  normalizedValue: string;
  confidence: number;
  freshness: number;
  conflict: boolean;
  evidenceCount: number;
}
export interface BeautyMatchContext {
  categories: string[];
  preferences: Array<{
    category: string;
    traitType: string;
    value: string;
    confidence: number;
  }>;
}
