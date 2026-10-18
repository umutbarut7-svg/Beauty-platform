import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import { PROFESSIONAL_SKILL_CATEGORIES } from "./professional-intelligence.types.js";
export class SkillDto {
  @IsIn(PROFESSIONAL_SKILL_CATEGORIES) category!: string;
  @Matches(/^[A-Z][A-Z0-9_]{1,63}$/) skillCode!: string;
}
export class ExperienceDto {
  @IsString() @MaxLength(120) organizationName!: string;
  @IsString() @MaxLength(100) role!: string;
  @IsOptional() @IsString() @MaxLength(100) specialization?: string;
  @IsDateString() startDate!: string;
  @IsOptional() @IsDateString() endDate?: string;
}
export class CredentialDto {
  @IsString() @MaxLength(40) kind!: string;
  @IsString() @MaxLength(120) issuer!: string;
  @IsString() @MaxLength(160) title!: string;
  @IsDateString() issuedAt!: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsString() @MaxLength(160) credentialReference?: string;
}
