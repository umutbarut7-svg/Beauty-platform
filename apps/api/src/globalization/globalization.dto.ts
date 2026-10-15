import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import { MEASUREMENT_SYSTEMS } from "./globalization.types.js";
export class ConfigureTenantGlobalizationDto {
  @IsString() @Matches(/^[a-z0-9-]{2,32}$/) marketKey!: string;
  @IsString() @MaxLength(35) locale!: string;
  @IsString() @Matches(/^[A-Za-z]{3}$/) currency!: string;
  @IsString() @MaxLength(64) timezone!: string;
  @IsIn(MEASUREMENT_SYSTEMS) measurementSystem!: "METRIC" | "IMPERIAL";
}
export class GlobalizationContextQueryDto {
  @IsOptional() @IsString() @MaxLength(35) locale?: string;
  @IsOptional() @IsString() @Matches(/^[A-Za-z]{3}$/) currency?: string;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
}
