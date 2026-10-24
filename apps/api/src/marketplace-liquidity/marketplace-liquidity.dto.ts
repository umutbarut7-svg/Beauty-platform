import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { LIQUIDITY_WINDOWS } from "./marketplace-liquidity.types.js";
export class LiquidityQueryDto {
  @IsIn(LIQUIDITY_WINDOWS) window!: (typeof LIQUIDITY_WINDOWS)[number];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
export class RecalculateLiquidityDto {
  @IsIn(LIQUIDITY_WINDOWS) window!: (typeof LIQUIDITY_WINDOWS)[number];
}
