import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO4217CurrencyCode,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

const MONEY = /^\d{1,10}(?:\.\d{1,2})?$/;
export class ProductPageDto {
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{1,64}$/) after?: string;
}
export const QUANTITY = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/;
export class ProductInput {
  @IsString() @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/) sku!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(120) brand?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsString() @Matches(MONEY) price!: string;
  @IsISO4217CurrencyCode() currency!: string;
  @IsIn(["UNIT", "ML", "G"]) unit!: "UNIT" | "ML" | "G";
  @IsString() @Matches(QUANTITY) lowStockThreshold!: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
}
export class ImportProductsDto {
  @IsString() @Matches(/^[A-Za-z0-9._:-]{8,128}$/) idempotencyKey!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ProductInput)
  products!: ProductInput[];
}
export class UpdateProductDto {
  @IsOptional() @IsBoolean() b2bAvailable?: boolean;
  @IsInt() @Min(0) @Max(2147483646) expectedRevision!: number;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(120) brand?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @Matches(MONEY) price?: string;
  @IsOptional() @IsISO4217CurrencyCode() currency?: string;
  @IsOptional() @IsString() @Matches(QUANTITY) lowStockThreshold?: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class StockMovementDto {
  @IsString() @Matches(/^[A-Za-z0-9._:-]{8,128}$/) idempotencyKey!: string;
  @IsIn(["IN", "OUT"]) direction!: "IN" | "OUT";
  @IsString() @Matches(QUANTITY) quantity!: string;
  @IsString() @MinLength(1) @MaxLength(200) reason!: string;
}
