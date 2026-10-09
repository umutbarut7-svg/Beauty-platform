import type { DiscoverySearchQuery } from "@beauty-platform/types";
export interface SearchCandidate {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  city: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  isVerified: boolean;
  locations: {
    id: string;
    name: string;
    city: string;
    district: string | null;
    latitude: number | null;
    longitude: number | null;
  }[];
  categories: { id: string; name: string; slug: string }[];
  services: {
    id: string;
    name: string;
    price: string;
    currency: string;
    durationMinutes: number;
  }[];
  staff: {
    id: string;
    displayName: string;
    title: string | null;
    serviceIds: string[];
    completedAppointments: number;
  }[];
  ratings: number[];
  nextAvailabilityAt: string | null;
  availableStaffIds: string[];
}
export interface SearchProvider {
  readonly name: string;
  searchCandidates(query: DiscoverySearchQuery): Promise<SearchCandidate[]>;
  health(): Promise<{ available: boolean; reason?: string }>;
}
export class SearchProviderUnavailableError extends Error {
  readonly code = "SEARCH_PROVIDER_UNAVAILABLE";
  constructor(provider: string) {
    super(`Search provider ${provider} is unavailable`);
  }
}
