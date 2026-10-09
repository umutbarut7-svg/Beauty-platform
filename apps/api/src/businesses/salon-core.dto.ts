import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsISO4217CurrencyCode,
  IsLatitude,
  IsLongitude,
  IsNumberString,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import type { BusinessRole } from "@beauty-platform/types";

const BUSINESS_ROLES = [
  "BUSINESS_OWNER",
  "BUSINESS_ADMIN",
  "MANAGER",
  "STAFF",
] as const;
const DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

export class AddMemberDto {
  @IsEmail() email!: string;
  @IsIn(BUSINESS_ROLES) role!: BusinessRole;
}
export class UpdateMemberDto {
  @IsIn(BUSINESS_ROLES) role!: BusinessRole;
}

export class CreateBranchDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional()
  @IsString()
  @Length(3, 80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @Length(2, 2) country?: string;
  @IsString() @MinLength(2) @MaxLength(100) city!: string;
  @IsOptional() @IsString() @MaxLength(100) district?: string;
  @IsString() @MinLength(3) @MaxLength(300) address!: string;
  @IsOptional() @IsNumberString() @IsLatitude() latitude?: string;
  @IsOptional() @IsNumberString() @IsLongitude() longitude?: string;
  @IsOptional() @IsString() @MaxLength(100) timezone?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class UpdateBranchDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional()
  @IsString()
  @Length(3, 80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @Length(2, 2) country?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(100) district?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(300) address?: string;
  @IsOptional() @IsNumberString() @IsLatitude() latitude?: string;
  @IsOptional() @IsNumberString() @IsLongitude() longitude?: string;
  @IsOptional() @IsString() @MaxLength(100) timezone?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateSettingsDto {
  @IsOptional() @IsISO4217CurrencyCode() defaultCurrency?: string;
  @IsOptional() @IsString() @MaxLength(100) timezone?: string;
  @IsOptional() @IsBoolean() bookingEnabled?: boolean;
  @IsOptional() @IsBoolean() onlinePaymentEnabled?: boolean;
  @IsOptional() @IsBoolean() cancellationEnabled?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(10080) cancellationWindowMinutes?: number;
  @IsOptional() @IsInt() @Min(5) @Max(1440) appointmentIntervalMinutes?: number;
  @IsOptional() @IsBoolean() customerCanChooseStaff?: boolean;
}

export class WorkingHourDto {
  @IsIn(DAYS) dayOfWeek!: (typeof DAYS)[number];
  @IsBoolean() isOpen!: boolean;
  @ValidateIf((value: WorkingHourDto) => value.isOpen)
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  openTime?: string;
  @ValidateIf((value: WorkingHourDto) => value.isOpen)
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  closeTime?: string;
}
export class UpdateWorkingHoursDto {
  @IsOptional() @IsString() branchId?: string;
  @IsArray()
  @ArrayMaxSize(7)
  @ArrayUnique((item: WorkingHourDto) => item.dayOfWeek)
  @ValidateNested({ each: true })
  @Type(() => WorkingHourDto)
  hours!: WorkingHourDto[];
}
