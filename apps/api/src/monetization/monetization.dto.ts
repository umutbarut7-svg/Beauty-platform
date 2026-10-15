import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import { SUBSCRIPTION_STATUSES } from "./monetization.types.js";
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const MINOR = /^[1-9]\d{0,18}$/;
export class SubscriptionTransitionDto {
  @IsIn(SUBSCRIPTION_STATUSES) status!: (typeof SUBSCRIPTION_STATUSES)[number];
  @IsString() @MaxLength(500) reason!: string;
}
export class UsageIngestionDto {
  @IsString() @Matches(ID) marketId!: string;
  @IsString() @Matches(/^[a-z][a-z0-9_.-]{1,63}$/) metric!: string;
  @IsString() @Matches(MINOR) quantity!: string;
  @IsString() @MaxLength(80) source!: string;
  @IsString() @Matches(ID) idempotencyKey!: string;
  @IsDateString() occurredAt!: string;
}
export class RefundDto {
  @IsString() @Matches(ID) originalEntryId!: string;
  @IsString() @Matches(MINOR) amountMinor!: string;
  @IsString() @Matches(ID) idempotencyKey!: string;
  @IsString() @MaxLength(500) reason!: string;
}
export class ForecastDto {
  @IsString() @Matches(/^\d{1,3}$/) horizonDays!: string;
  @IsOptional() periods?: Array<{
    amountMinor: string;
    currency: string;
    evidenceId: string;
  }>;
}
