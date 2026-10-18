import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import { AGENT_INTENTS } from "./agent.types.js";
const ID = /^[A-Za-z0-9_-]{1,64}$/;
export class CreateAgentSessionDto {
  @IsIn([
    "BOOKING",
    "CUSTOMER_BEAUTY",
    "BUSINESS_GROWTH",
    "PROFESSIONAL_COPILOT",
  ])
  agentType!:
    "BOOKING" | "CUSTOMER_BEAUTY" | "BUSINESS_GROWTH" | "PROFESSIONAL_COPILOT";
  @IsIn(["TEXT", "VOICE", "PHOTO"]) source!: "TEXT" | "VOICE" | "PHOTO";
  @IsOptional() @IsString() @MaxLength(500) message?: string;
}
export class AgentMessageDto {
  @IsIn(["TEXT", "VOICE", "PHOTO"]) source!: "TEXT" | "VOICE" | "PHOTO";
  @IsString() @MaxLength(2000) content!: string;
  @IsOptional() @IsIn(AGENT_INTENTS) intent?: (typeof AGENT_INTENTS)[number];
  @IsOptional() @IsString() @MaxLength(80) requestedTool?: string;
  @IsOptional() @IsObject() arguments?: Record<string, unknown>;
}
export class AgentActionDto {
  @IsString() @Matches(ID) actionId!: string;
}
