import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsObject,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { CreateBusinessCustomerDto } from "../customers/customer.dto.js";
import {
  APPOINTMENT_STATUSES,
  type AppointmentStatus,
} from "./status-transitions.js";

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

export class AvailabilityQueryDto {
  @IsString() @Matches(ID) locationId!: string;
  @IsString() @Matches(ID) serviceId!: string;
  @IsOptional() @IsString() @Matches(ID) staffMemberId?: string;
  @IsString() @Matches(DATE) @IsDateString({ strict: true }) date!: string;
}
export class CreateAppointmentDto {
  @IsString() @Matches(ID) locationId!: string;
  @IsString() @Matches(ID) serviceId!: string;
  @IsString() @Matches(ID) staffMemberId!: string;
  @IsDateString({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  startsAt!: string;
  @IsOptional() @IsBoolean() bookForSelf?: boolean;
  @IsOptional() @IsString() @Matches(ID) customerId?: string;
  @IsOptional() @IsString() @MaxLength(1000) customerNote?: string;
  @IsOptional() @IsString() @MaxLength(1000) internalNote?: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateBusinessCustomerDto)
  customerProfile?: CreateBusinessCustomerDto;
  @IsOptional() @IsObject() categoryAttributes?: Record<
    string,
    string | number | boolean | string[]
  >;
  @IsOptional() @IsString() @MaxLength(64) bookingTimezone?: string;
  @IsOptional() @IsString() @MaxLength(64) customerTimezone?: string;
}
export class UpdateAppointmentDto {
  @IsOptional() @IsIn(APPOINTMENT_STATUSES) status?: AppointmentStatus;
  @IsOptional() @IsString() @Matches(ID) locationId?: string;
  @IsOptional() @IsString() @Matches(ID) serviceId?: string;
  @IsOptional() @IsString() @Matches(ID) staffMemberId?: string;
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  startsAt?: string;
  @IsOptional() @IsString() @MaxLength(1000) customerNote?: string;
  @IsOptional() @IsString() @MaxLength(1000) internalNote?: string;
}
export class CancelAppointmentDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
export class UpdateAppointmentStatusDto {
  @IsIn(APPOINTMENT_STATUSES) status!: AppointmentStatus;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class StaffWorkingHourDto {
  @IsIn(DAYS) dayOfWeek!: (typeof DAYS)[number];
  @IsString() @Matches(TIME) startTime!: string;
  @IsString() @Matches(TIME) endTime!: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
export class ReplaceStaffWorkingHoursDto {
  @IsArray()
  @ArrayMaxSize(35)
  @ArrayUnique(
    (item: StaffWorkingHourDto) =>
      `${item.dayOfWeek}:${item.startTime}:${item.endTime}`,
  )
  @ValidateNested({ each: true })
  @Type(() => StaffWorkingHourDto)
  hours!: StaffWorkingHourDto[];
}
export class CreateStaffTimeOffDto {
  @IsDateString({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  startsAt!: string;
  @IsDateString({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  endsAt!: string;
  @IsOptional()
  @IsIn(["BREAK", "TIME_OFF", "BLOCKED", "OTHER"])
  type?: "BREAK" | "TIME_OFF" | "BLOCKED" | "OTHER";
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
export class UpdateStaffTimeOffDto {
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  startsAt?: string;
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  endsAt?: string;
  @IsOptional()
  @IsIn(["BREAK", "TIME_OFF", "BLOCKED", "OTHER"])
  type?: "BREAK" | "TIME_OFF" | "BLOCKED" | "OTHER";
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
