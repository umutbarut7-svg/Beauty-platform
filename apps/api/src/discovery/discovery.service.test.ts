import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { DiscoveryService } from "./discovery.service.js";
import { RankingService } from "./ranking.service.js";
import type { SearchCandidate } from "./search-provider.js";
const c = (id: string): SearchCandidate => ({
  id,
  name: `Salon ${id}`,
  slug: id,
  description: "public",
  logoUrl: null,
  city: "Istanbul",
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
});
function service(rows = [c("a"), c("b"), c("c")], available = true) {
  return new DiscoveryService(
    {
      name: "DATABASE",
      health: async () => ({ available }),
      searchCandidates: async () => rows,
    } as never,
    new RankingService(),
    {
      resolve: async (
        candidates: SearchCandidate[],
        query: { availableFrom?: string },
      ) => (query.availableFrom ? [] : candidates),
    } as never,
    { probability: async () => null } as never,
    { discovery: () => undefined } as never,
  );
}
describe("DiscoveryService", () => {
  it("returns a public-safe projection and cursor pages without duplicates", async () => {
    const first = await service().search({ sort: "RELEVANCE", limit: 2 });
    expect(first.items.map((x) => x.businessId)).toEqual(["a", "b"]);
    expect(JSON.stringify(first)).not.toContain("internalNote");
    expect(first.meta).toMatchObject({ noMatch: false, totalCandidates: 3 });
    expect(first.items[0]?.resultProbability).toBeNull();
    const second = await service().search({
      sort: "RELEVANCE",
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.items.map((x) => x.businessId)).toEqual(["c"]);
  });
  it("rejects malformed cursors and invalid ranges", async () => {
    await expect(
      service().search({ sort: "RELEVANCE", limit: 20, cursor: "bad" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service().search({
        sort: "RELEVANCE",
        limit: 20,
        minPrice: 20,
        maxPrice: 10,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it("does not fake success for an unavailable provider", async () => {
    await expect(
      service([], false).search({ sort: "RELEVANCE", limit: 20 }),
    ).rejects.toMatchObject({
      response: { code: "SEARCH_PROVIDER_UNAVAILABLE" },
    });
  });
  it("does not claim availability when the DB fallback cannot prove it", async () => {
    const response = await service().search({
      sort: "RELEVANCE",
      limit: 20,
      availableFrom: "2026-10-01T09:00:00Z",
      availableTo: "2026-10-01T10:00:00Z",
      serviceId: "service-a",
    });
    expect(response.items).toEqual([]);
    expect(response.meta).toMatchObject({
      noMatch: true,
      availabilityEvaluated: true,
    });
  });
  it("requires exact service identity for real availability", async () => {
    await expect(
      service().search({
        sort: "RELEVANCE",
        limit: 20,
        availableFrom: "2026-10-01T09:00:00Z",
        availableTo: "2026-10-01T10:00:00Z",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
