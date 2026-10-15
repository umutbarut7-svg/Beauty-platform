import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { API_SCOPES } from "./public-api.types.js";
export class CreateApiApplicationDto {
  @IsString() @MaxLength(100) name!: string;
  @IsArray() @IsIn(API_SCOPES, { each: true }) scopes!: string[];
}
export class RotateCredentialDto {
  @IsOptional() @IsISO8601() expiresAt?: string;
}
export class CreateWebhookDto {
  @IsUrl({ protocols: ["https"], require_protocol: true }) url!: string;
  @IsArray()
  @IsIn(
    [
      "booking.created.v1",
      "booking.updated.v1",
      "booking.cancelled.v1",
      "result.created.v1",
      "result.updated.v1",
    ],
    { each: true },
  )
  events!: string[];
}
export class PublicAvailabilityQueryDto {
  @IsString() serviceId!: string;
  @IsString() professionalId!: string;
  @IsString() locationId!: string;
  @IsISO8601({ strict: true }) date!: string;
}
export class PublicBookingDto {
  @IsString() serviceId!: string;
  @IsString() professionalId!: string;
  @IsString() locationId!: string;
  @IsString() customerId!: string;
  @IsISO8601() startsAt!: string;
}
export class PublicDiscoveryQueryDto {
  @IsOptional() @IsString() @MaxLength(200) query?: string;
  @IsOptional() @IsString() serviceId?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number =
    20;
}
export class PublicAiInvokeDto {
  @IsString() tool!: string;
  @IsOptional() input: Record<string, unknown> = {};
  @IsOptional() @IsString() confirmationToken?: string;
}
