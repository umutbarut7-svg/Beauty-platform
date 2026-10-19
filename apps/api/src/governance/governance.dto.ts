import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
export class CreatePolicyDto {
  @IsString() @MinLength(2) key!: string;
  @IsString() scope!: string;
  @IsIn(["GLOBAL", "MARKET", "TENANT"]) level!: string;
  @IsIn(["OPEN", "CLOSED", "REVIEW"]) failMode!: string;
  @IsString() reason!: string;
  @IsArray() rules!: unknown[];
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveUntil?: string;
}
export class PolicyTransitionDto {
  @IsIn(["REVIEW", "APPROVED", "ACTIVE", "SUPERSEDED", "RETIRED"])
  status!: string;
  @IsString() reason!: string;
  @IsString() idempotencyKey!: string;
}
export class EvaluatePolicyDto {
  @IsString() scope!: string;
  @IsObject() context!: Record<string, unknown>;
  @IsOptional() @IsBoolean() highRisk?: boolean;
  @IsString() idempotencyKey!: string;
  @IsOptional() @IsObject() ai?: Record<string, unknown>;
}
export class OverrideDto {
  @IsIn(["ALLOW", "REVIEW", "BLOCK"]) decision!: string;
  @IsString() @MinLength(4) reason!: string;
  @IsString() idempotencyKey!: string;
}
export class CreateDisputeDto {
  @IsString() category!: string;
  @IsString() reason!: string;
  @IsArray() parties!: unknown[];
  @IsString() idempotencyKey!: string;
  @IsOptional() @IsObject() evidenceMetadata?: Record<string, unknown>;
}
export class DisputeTransitionDto {
  @IsIn([
    "EVIDENCE_COLLECTION",
    "AI_TRIAGE",
    "HUMAN_REVIEW",
    "DECISION",
    "APPEAL",
    "RESOLUTION",
    "CLOSED",
    "CANCELLED",
    "REJECTED",
  ])
  state!: string;
  @IsString() reason!: string;
  @IsString() idempotencyKey!: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}
export class ConsentDto {
  @IsString() subjectId!: string;
  @IsString() purpose!: string;
  @IsString() noticeVersion!: string;
  @IsIn(["GRANTED", "WITHDRAWN"]) status!: string;
  @IsString() idempotencyKey!: string;
}
export class PrivacyRequestDto {
  @IsString() subjectId!: string;
  @IsIn(["EXPORT", "DELETION", "ANONYMIZATION", "RECTIFICATION"]) type!: string;
  @IsString() idempotencyKey!: string;
}
export class PrivacyTransitionDto {
  @IsIn([
    "IDENTITY_VERIFICATION",
    "IN_REVIEW",
    "APPROVED",
    "PROCESSING",
    "COMPLETED",
    "REJECTED",
    "CANCELLED",
  ])
  state!: string;
  @IsString() reason!: string;
  @IsString() idempotencyKey!: string;
}
export class EnforcementDto {
  @IsString() subjectType!: string;
  @IsString() subjectId!: string;
  @IsString() type!: string;
  @IsArray() reasonCodes!: string[];
  @IsOptional() @IsString() policyEvaluationId?: string;
  @IsOptional() @IsString() financialReference?: string;
  @IsString() idempotencyKey!: string;
}
export class EnforcementTransitionDto {
  @IsIn(["REVIEW", "ACTIVE", "LIFTED", "EXPIRED", "CANCELLED"])
  state!: string;
  @IsString() reason!: string;
  @IsString() idempotencyKey!: string;
}
