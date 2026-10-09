export const PREDICTION_TYPES = [
  "NEXT_LIKELY_SERVICE",
  "NEXT_LIKELY_BOOKING_WINDOW",
  "MAINTENANCE_REFRESH_NEED",
  "HAIR_COLOR_REFRESH_WINDOW",
  "HAIRCUT_REFRESH_WINDOW",
  "EXTENSION_MAINTENANCE_REMOVAL",
  "NAIL_MAINTENANCE_WINDOW",
  "SKINCARE_RECURRENCE",
  "REBOOKING_LIKELIHOOD",
  "CHURN_INACTIVITY_RISK",
  "PREFERRED_PROFESSIONAL",
  "PREFERRED_BUSINESS",
  "PREFERRED_TIME_DAY",
  "PRICE_SENSITIVITY",
  "LIKELY_BEAUTY_GOAL_CATEGORY",
  "RESULT_SATISFACTION_TREND",
  "DEMAND_TIMING",
] as const;
export type PredictionType = (typeof PREDICTION_TYPES)[number];
export const PROHIBITED_FEATURES = [
  "healthDiagnosis",
  "medicalDiagnosis",
  "psychologicalInference",
  "ethnicity",
  "religion",
  "sexualOrientation",
] as const;
export interface AppointmentSignal {
  id: string;
  status: string;
  serviceId: string;
  staffId: string | null;
  startsAt: Date;
  price: number;
}
export interface PredictionFeatures {
  completedCount: number;
  totalCount: number;
  daysSinceLastService: number | null;
  averageRebookingIntervalDays: number | null;
  bookingFrequencyPer90Days: number;
  cancellationRate: number;
  preferredWeekday: number | null;
  preferredHour: number | null;
  serviceAffinity: { id: string; ratio: number } | null;
  professionalAffinity: { id: string; ratio: number } | null;
  averagePrice: number | null;
  consistency: number;
}
export interface ConfidenceResult {
  confidence: number;
  band: "LOW" | "MEDIUM" | "HIGH";
  sufficient: boolean;
}
