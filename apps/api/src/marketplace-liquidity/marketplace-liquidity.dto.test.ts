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
