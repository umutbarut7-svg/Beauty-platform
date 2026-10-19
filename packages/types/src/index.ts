/** A lightweight response shared by platform health checks. */
export * from "./mvp-client.js";
export interface HealthStatus {
  readonly service: string;
  readonly status: "ok";
}

export function createHealthStatus(service: string): HealthStatus {
  return { service, status: "ok" };
}

export const USER_ROLES = [
  "SUPER_ADMIN",
  "BUSINESS_OWNER",
  "BUSINESS_ADMIN",
  "STAFF",
  "CUSTOMER",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const BUSINESS_ROLES = [
  "BUSINESS_OWNER",
  "BUSINESS_ADMIN",
  "MANAGER",
  "STAFF",
] as const;

export type BusinessRole = (typeof BUSINESS_ROLES)[number];

/** PENDING and IN_PROGRESS are the backward-compatible BOOKED and IN_SERVICE states. */
export const APPOINTMENT_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const NOTIFICATION_CHANNELS = [
  "IN_APP",
  "EMAIL",
  "SMS",
  "PUSH",
  "WHATSAPP",
] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export const NOTIFICATION_CATEGORIES = [
  "BOOKING",
  "BOOKING_REMINDER",
  "BOOKING_CHANGE",
  "DEMAND",
  "BEAUTY_JOB",
  "RESULT",
  "PAYMENT",
  "SECURITY",
  "SYSTEM",
  "MARKETING",
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export const NOTIFICATION_STATUSES = [
  "PENDING",
  "SCHEDULED",
  "PROCESSING",
  "SENT",
  "DELIVERED",
  "FAILED",
  "CANCELLED",
  "SKIPPED",
] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];
export const MESSAGE_STATUSES = ["SENT", "DELIVERED", "READ"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const SEARCH_SORTS = [
  "RELEVANCE",
  "RATING",
  "PRICE_ASC",
  "PRICE_DESC",
  "DISTANCE",
] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];
export const DISCOVERY_INTENT_SOURCES = ["TEXT", "VOICE", "PHOTO"] as const;
export type DiscoveryIntentSource = (typeof DISCOVERY_INTENT_SOURCES)[number];
export type DiscoveryEntityType =
  "ALL" | "BUSINESS" | "SERVICE" | "PROFESSIONAL";
export interface DiscoverySearchQuery {
  market?: string;
  locale?: string;
  currency?: string;
  timezone?: string;
  countryCode?: string;
  query?: string;
  categoryId?: string;
  category?: string;
  subcategoryId?: string;
  serviceTypeId?: string;
  capability?: string;
  professionalSkill?: string;
  serviceId?: string;
  service?: string;
  professionalId?: string;
  professional?: string;
  businessId?: string;
  business?: string;
  locationId?: string;
  location?: string;
  city?: string;
  district?: string;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  minPrice?: number;
  maxPrice?: number;
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
  minRating?: number;
  verifiedOnly?: boolean;
  availableFrom?: string;
  availableTo?: string;
  sort?: SearchSort;
  cursor?: string;
  limit?: number;
  entityType?: DiscoveryEntityType;
}
export interface DiscoveryIntent extends DiscoverySearchQuery {
  source: DiscoveryIntentSource;
  userId?: string;
  customerId?: string;
  attributes?: Readonly<Record<string, string | number | boolean>>;
}
export interface PublicBusinessSummary {
  businessId: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  city: string | null;
  district: string | null;
  categories: ReadonlyArray<{ id: string; name: string; slug: string }>;
  services: ReadonlyArray<{
    id: string;
    name: string;
    price: string;
    currency: string;
    durationMinutes: number;
  }>;
  professionals: ReadonlyArray<{
    id: string;
    displayName: string;
    title: string | null;
    completedAppointments: number;
    expertiseScore: number | null;
  }>;
  rating: { average: number; count: number } | null;
  verified: boolean;
  priceRange: { min: string; max: string; currency: string } | null;
  nextAvailabilityAt: string | null;
  distanceKm: number | null;
  distanceMeters: number | null;
  resultProbability: number | null;
}
export interface DiscoverySearchResult extends PublicBusinessSummary {
  ranking: { score: number; matchedSignals: readonly string[] };
}
export interface DiscoverySearchResponse {
  items: DiscoverySearchResult[];
  nextCursor: string | null;
  provider: "DATABASE";
  fallbackUsed: boolean;
  meta: {
    noMatch: boolean;
    totalCandidates: number;
    filteredCount: number;
    availabilityEvaluated: boolean;
  };
}
export interface SearchProviderStatus {
  provider: string;
  available: boolean;
  fallbackAvailable: boolean;
  reason?: string;
}

export const AGENT_INTENTS = [
  "DISCOVER_BUSINESS",
  "DISCOVER_SERVICE",
  "DISCOVER_PROFESSIONAL",
  "CHECK_AVAILABILITY",
  "CREATE_BOOKING",
  "MODIFY_BOOKING",
  "CANCEL_BOOKING",
  "VIEW_BOOKING",
  "BEAUTY_ADVICE",
  "BUSINESS_INSIGHT",
  "PROFESSIONAL_ASSISTANCE",
  "UNKNOWN",
] as const;
export type AgentIntent = (typeof AGENT_INTENTS)[number];
export type AgentSessionStatus =
  | "ACTIVE"
  | "NEEDS_INFORMATION"
  | "NEEDS_CONFIRMATION"
  | "EXECUTING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "NO_MATCH";
export interface AgentSmartQuestion {
  field: string;
  reason: string;
  priority: number;
  questionKey: string;
}
export interface AgentPendingActionSummary {
  actionId: string;
  toolName: string;
  summary: string;
  expiresAt: string;
}
export interface AgentResponse {
  sessionId: string;
  status: AgentSessionStatus;
  message: string;
  intent: AgentIntent;
  goal: string | null;
  question: AgentSmartQuestion | null;
  options: unknown[];
  pendingAction: AgentPendingActionSummary | null;
  result: unknown | null;
  meta: { noMatch: boolean; capability?: "AVAILABLE" | "NOT_AVAILABLE" };
}
