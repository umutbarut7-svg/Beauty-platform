import { describe, expect, it } from "vitest";
import { GeoService } from "./geo.service.js";
import type { SearchCandidate } from "./search-provider.js";

const candidate = (overrides: Partial<SearchCandidate>): SearchCandidate => ({
  id: "business",
  name: "Salon",
  slug: "salon",
  description: null,
  logoUrl: null,
  city: "İstanbul",
  district: "Kadıköy",
  latitude: null,
  longitude: null,
  isVerified: false,
  locations: [],
  categories: [],
  services: [],
  staff: [],
  ratings: [],
  nextAvailabilityAt: null,
  availableStaffIds: [],
  ...overrides,
});

describe("GeoService", () => {
  it("calculates deterministic haversine distance", () => {
    const geo = new GeoService();
    expect(
      geo.distanceKm(
        { latitude: 41.0082, longitude: 28.9784 },
        { latitude: 40.9909, longitude: 29.0283 },
      ),
    ).toBeCloseTo(4.6, 0);
  });
  it("uses the nearest active location coordinate and preserves unknown", () => {
    const geo = new GeoService();
    expect(
      geo.candidateDistance(
        candidate({
          locations: [
            {
              id: "far",
              name: "Far",
              city: "Istanbul",
              district: null,
              latitude: 42,
              longitude: 30,
            },
            {
              id: "near",
              name: "Near",
              city: "Istanbul",
              district: null,
              latitude: 41.001,
              longitude: 29.001,
            },
          ],
        }),
        { latitude: 41, longitude: 29 },
      ),
    ).toBeLessThan(1);
    expect(geo.candidateDistance(candidate({}), {})).toBeNull();
  });
});
