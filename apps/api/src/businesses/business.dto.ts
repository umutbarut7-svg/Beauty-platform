import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsISO4217CurrencyCode,
  IsLatitude,
  IsLongitude,
  IsNumberString,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateBusinessDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional()
  @IsString()
  @Length(3, 80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) website?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) logoUrl?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) coverImageUrl?: string;
  @IsOptional() @IsString() @MaxLength(100) timezone?: string;
  @IsOptional() @IsISO4217CurrencyCode() currency?: string;
  @IsOptional() @IsString() @Length(2, 2) country?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(100) district?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsNumberString() @IsLatitude() latitude?: string;
  @IsOptional() @IsNumberString() @IsLongitude() longitude?: string;
}

export class UpdateBusinessDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional()
  @IsString()
  @Length(3, 80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) website?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) logoUrl?: string;
  @IsOptional() @IsUrl({ require_protocol: true }) coverImageUrl?: string;
  @IsOptional() @IsString() @MaxLength(100) timezone?: string;
  @IsOptional() @IsISO4217CurrencyCode() currency?: string;
  @IsOptional() @IsString() @Length(2, 2) country?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(100) district?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsNumberString() @IsLatitude() latitude?: string;
  @IsOptional() @IsNumberString() @IsLongitude() longitude?: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsIn(["ACTIVE", "INACTIVE", "SUSPENDED"]) status?:
    "ACTIVE" | "INACTIVE" | "SUSPENDED";
}
