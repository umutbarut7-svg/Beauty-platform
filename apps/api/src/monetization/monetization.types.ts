import type { Money } from "../globalization/globalization.types.js";
export const SUBSCRIPTION_STATUSES = [
  "TRIAL",
  "ACTIVE",
  "PAST_DUE",
  "PAUSED",
  "CANCELLED",
  "EXPIRED",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export const PRICING_MODELS = [
  "FIXED",
  "RECURRING",
  "USAGE",
  "TIERED",
  "PER_SEAT",
  "PER_LOCATION",
  "PER_PROFESSIONAL",
  "TRANSACTION",
  "COMMISSION",
  "HYBRID",
] as const;
export type PricingModel = (typeof PRICING_MODELS)[number];
export const REVENUE_STREAMS = [
  "SUBSCRIPTION",
  "MARKETPLACE_COMMISSION",
  "BOOKING_FEE",
  "PAYMENT_MARKUP",
  "PREMIUM_LISTING",
  "PROMOTED_PLACEMENT",
  "LEAD_GENERATION",
  "AI_PREMIUM",
  "API_USAGE",
  "ADVERTISING",
  "ECOMMERCE_COMMISSION",
] as const;
export type RevenueStream = (typeof REVENUE_STREAMS)[number];
export const LEDGER_ENTRY_TYPES = [
  "CHARGE",
  "COMMISSION",
  "PLATFORM_FEE",
  "REFUND",
  "CREDIT",
  "PAYOUT",
  "ADJUSTMENT",
  "REVERSAL",
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];
export interface PriceConfiguration {
  model: PricingModel;
  currency: string;
  amountMinor: bigint;
  tiers?: ReadonlyArray<{ upTo: bigint | null; unitAmountMinor: bigint }>;
  percentageBasisPoints?: bigint;
  minimumMinor?: bigint;
  maximumMinor?: bigint;
}
export interface CommissionConfiguration {
  fixedMinor: bigint;
  percentageBasisPoints: bigint;
  minimumMinor?: bigint;
  maximumMinor?: bigint;
}
export interface PromotionPolicy {
  type: "PERCENTAGE" | "FIXED";
  value: bigint;
  currency?: string;
  minimumBasketMinor: bigint;
  maximumDiscountMinor?: bigint;
  usageLimit?: number;
  perUserLimit?: number;
  validFrom: Date;
  validTo: Date;
  stacking: "EXCLUSIVE" | "STACKABLE";
}
export interface FinancialEvidence {
  sourceType: string;
  sourceId: string;
}
export interface ForecastResult {
  status: "AVAILABLE" | "INSUFFICIENT_DATA";
  amount?: Money;
  confidenceBasisPoints: number;
  horizonDays: number;
  inputCoverageBasisPoints: number;
  evidence: FinancialEvidence[];
}
