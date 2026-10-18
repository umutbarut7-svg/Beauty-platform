import { Type } from "class-transformer";
import {
  Allow,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
export const CHANNELS = ["IN_APP", "EMAIL", "SMS", "PUSH", "WHATSAPP"] as const;
export const CATEGORIES = [
  "BOOKING",
  "BOOKING_REMINDER",
  "BOOKING_CHANGE",
  "DEMAND",
  "BEAUTY_JOB",
  "RESULT",
  "PAYMENT",
  "SECURITY",
  "SYSTEM",
  "MARKETING",
] as const;
export const TEMPLATE_STATUSES = ["DRAFT", "ACTIVE", "PAUSED"] as const;
export class CreateTemplateDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsIn(CHANNELS) channel!: string;
  @IsOptional() @IsString() @MaxLength(300) subject?: string;
  @IsString() @MinLength(1) @MaxLength(10000) body!: string;
  @IsArray() @IsString({ each: true }) variables: string[] = [];
  @IsOptional() @IsString() @MaxLength(20) locale = "tr-TR";
}
export class UpdateTemplateDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(300) subject?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(10000) body?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) variables?: string[];
  @IsOptional() @IsIn(TEMPLATE_STATUSES) status?: string;
}
export class CreateNotificationDto {
  @IsOptional() @IsString() templateId?: string;
  @IsIn(CHANNELS) channel!: string;
  @IsString() @MinLength(1) @MaxLength(500) recipient!: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() appointmentId?: string;
  @IsOptional() @IsString() automationExecutionId?: string;
  @IsOptional() @IsString() @MaxLength(300) subject?: string;
  @IsOptional() @IsString() @MaxLength(10000) body?: string;
  @IsOptional() @IsObject() variables?: Record<string, unknown>;
  @IsOptional() @IsIn(["TRANSACTIONAL", "MARKETING"]) kind = "TRANSACTIONAL";
  @IsOptional() @IsIn(CATEGORIES) category = "SYSTEM";
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsString() @MinLength(1) @MaxLength(200) idempotencyKey!: string;
  @IsOptional() @IsString() correlationId?: string;
  @IsOptional() @IsString() causationId?: string;
  @IsOptional() @Allow() metadata?: Record<string, unknown>;
}
export class NotificationListQueryDto {
  @IsOptional()
  @IsIn([
    "PENDING",
    "SCHEDULED",
    "PROCESSING",
    "SENT",
    "DELIVERED",
    "FAILED",
    "CANCELLED",
    "SKIPPED",
  ])
  status?: string;
  @IsOptional() @IsIn(CHANNELS) channel?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() appointmentId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}
export class PreferenceDto {
  @IsIn(CHANNELS) channel!: string;
  @IsIn(CATEGORIES) category!: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() userId?: string;
  @IsBoolean() transactionalEnabled!: boolean;
  @IsBoolean() marketingEnabled!: boolean;
}

export class ProviderConfigDto {
  @IsIn(CHANNELS) channel!: string;
  @IsString() @MinLength(1) @MaxLength(100) provider!: string;
  @IsBoolean() enabled!: boolean;
  @IsObject() config!: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(500) secretReference?: string;
}
export class TemplateListQueryDto {
  @IsOptional() @IsIn(CHANNELS) channel?: string;
  @IsOptional() @IsIn([...TEMPLATE_STATUSES, "ARCHIVED"]) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}
export class RegisterPushDeviceDto {
  @IsString() @MinLength(20) @MaxLength(4096) token!: string;
  @IsIn(["IOS", "ANDROID", "WEB"]) platform!: string;
}
