import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
export class CreateConversationDto {
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  participantUserIds!: string[];
}
export class SendMessageDto {
  @IsString() @MinLength(1) @MaxLength(5000) body!: string;
  @IsString() @MinLength(1) @MaxLength(200) idempotencyKey!: string;
}
export class MessageListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}
