import {
  IsDateString,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
} from "class-validator";
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
export class SharedBookingTargetDto {
  @IsString() @Matches(ID) businessId!: string;
  @IsString() @Matches(ID) serviceId!: string;
  @IsString() @Matches(ID) professionalId!: string;
  @IsString() @Matches(ID) locationId!: string;
}
export class SharedAvailabilityQueryDto extends SharedBookingTargetDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  date!: string;
}
export class SharedCreateBookingDto extends SharedBookingTargetDto {
  @IsDateString({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  startsAt!: string;
  @IsString() @Matches(/^\d{1,10}(?:\.\d{1,2})?$/) expectedPrice!: string;
  @IsString() @Matches(/^[A-Z]{3}$/) expectedCurrency!: string;
  @IsInt() @Min(1) @Max(1440) expectedDurationMinutes!: number;
}
export class SharedCancelBookingDto {
  @IsString() @Matches(ID) businessId!: string;
}
