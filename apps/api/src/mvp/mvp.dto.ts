import { IsIn, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class ResultDto {
  @IsString() @MinLength(1) @MaxLength(2000) @Matches(/\S/) summary!: string;
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9_-]+$/)
  idempotencyKey!: string;
}
export class SatisfactionDto {
  @IsIn(["SATISFIED", "UNSATISFIED", "UNSURE"]) outcome!:
    "SATISFIED" | "UNSATISFIED" | "UNSURE";
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9_-]+$/)
  idempotencyKey!: string;
}
