import {
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import {
  METRIC_CATEGORIES,
  TIME_WINDOWS,
} from "./business-intelligence.types.js";
export class RecalculateDto {
  @IsIn(TIME_WINDOWS) window!: (typeof TIME_WINDOWS)[number];
}
export class CreateExperimentDto {
  @IsString() @MaxLength(500) hypothesis!: string;
  @IsIn(METRIC_CATEGORIES) targetMetric!: (typeof METRIC_CATEGORIES)[number];
  @IsIn(TIME_WINDOWS) baselineWindow!: (typeof TIME_WINDOWS)[number];
  @IsIn(TIME_WINDOWS) experimentWindow!: (typeof TIME_WINDOWS)[number];
  @IsIn(["INCREASE", "DECREASE"]) expectedDirection!: string;
  @IsObject() constraints!: Record<string, unknown>;
}
export class MetricParamDto {
  @IsIn(METRIC_CATEGORIES) metric!: (typeof METRIC_CATEGORIES)[number];
}
export class ExperimentResultDto {
  @IsOptional() @IsNumber() baselineValue!: number | null;
  @IsOptional() @IsNumber() experimentValue!: number | null;
  @IsInt() @Min(0) @Max(1_000_000) sampleSize!: number;
}
