import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

const PHONE = /^\+?[0-9][0-9 ()-]{5,24}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const GENDERS = ["FEMALE", "MALE", "NON_BINARY", "PREFER_NOT_TO_SAY", "OTHER"];
export class CreateBusinessCustomerDto {
  @IsString() @MinLength(1) @MaxLength(100) firstName!: string;
  @IsString() @MinLength(1) @MaxLength(100) lastName!: string;
  @IsOptional() @IsString() @Matches(PHONE) phone?: string;
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsDateString({ strict: true }) birthDate?: string;
  @IsOptional() @IsIn(GENDERS) gender?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsString() @MaxLength(100) source?: string;
  @IsOptional() @IsString() @Matches(ID) preferredStaffId?: string;
  @IsOptional() @IsBoolean() marketingConsent?: boolean;
  @IsOptional() @IsBoolean() smsConsent?: boolean;
  @IsOptional() @IsBoolean() emailConsent?: boolean;
}
export class UpdateBusinessCustomerDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) firstName?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) lastName?: string;
  @IsOptional() @IsString() @Matches(PHONE) phone?: string;
  @IsOptional() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @IsDateString({ strict: true }) birthDate?: string;
  @IsOptional() @IsIn(GENDERS) gender?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsString() @MaxLength(100) source?: string;
  @IsOptional() @IsString() @Matches(ID) preferredStaffId?: string;
  @IsOptional() @IsBoolean() marketingConsent?: boolean;
  @IsOptional() @IsBoolean() smsConsent?: boolean;
  @IsOptional() @IsBoolean() emailConsent?: boolean;
  @IsOptional() @IsBoolean() archived?: boolean;
}
export class CustomerListQueryDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
  @IsOptional() @IsIn(["createdAt", "name"]) sort = "createdAt";
  @IsOptional() @IsIn(["asc", "desc"]) direction: "asc" | "desc" = "desc";
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  archived = false;
  @IsOptional() @IsString() @Matches(ID) tagId?: string;
  @IsOptional() @IsString() @Matches(ID) preferredStaffId?: string;
}
export class CreateCustomerNoteDto {
  @IsString() @MinLength(1) @MaxLength(2000) content!: string;
}
export class UpdateCustomerNoteDto {
  @IsString() @MinLength(1) @MaxLength(2000) content!: string;
}
export class CreateCustomerTagDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(80)
  slug?: string;
  @IsOptional() @IsString() @Matches(/^#[0-9A-Fa-f]{6}$/) color?: string;
}
export class UpdateCustomerTagDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @Matches(/^#[0-9A-Fa-f]{6}$/) color?: string;
}
