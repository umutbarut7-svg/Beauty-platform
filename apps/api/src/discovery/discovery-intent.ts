import type {
  DiscoveryIntent,
  DiscoverySearchQuery,
} from "@beauty-platform/types";

export interface MatchContext {
  userId?: string;
  customerId?: string;
  intent: DiscoveryIntent;
  trustRequired: boolean;
  availabilityRequired: boolean;
}

export interface MatchEngine {
  match(context: MatchContext): Promise<unknown>;
}

export function intentToSearchQuery(
  intent: DiscoveryIntent,
): DiscoverySearchQuery {
  const query: DiscoverySearchQuery = {
    query: intent.query,
    categoryId: intent.categoryId,
    category: intent.category,
    serviceId: intent.serviceId,
    service: intent.service,
    professionalId: intent.professionalId,
    professional: intent.professional,
    businessId: intent.businessId,
    business: intent.business,
    locationId: intent.locationId,
    location: intent.location,
    city: intent.city,
    district: intent.district,
    latitude: intent.latitude,
    longitude: intent.longitude,
    radiusKm: intent.radiusKm,
    minPrice: intent.minPrice,
    maxPrice: intent.maxPrice,
    minDurationMinutes: intent.minDurationMinutes,
    maxDurationMinutes: intent.maxDurationMinutes,
    minRating: intent.minRating,
    verifiedOnly: intent.verifiedOnly,
    availableFrom: intent.availableFrom,
    availableTo: intent.availableTo,
    sort: intent.sort,
    cursor: intent.cursor,
    limit: intent.limit,
    entityType: intent.entityType,
  };
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined),
  ) as DiscoverySearchQuery;
}
