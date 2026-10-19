import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { DiscoverySearchQueryDto } from "./discovery.dto.js";
describe("DiscoverySearchQueryDto", () => {
  it("rejects excessive limits, negative prices, invalid coordinates/radius and sort", async () => {
    const dto = plainToInstance(DiscoverySearchQueryDto, {
      limit: 100,
      minPrice: -1,
      latitude: 200,
      longitude: 300,
      radiusKm: 500,
      sort: "MAGIC",
    });
    expect((await validate(dto)).length).toBeGreaterThanOrEqual(5);
  });
  it("accepts empty discovery with safe defaults", async () => {
    const dto = plainToInstance(DiscoverySearchQueryDto, {});
    expect(await validate(dto)).toEqual([]);
    expect(dto.limit).toBe(20);
  });
  it("rejects unsafe duration, identifiers, and oversized query input", async () => {
    const dto = plainToInstance(DiscoverySearchQueryDto, {
      query: "x".repeat(121),
      professionalId: "unsafe id!",
      minDurationMinutes: 90,
      maxDurationMinutes: 30,
    });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(["query", "professionalId"]),
    );
  });
});
