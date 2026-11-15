import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import {
  LiquidityQueryDto,
  RecalculateLiquidityDto,
} from "./marketplace-liquidity.dto.js";

describe("marketplace liquidity DTOs", () => {
  it("rejects free-text windows and invalid pagination", async () => {
    expect(
      await validate(
        plainToInstance(LiquidityQueryDto, { window: "FOREVER", limit: 1000 }),
      ),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(RecalculateLiquidityDto, { window: "MONTHLY" }),
      ),
    ).not.toHaveLength(0);
  });
});

describe("liquidity query validation", () => {
  it("accepts a URL limit and preserves the server default", async () => {
    const query = plainToInstance(LiquidityQueryDto, {
      window: "ROLLING_30_DAYS",
      limit: "20",
    });
    expect(await validate(query)).toEqual([]);
    expect(query.limit).toBe(20);
    expect(plainToInstance(LiquidityQueryDto, {}).limit).toBe(20);
  });
  it.each(["0", "101", "1.5", "NaN", "Infinity", "", "-1"])(
    "rejects invalid limit %s",
    async (limit) => {
      const query = plainToInstance(LiquidityQueryDto, {
        window: "ROLLING_30_DAYS",
        limit,
      });
      expect((await validate(query)).length).toBeGreaterThan(0);
    },
  );
  it("rejects an unknown observation window", async () => {
    expect(
      (
        await validate(
          plainToInstance(LiquidityQueryDto, {
            window: "FOREVER",
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
