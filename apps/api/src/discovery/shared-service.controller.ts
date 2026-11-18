/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Controller, Get, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsOptional, IsString, Matches } from "class-validator";
import { Public } from "../auth/auth.decorators.js";
import { SharedServiceService } from "./shared-service.service.js";

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
export class SharedServiceQueryDto {
  @IsString() @Matches(ID) businessId!: string;
  @IsString() @Matches(ID) serviceId!: string;
  @IsOptional() @IsString() @Matches(ID) professionalId?: string;
  @IsOptional() @IsString() @Matches(ID) resultId?: string;
}

@Controller("discovery")
export class SharedServiceController {
  constructor(private readonly service: SharedServiceService) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get("shared-service")
  resolve(@Query() query: SharedServiceQueryDto) {
    return this.service.resolve(query);
  }
}
