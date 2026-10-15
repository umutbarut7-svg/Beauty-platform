export type ReferralState =
  | "CREATED"
  | "CLICKED"
  | "SIGNED_UP"
  | "QUALIFIED"
  | "CONVERTED"
  | "REWARDED"
  | "EXPIRED"
  | "REJECTED"
  | "CANCELLED"
  | "REVERSED"
  | "FRAUD_REVIEW";
export type RiskDecision = "ALLOW" | "REVIEW" | "BLOCK";
export type LifecycleState =
  "NEW" | "ACTIVATED" | "ENGAGED" | "AT_RISK" | "DORMANT" | "REACTIVATED";
export type QualificationRule =
  | { type: "REGISTRATION_COMPLETED" }
  | { type: "IDENTITY_VERIFIED" }
  | { type: "FIRST_BOOKING_COMPLETED" }
  | { type: "PAYMENT_MINIMUM"; amountMinor: string; currency: string }
  | { type: "MARKET"; marketId: string }
  | { type: "CATEGORY"; categoryId: string }
  | { type: "REFUND_WINDOW_PASSED"; hours: number };
export interface QualificationFacts {
  registrationCompleted: boolean;
  identityVerified: boolean;
  firstBookingCompleted: boolean;
  paymentAmountMinor?: bigint;
  currency?: string;
  marketId?: string;
  categoryId?: string;
  qualifiedActionAt?: Date;
  now: Date;
}
export interface GrowthEventEnvelope {
  eventId: string;
  type: string;
  tenantId: string;
  marketId: string;
  subjectId?: string;
  actorId?: string;
  timestamp: Date;
  correlationId: string;
  causationId?: string;
  payload: Record<string, unknown>;
}
export interface ExperimentVariantInput {
  key: string;
  weight: number;
}
export interface GrowthMetricInput {
  activeUsers: number;
  invitesSent: number;
  clicks: number;
  signups: number;
  qualified: number;
  conversions: number;
  rewardsGranted: number;
}
