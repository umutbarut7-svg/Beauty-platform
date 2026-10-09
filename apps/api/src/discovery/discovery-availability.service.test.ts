import { describe, expect, it, vi } from "vitest";
import { DiscoveryAvailabilityService } from "./discovery-availability.service.js";
import type { SearchCandidate } from "./search-provider.js";

const candidate: SearchCandidate = {
  id: "business-a",
  name: "Salon",
  slug: "salon",
  description: null,
  logoUrl: null,
  city: null,
  district: null,
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
};

describe("DiscoveryAvailabilityService", () => {
  it("reuses authoritative availability and excludes unavailable candidates", async () => {
    const calculate = vi
      .fn()
      .mockResolvedValueOnce([
        {
          startsAt: "2026-10-01T09:00:00.000Z",
          endsAt: "2026-10-01T09:30:00.000Z",
          staffId: "staff-a",
        },
      ])
      .mockResolvedValueOnce([]);
    const service = new DiscoveryAvailabilityService({ calculate } as never);
    const result = await service.resolve(
      [candidate, { ...candidate, id: "business-b" }],
      {
        serviceId: "service-a",
        availableFrom: "2026-10-01T08:00:00.000Z",
        availableTo: "2026-10-01T10:00:00.000Z",
      },
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "business-a",
      nextAvailabilityAt: "2026-10-01T09:00:00.000Z",
      availableStaffIds: ["staff-a"],
    });
    expect(calculate).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "business-a",
        serviceId: "service-a",
      }),
    );
  });
});
