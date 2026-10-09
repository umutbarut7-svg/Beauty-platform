export const METRIC_CATEGORIES = [
  "REVENUE",
  "BOOKINGS",
  "COMPLETED_JOBS",
  "CANCELLATIONS",
  "NO_SHOWS",
  "UTILIZATION",
  "CAPACITY",
  "REPEAT_CUSTOMERS",
  "NEW_CUSTOMERS",
  "CUSTOMER_RETENTION",
  "AVERAGE_TICKET",
  "SERVICE_MIX",
  "PROFESSIONAL_UTILIZATION",
  "DEMAND",
  "CONVERSION",
  "RESULT_QUALITY",
  "VERIFIED_RESULTS",
] as const;
export const TIME_WINDOWS = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "ROLLING_7_DAYS",
  "ROLLING_30_DAYS",
  "ROLLING_90_DAYS",
] as const;
export type MetricCategory = (typeof METRIC_CATEGORIES)[number];
export type TimeWindow = (typeof TIME_WINDOWS)[number];
export interface MetricPoint {
  category: MetricCategory;
  value: number | null;
  sampleSize: number;
  previousValue?: number | null;
  source: "OBSERVED" | "DERIVED" | "INFERRED" | "BENCHMARKED" | "EXPERIMENTAL";
}
export type GrowthAction =
  | "ANALYZE"
  | "DRAFT_CAMPAIGN"
  | "SEND_CUSTOMER_MESSAGE"
  | "CHANGE_PRICE"
  | "TRANSFER_FUNDS";
