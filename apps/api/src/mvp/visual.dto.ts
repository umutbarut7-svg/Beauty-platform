import {
  IsArray,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  ArrayMaxSize,
  Matches,
  IsObject,
  IsInt,
  Min,
  Max,
} from "class-validator";
export class PhotoConsentDto {
  @IsString() @MinLength(1) @MaxLength(100) policyVersion!: string;
  @IsIn([true]) accepted!: true;
}
export class VisualSessionDto {
  @IsString() @MinLength(1) @MaxLength(100) photoId!: string;
  @IsString() @MinLength(1) @MaxLength(1000) @Matches(/\S/) intent!: string;
  @IsString() @MinLength(1) @MaxLength(1000) @Matches(/\S/) target!: string;
}
export class VisualAnswersDto {
  @IsInt() @Min(0) @Max(3) expectedAttempt!: number;
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(500, { each: true })
  answers!: string[];
}
export class SemanticQueryDto {
  @IsString() @MinLength(1) @MaxLength(200) @Matches(/\S/) query!: string;
}
export class IndexCatalogDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9_-]+$/)
  idempotencyKey!: string;
}
export class VerificationSubmitDto {
  @IsString() @MinLength(1) @MaxLength(100) policyVersion!: string;
  @IsObject() answers!: Record<string, string>;
}
export class VerificationDecisionDto {
  @IsIn(["APPROVED", "REJECTED", "REVOKED"]) decision!:
    "APPROVED" | "REJECTED" | "REVOKED";
  @IsString() @MinLength(1) @MaxLength(1000) @Matches(/\S/) note!: string;
}
