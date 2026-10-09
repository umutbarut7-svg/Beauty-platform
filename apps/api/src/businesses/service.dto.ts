import {
  IsBoolean,
  IsInt,
  IsISO4217CurrencyCode,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateServiceDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsInt() @IsPositive() @Max(1440) durationMinutes!: number;
  @IsString() @Matches(/^\d{1,10}(?:\.\d{1,2})?$/) price!: string;
  @IsOptional() @IsISO4217CurrencyCode() currency?: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateServiceDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsInt() @IsPositive() @Max(1440) durationMinutes?: number;
  @IsOptional() @IsString() @Matches(/^\d{1,10}(?:\.\d{1,2})?$/) price?: string;
  @IsOptional() @IsISO4217CurrencyCode() currency?: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
