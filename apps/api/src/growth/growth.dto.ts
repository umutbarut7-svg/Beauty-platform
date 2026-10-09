import {
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from "class-validator";
export class CreateReferralProgramDto {
  @IsString() @MinLength(2) key!: string;
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsObject() qualificationRules!: Record<string, unknown>;
  @IsObject() rewardRules!: Record<string, unknown>;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
}
export class GenerateReferralCodeDto {
  @IsString() programId!: string;
  @IsString() ownerType!: string;
  @IsString() ownerId!: string;
  @IsOptional() @IsInt() @Min(1) @Max(100000) usageLimit?: number;
  @IsOptional() @IsDateString() expiresAt?: string;
}
export class CreateReferralDto {
  @IsString() code!: string;
  @IsString() referredType!: string;
  @IsString() referredId!: string;
  @IsString() idempotencyKey!: string;
  @IsOptional() @IsString() anonymousId?: string;
}
export class TransitionReferralDto {
  @IsIn([
    "CLICKED",
    "SIGNED_UP",
    "QUALIFIED",
    "CONVERTED",
    "REWARDED",
    "EXPIRED",
    "REJECTED",
    "CANCELLED",
    "REVERSED",
    "FRAUD_REVIEW",
  ])
  state!: string;
  @IsString() reason!: string;
  @IsString() idempotencyKey!: string;
}
export class GrantRewardDto {
  @IsString() beneficiaryType!: string;
  @IsString() beneficiaryId!: string;
  @IsString() ruleKey!: string;
  @IsString() amountMinor!: string;
  @IsString() currency!: string;
  @IsString() idempotencyKey!: string;
  @IsOptional() @IsDateString() expiresAt?: string;
}
export class ReverseRewardDto {
  @IsString() reason!: string;
  @IsString() idempotencyKey!: string;
}
export class ExperimentAssignmentDto {
  @IsString() subjectId!: string;
}
export class AttributionDto {
  @IsString() touchId!: string;
  @IsOptional() @IsString() anonymousId?: string;
  @IsOptional() @IsString() subjectId?: string;
  @IsIn([
    "REFERRAL",
    "ORGANIC",
    "SEARCH",
    "SOCIAL",
    "PAID",
    "INFLUENCER",
    "PARTNER",
    "CAMPAIGN",
    "DIRECT",
    "UNKNOWN",
  ])
  source!: string;
  @IsIn(["FIRST_TOUCH", "LAST_TOUCH"]) model!: string;
  @IsOptional() @IsObject() utm?: Record<string, string>;
}
export class ChallengeProgressDto {
  @IsString() subjectId!: string;
  @IsString() eventId!: string;
  @IsInt() @Min(1) increment!: number;
}
