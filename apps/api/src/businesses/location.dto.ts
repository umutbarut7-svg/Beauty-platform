import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateLocationDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsString() @MinLength(3) @MaxLength(300) address!: string;
  @IsString() @MinLength(2) @MaxLength(100) city!: string;
  @IsOptional() @IsString() @MaxLength(100) district?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(2) country?: string;
  @IsOptional() @IsNumberString() @IsLatitude() latitude?: string;
  @IsOptional() @IsNumberString() @IsLongitude() longitude?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(100) timezone?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateLocationDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(100) district?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(2) country?: string;
  @IsOptional() @IsNumberString() @IsLatitude() latitude?: string;
  @IsOptional() @IsNumberString() @IsLongitude() longitude?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(100) timezone?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
