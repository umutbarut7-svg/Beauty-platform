import {
  IsBoolean,
  IsInt,
  IsISO4217CurrencyCode,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

const RESOURCE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MONEY = /^\d{1,10}(?:\.\d{1,2})?$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateServiceCategoryDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @Matches(SLUG) @MaxLength(80) slug?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100000) sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateServiceCategoryDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @Matches(SLUG) @MaxLength(80) slug?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100000) sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateCatalogServiceDto {
  @IsString() @Matches(RESOURCE_ID) categoryId!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @Matches(SLUG) @MaxLength(80) slug?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsInt() @Min(1) @Max(1440) durationMinutes!: number;
  @IsOptional() @IsInt() @Min(0) @Max(1440) bufferBeforeMinutes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1440) bufferAfterMinutes?: number;
  @IsString() @Matches(MONEY) price!: string;
  @IsOptional() @IsISO4217CurrencyCode() currency?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isBookable?: boolean;
}
export class UpdateCatalogServiceDto {
  @IsOptional() @IsString() @Matches(RESOURCE_ID) categoryId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @Matches(SLUG) @MaxLength(80) slug?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1440) durationMinutes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1440) bufferBeforeMinutes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1440) bufferAfterMinutes?: number;
  @IsOptional() @IsString() @Matches(MONEY) price?: string;
  @IsOptional() @IsISO4217CurrencyCode() currency?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isBookable?: boolean;
}

export class AssignStaffServiceDto {
  @IsString() @Matches(RESOURCE_ID) serviceId!: string;
  @IsOptional() @IsString() @Matches(MONEY) customPrice?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1440) customDurationMinutes?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateStaffServiceDto {
  @IsOptional() @IsString() @Matches(MONEY) customPrice?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1440) customDurationMinutes?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
