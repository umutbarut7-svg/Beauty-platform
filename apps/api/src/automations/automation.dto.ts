import { Type } from "class-transformer";
import {
  Allow,
  ArrayMaxSize,
  IsArray,
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
export const EVENT_TRIGGERS = [
  "CUSTOMER_CREATED",
  "CUSTOMER_UPDATED",
  "APPOINTMENT_CREATED",
  "APPOINTMENT_CONFIRMED",
  "APPOINTMENT_COMPLETED",
  "APPOINTMENT_CANCELLED",
  "APPOINTMENT_NO_SHOW",
  "CUSTOMER_SEGMENT_ENTERED",
  "CUSTOMER_SEGMENT_EXITED",
] as const;
export const TIME_TRIGGERS = [
  "DAYS_SINCE_LAST_COMPLETED_APPOINTMENT",
  "DAYS_UNTIL_UPCOMING_APPOINTMENT",
  "CUSTOMER_INACTIVE_DAYS",
] as const;
export const TRIGGERS = [...EVENT_TRIGGERS, ...TIME_TRIGGERS] as const;
export const ACTIONS = [
  "ADD_CUSTOMER_TAG",
  "REMOVE_CUSTOMER_TAG",
  "ADD_TO_SEGMENT",
  "REMOVE_FROM_SEGMENT",
  "CREATE_INTERNAL_NOTE",
  "SEND_NOTIFICATION",
  "SEND_SMS",
  "SEND_EMAIL",
  "SEND_PUSH_NOTIFICATION",
] as const;
export const CONDITION_FIELDS = [
  "totalVisits",
  "completedVisits",
  "cancelledVisits",
  "noShowCount",
  "totalSpend",
  "averageSpend",
  "lastVisitAt",
  "nextAppointmentAt",
  "createdAt",
  "tags",
  "preferredStaffId",
  "segmentIds",
  "insight",
  "appointment.status",
  "appointment.staffId",
  "appointment.serviceId",
  "appointment.startAt",
] as const;
export const CONDITION_OPERATORS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "notIn",
  "contains",
  "before",
  "after",
] as const;
export class AutomationConditionDto {
  @IsIn(CONDITION_FIELDS) field!: string;
  @IsIn(CONDITION_OPERATORS) operator!: string;
  @Allow() value!: unknown;
}
export class AutomationActionDto {
  @IsIn(ACTIONS) type!: string;
  @Allow() config!: Record<string, unknown>;
}
export class CreateAutomationDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsIn(TRIGGERS) triggerType!: string;
  @Allow() triggerConfig: Record<string, unknown> = {};
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AutomationConditionDto)
  conditions: AutomationConditionDto[] = [];
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AutomationActionDto)
  actions!: AutomationActionDto[];
}
export class UpdateAutomationDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsIn(TRIGGERS) triggerType?: string;
  @IsOptional() @Allow() triggerConfig?: Record<string, unknown>;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AutomationConditionDto)
  conditions?: AutomationConditionDto[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AutomationActionDto)
  actions?: AutomationActionDto[];
}
export class AutomationListQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(["DRAFT", "ACTIVE", "PAUSED"]) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}
export class ProcessEventDto {
  @IsString() eventId!: string;
  @IsIn(EVENT_TRIGGERS) eventType!: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() appointmentId?: string;
  @IsOptional() @Allow() metadata?: Record<string, unknown>;
  @IsOptional() @IsString() correlationId?: string;
  @IsOptional() @IsString() causationId?: string;
  @IsOptional() @IsInt() @Min(0) @Max(8) depth = 0;
}
