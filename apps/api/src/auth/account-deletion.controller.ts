import { Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  Equals,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { CurrentUser, Roles } from "./auth.decorators.js";
import type { AuthenticatedUser } from "./auth.types.js";
/* eslint-disable @typescript-eslint/consistent-type-imports */
import { AccountDeletionService } from "./account-deletion.service.js";

export class AccountDeletionDto {
  @IsString() @MinLength(1) password!: string;
  @Equals("HESABIMI SIL") confirmation!: string;
}

export class DeletionQueueQuery {
  @IsOptional() @IsString() @MaxLength(100) after?: string;
}

@Controller("auth/account-deletion")
export class AccountDeletionController {
  constructor(private readonly deletion: AccountDeletionService) {}

  @Get()
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.deletion.status(user.id);
  }

  @Get("pending")
  @Roles("SUPER_ADMIN")
  pending(@Query() query: DeletionQueueQuery) {
    return this.deletion.pending(query.after);
  }

  @Post()
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  request(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AccountDeletionDto,
  ) {
    return this.deletion.request(user.id, dto.password);
  }
}
