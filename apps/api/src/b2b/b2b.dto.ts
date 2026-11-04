import {
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
} from "class-validator";
import { QUANTITY } from "../inventory/inventory.dto.js";
export class SupplierProfileDto {
  @IsIn(["BRAND", "MANUFACTURER", "DISTRIBUTOR", "WHOLESALER"]) kind!:
    "BRAND" | "MANUFACTURER" | "DISTRIBUTOR" | "WHOLESALER";
  @IsString() @MaxLength(2000) description!: string;
  @IsBoolean() isListed!: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(2147483646) expectedRevision?: number;
}
export class B2BPageDto {
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{1,64}$/) after?: string;
  @IsOptional() @IsString() @MaxLength(120) query?: string;
}
export class QuoteRequestDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{1,64}$/) supplierBusinessId!: string;
  @IsString() @Matches(/^[A-Za-z0-9_-]{1,64}$/) productId!: string;
  @IsString() @Matches(QUANTITY) quantity!: string;
  @IsString() @MaxLength(1000) note!: string;
  @IsString() @Matches(/^[A-Za-z0-9._:-]{8,128}$/) idempotencyKey!: string;
}
export class QuoteReplyDto {
  @IsInt() @Min(0) @Max(2147483646) expectedRevision!: number;
  @IsIn(["QUOTE", "DECLINE"]) action!: "QUOTE" | "DECLINE";
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,10}(?:\.\d{1,2})?$/)
  unitPrice?: string;
  @IsOptional() @IsISO4217CurrencyCode() currency?: string;
  @IsString() @MaxLength(1000) note!: string;
}
export class QuoteCancelDto {
  @IsInt() @Min(0) @Max(2147483646) expectedRevision!: number;
}
export class QuotePageDto extends B2BPageDto {
  @IsIn(["BUYER", "SUPPLIER"]) side!: "BUYER" | "SUPPLIER";
}
