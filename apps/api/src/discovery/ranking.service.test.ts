import { describe, expect, it } from "vitest";
import { RankingService } from "./ranking.service.js";
import type { SearchCandidate } from "./search-provider.js";
const candidate = (
  id: string,
  overrides: Partial<SearchCandidate> = {},
): SearchCandidate => ({
  id,
  name: "Salon",
  slug: id,
  description: null,
  logoUrl: null,
  city: "İstanbul",
  district: "Şişli",
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
describe("RankingService", () => {
  const ranking = new RankingService();
  it("uses deterministic signals and stable business-id tie-break", () => {
    const rows = [candidate("b"), candidate("a")];
    expect(
      ranking.rank(rows, { sort: "RELEVANCE" }).map((x) => x.candidate.id),
    ).toEqual(["a", "b"]);
    expect(ranking.rank(rows, { sort: "RELEVANCE" })).toEqual(
      ranking.rank(rows, { sort: "RELEVANCE" }),
    );
  });
  it("ranks real text, category, rating, verified and availability signals", () => {
    const top = candidate("top", {
      name: "İpek Güzellik",
      isVerified: true,
      categories: [{ id: "cat", name: "Saç", slug: "sac" }],
      services: [
        {
          id: "s",
          name: "Kesim",
          price: "500",
          currency: "TRY",
          durationMinutes: 30,
        },
      ],
      ratings: [5, 4],
      nextAvailabilityAt: "2026-10-01T10:00:00.000Z",
    });
    const result = ranking.rank([candidate("plain"), top], {
      query: "İPEK",
      categoryId: "cat",
    })[0]!;
    expect(result.candidate.id).toBe("top");
    expect(result.signals).toEqual(
      expect.arrayContaining([
        "text",
        "category",
        "rating",
        "verified",
        "availability",
      ]),
    );
  });
  it("does not invent unknown rating, availability or distance", () => {
    const result = ranking.rank([candidate("a")], {})[0]!;
    expect(result).toMatchObject({ rating: null, distanceKm: null });
    expect(result.candidate.nextAvailabilityAt).toBeNull();
  });
  it("uses only real completed appointments for matching professional expertise", () => {
    const result = ranking.rank(
      [
        candidate("expert", {
          staff: [
            {
              id: "staff-a",
              displayName: "Ada",
              title: "Stylist",
              serviceIds: ["service-a"],
              completedAppointments: 15,
            },
          ],
        }),
      ],
      { serviceId: "service-a" },
    )[0]!;
    expect(result.expertiseByStaff["staff-a"]).toBeGreaterThan(0);
    expect(result.signals).toContain("expertise");
  });
  it("filters by real rating/radius and sorts by price deterministically", () => {
    const near = candidate("near", {
      latitude: 41.01,
      longitude: 29.01,
      ratings: [5],
      services: [
        {
          id: "s1",
          name: "Cut",
          price: "100",
          currency: "TRY",
          durationMinutes: 30,
        },
      ],
    });
    const far = candidate("far", {
      latitude: 42,
      longitude: 30,
      ratings: [2],
      services: [
        {
          id: "s2",
          name: "Cut",
          price: "50",
          currency: "TRY",
          durationMinutes: 30,
        },
      ],
    });
    const filtered = ranking.rank([far, near], {
      latitude: 41,
      longitude: 29,
      radiusKm: 10,
      minRating: 4,
    });
    expect(filtered.map((x) => x.candidate.id)).toEqual(["near"]);
    expect(
      ranking
        .rank([near, far], { sort: "PRICE_ASC" })
        .map((x) => x.candidate.id),
    ).toEqual(["far", "near"]);
  });
});
