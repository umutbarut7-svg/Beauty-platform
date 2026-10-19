import { Type } from "class-transformer";
import {
  Allow,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
export const RULE_FIELDS = [
  "totalAppointments",
  "completedAppointments",
  "cancelledAppointments",
  "noShowAppointments",
  "totalSpend",
  "averageSpend",
  "lastVisitAt",
  "nextAppointmentAt",
  "daysSinceLastVisit",
  "preferredStaffId",
  "gender",
  "marketingConsent",
  "smsConsent",
  "emailConsent",
  "tags",
] as const;
export const RULE_OPERATORS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "notIn",
  "contains",
] as const;
export class SegmentRuleDto {
  @IsIn(RULE_FIELDS) field!: (typeof RULE_FIELDS)[number];
  @IsIn(RULE_OPERATORS) operator!: (typeof RULE_OPERATORS)[number];
  @Allow() value!: unknown;
}
export class CreateSegmentDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsIn(["MANUAL", "DYNAMIC"]) type!: "MANUAL" | "DYNAMIC";
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SegmentRuleDto)
  rules?: SegmentRuleDto[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateSegmentDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SegmentRuleDto)
  rules?: SegmentRuleDto[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class SegmentCustomersQueryDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) search?: string;
  @IsOptional() @IsString() tagId?: string;
  @IsOptional() @IsString() preferredStaffId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}
