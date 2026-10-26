import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from "@nestjs/common";
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

export class BeginDeletionDto {
  @Equals("ISLEME AL") confirmation!: string;
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

  @Post(":requestId/begin")
  @Roles("SUPER_ADMIN")
  @HttpCode(202)
  begin(
    @Param("requestId") requestId: string,
    @Body() dto: BeginDeletionDto,
    @CurrentUser() operator: AuthenticatedUser,
  ) {
    void dto; // The global validation pipe enforces the operator confirmation.
    return this.deletion.beginProcessing(requestId, operator.id);
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
