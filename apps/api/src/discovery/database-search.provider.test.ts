/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { DatabaseSearchProvider } from "./database-search.provider.js";
describe("DatabaseSearchProvider", () => {
  it("always enforces public active visibility and typed filters", async () => {
    let query: any;
    const provider = new DatabaseSearchProvider({
      business: {
        findMany: async (q: any) => {
          query = q;
          return [];
        },
      },
    } as any);
    await provider.searchCandidates({
      query: "saç",
      city: "İstanbul",
      district: "Şişli",
      categoryId: "cat",
      serviceId: "svc",
      minPrice: 10,
      maxPrice: 1000,
      verifiedOnly: true,
    });
    expect(query.where).toMatchObject({
      isPublic: true,
      status: "ACTIVE",
      isVerified: true,
    });
    expect(query.where.OR).toBeDefined();
    expect(query.where.AND).toHaveLength(2);
    expect(query.where.serviceCategories.some).toMatchObject({ id: "cat" });
    expect(query.where.services.some).toMatchObject({
      id: "svc",
      price: { gte: 10, lte: 1000 },
    });
    expect(query.take).toBe(100);
    expect(query.select.staff.where).toMatchObject({
      isActive: true,
      acceptsBookings: true,
    });
  });
  it("projects only active public-safe related data", async () => {
    const provider = new DatabaseSearchProvider({
      business: {
        findMany: async () => [
          {
            id: "b",
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
            serviceCategories: [],
            services: [],
            staff: [],
            reviews: [],
            privateNotes: "never expose",
          },
        ],
      },
    } as any);
    const result = await provider.searchCandidates({});
    expect(result[0]).not.toHaveProperty("privateNotes");
  });
});
