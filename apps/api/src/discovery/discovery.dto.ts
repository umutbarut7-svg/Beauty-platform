import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import { DISCOVERY_INTENT_SOURCES, SEARCH_SORTS } from "@beauty-platform/types";
export class DiscoverySearchQueryDto {
  @IsOptional() @IsString() @Matches(/^[a-z0-9-]{2,32}$/) market?: string;
  @IsOptional() @IsString() @MaxLength(35) locale?: string;
  @IsOptional() @IsString() @Matches(/^[A-Za-z]{3}$/) currency?: string;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
  @IsOptional() @IsString() @Matches(/^[A-Za-z]{2}$/) countryCode?: string;
  @IsOptional() @IsString() @MaxLength(120) query?: string;
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  categoryId?: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  subcategoryId?: string;
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  serviceTypeId?: string;
  @IsOptional()
  @IsString()
  @IsIn([
    "BOOKING",
    "AVAILABILITY",
    "PROFESSIONAL_MATCHING",
    "RESULT",
    "PORTFOLIO",
    "BEFORE_AFTER",
    "CONSULTATION",
    "PHOTO_INPUT",
    "AI_ANALYSIS",
    "PRODUCT_RECOMMENDATION",
    "MULTI_SESSION",
    "RESOURCE_REQUIRED",
    "ROOM_REQUIRED",
    "EQUIPMENT_REQUIRED",
    "GROUP_BOOKING",
    "DURATION_VARIANTS",
    "ADD_ON_SERVICES",
    "CUSTOM_ATTRIBUTES",
  ])
  capability?: string;
  @IsOptional() @IsString() @MaxLength(64) professionalSkill?: string;
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  serviceId?: string;
  @IsOptional() @IsString() @MaxLength(120) service?: string;
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  professionalId?: string;
  @IsOptional() @IsString() @MaxLength(120) professional?: string;
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  businessId?: string;
  @IsOptional() @IsString() @MaxLength(120) business?: string;
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  locationId?: string;
  @IsOptional() @IsString() @MaxLength(120) location?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(100) district?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @IsLatitude() latitude?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  longitude?: number;
  @ValidateIf((o) => o.latitude !== undefined || o.longitude !== undefined)
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(200)
  radiusKm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxPrice?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  minDurationMinutes?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  maxDurationMinutes?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  minRating?: number;
  @IsOptional()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  verifiedOnly?: boolean;
  @IsOptional() @IsDateString() availableFrom?: string;
  @IsOptional() @IsDateString() availableTo?: string;
  @IsOptional() @IsIn(SEARCH_SORTS) sort:
    "RELEVANCE" | "RATING" | "PRICE_ASC" | "PRICE_DESC" | "DISTANCE" =
    "RELEVANCE";
  @IsOptional() @IsString() @MaxLength(500) cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
  @IsOptional()
  @IsIn(["ALL", "BUSINESS", "SERVICE", "PROFESSIONAL"])
  entityType?: "ALL" | "BUSINESS" | "SERVICE" | "PROFESSIONAL" = "ALL";
}

export class DiscoveryIntentDto extends DiscoverySearchQueryDto {
  @IsIn(DISCOVERY_INTENT_SOURCES) source!: "TEXT" | "VOICE" | "PHOTO";
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{1,64}$/) userId?: string;
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  customerId?: string;
  @IsOptional() @IsObject() attributes?: Record<
    string,
    string | number | boolean
  >;
}
