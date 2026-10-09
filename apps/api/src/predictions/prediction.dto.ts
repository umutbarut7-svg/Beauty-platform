import {
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { PREDICTION_TYPES } from "./prediction.types.js";
const ID = /^[A-Za-z0-9_-]{1,64}$/;
export class PredictionListDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
  @IsOptional() @IsString() @Matches(ID) cursor?: string;
}
export class RefreshPredictionDto {
  @IsIn(PREDICTION_TYPES) type!: (typeof PREDICTION_TYPES)[number];
}
export class PredictionFeedbackDto {
  @IsIn([
    "ACCEPTED",
    "IGNORED",
    "REJECTED",
    "CONVERTED",
    "FALSE_POSITIVE",
    "FALSE_NEGATIVE",
  ])
  kind!: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}
export class PredictionOutcomeDto {
  @IsString() @MaxLength(80) outcome!: string;
  @IsOptional() @IsObject() actualValue?: Record<string, unknown>;
  @IsDateString() occurredAt!: string;
}
