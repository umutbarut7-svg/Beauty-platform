export const LIQUIDITY_WINDOWS = [
  "DAILY",
  "WEEKLY",
  "ROLLING_7_DAYS",
  "ROLLING_30_DAYS",
  "ROLLING_90_DAYS",
] as const;
export const DEMAND_SIGNAL_TYPES = [
  "SEARCH",
  "DISCOVERY_IMPRESSION",
  "PROFILE_VIEW",
  "SERVICE_VIEW",
  "MATCH_REQUEST",
  "BOOKING_INTENT",
  "BOOKING_ATTEMPT",
  "COMPLETED_BOOKING",
  "UNFULFILLED_DEMAND",
  "NO_MATCH",
  "AVAILABILITY_MISS",
  "REPEAT_DEMAND",
  "PREDICTED_DEMAND",
] as const;
export const SUPPLY_SIGNAL_TYPES = [
  "BOOKABLE_SERVICE",
  "QUALIFIED_PROFESSIONAL",
  "AVAILABLE_SLOT",
  "VERIFIED_RESULT",
  "TRUST_EVIDENCE",
] as const;
export const LIQUIDITY_HEALTH = [
  "HEALTHY",
  "DEMAND_CONSTRAINED",
  "SUPPLY_CONSTRAINED",
  "CAPACITY_CONSTRAINED",
  "MATCH_CONSTRAINED",
  "TRUST_CONSTRAINED",
  "DATA_INSUFFICIENT",
] as const;
export const DATA_STATES = [
  "ZERO",
  "NO_DATA",
  "INSUFFICIENT_DATA",
  "AVAILABLE",
  "NO_MATCH",
  "STALE_DATA",
  "INVALID_SCOPE",
] as const;
export type LiquidityWindow = (typeof LIQUIDITY_WINDOWS)[number];
export type DemandSignalType = (typeof DEMAND_SIGNAL_TYPES)[number];
export type SupplySignalType = (typeof SUPPLY_SIGNAL_TYPES)[number];
export type LiquidityHealth = (typeof LIQUIDITY_HEALTH)[number];
export type SignalSource = "OBSERVED" | "DERIVED" | "PREDICTED";
export interface LiquidityInputs {
  demand: number | null;
  supply: number | null;
  capacity: number | null;
  matches: number | null;
  completedBookings: number | null;
  freshness: number;
  sampleSize: number;
}
export interface RouteCandidate {
  id: string;
  suitability: number | null;
  resultProbability: number | null;
  confidence: number;
  capacity: number | null;
  trust: number | null;
  evidenceCount: number;
  sponsored?: boolean;
  commercialValue?: number;
}
export type MarketplaceIntervention =
  | "READ_ONLY_INSIGHT"
  | "RECOMMENDATION"
  | "LOW_RISK_ACTION"
  | "REQUIRES_CONFIRMATION"
  | "PROHIBITED_AUTONOMOUS";
