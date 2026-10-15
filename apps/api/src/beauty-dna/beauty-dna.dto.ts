import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { BEAUTY_DNA_CATEGORIES } from "./beauty-dna.types.js";
export class DeclaredTraitDto {
  @IsIn(BEAUTY_DNA_CATEGORIES)
  category!: (typeof BEAUTY_DNA_CATEGORIES)[number];
  @IsString() @Matches(/^[a-z][a-z0-9_]{1,63}$/) traitType!: string;
  @IsString() @MaxLength(120) value!: string;
  @IsOptional() @IsString() @MaxLength(64) idempotencyKey?: string;
}
export class PredictionInferenceDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{1,64}$/) predictionId!: string;
  @IsIn(BEAUTY_DNA_CATEGORIES)
  category!: (typeof BEAUTY_DNA_CATEGORIES)[number];
  @IsString() @Matches(/^[a-z][a-z0-9_]{1,63}$/) traitType!: string;
}
export class BeautyDNAHistoryQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}
