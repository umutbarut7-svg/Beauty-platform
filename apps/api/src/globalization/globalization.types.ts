export const MEASUREMENT_SYSTEMS = ["METRIC", "IMPERIAL"] as const;
export type MeasurementSystem = (typeof MEASUREMENT_SYSTEMS)[number];
export const PAYMENT_METHODS = [
  "CARD",
  "BANK_TRANSFER",
  "WALLET",
  "CASH",
  "LOCAL_PAYMENT_METHOD",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const MARKET_FEATURES = [
  "AI",
  "PAYMENTS",
  "MARKETPLACE",
  "REVIEWS",
  "COMMERCE",
  "PROFESSIONAL_VERIFICATION",
] as const;
export type MarketFeature = (typeof MARKET_FEATURES)[number];
export interface MarketPolicy {
  id: string;
  marketId: string;
  marketKey: string;
  countryCode: string;
  version: number;
  defaultLocale: string;
  supportedLocales: readonly string[];
  defaultCurrency: string;
  supportedCurrencies: readonly string[];
  defaultTimezone: string;
  supportedTimezones: readonly string[];
  measurementSystem: MeasurementSystem;
  featureFlags: Readonly<Record<string, boolean>>;
  supportedPaymentMethods: readonly PaymentMethod[];
  bookingPolicy: {
    minimumLeadMinutes: number;
    maximumAdvanceDays: number;
    cancellationWindowMinutes: number;
    rescheduleWindowMinutes: number;
  };
  addressPolicy: {
    administrativeAreaRequired: boolean;
    postalCodeRequired: boolean;
    postalCodePattern?: string;
  };
  effectiveFrom: Date;
  effectiveTo: Date | null;
}
export interface GlobalizationPreferences {
  locale?: string;
  language?: string;
  currency?: string;
  timezone?: string;
  measurementSystem?: MeasurementSystem;
}
export interface ResolvedGlobalizationContext {
  marketId: string;
  marketKey: string;
  marketConfigurationId: string;
  marketConfigurationVersion: number;
  countryCode: string;
  locale: string;
  language: string;
  currency: string;
  timezone: string;
  measurementSystem: MeasurementSystem;
}
export interface Money {
  amountMinor: bigint;
  currency: string;
}
export interface FxRate {
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  provider: string;
  effectiveAt: Date;
  expiresAt: Date;
  version: number;
}
export interface GlobalAddress {
  countryCode: string;
  administrativeArea?: string;
  locality: string;
  dependentLocality?: string;
  postalCode?: string;
  addressLine1: string;
  addressLine2?: string;
}
