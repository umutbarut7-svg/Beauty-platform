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
  Matches,
} from "class-validator";
import { CurrentUser, Public, Roles } from "./auth.decorators.js";
import type { AuthenticatedUser } from "./auth.types.js";
/* eslint-disable @typescript-eslint/consistent-type-imports */
import { AccountErasureService } from "./account-erasure.service.js";
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

export class FinalizeDeletionDto {
  @Equals("KALICI SIL") confirmation!: string;
}
export class TrackingDto {
  @IsString() @MinLength(1) @MaxLength(1024) password!: string;
}
export class ReceiptDto {
  @IsString()
  @MaxLength(150)
  @Matches(/^[a-zA-Z0-9_-]{1,100}\.[a-zA-Z0-9_-]{43}$/)
  token!: string;
}

@Controller("auth/account-deletion")
export class AccountDeletionController {
  constructor(
    private readonly deletion: AccountDeletionService,
    private readonly erasure: AccountErasureService,
  ) {}

  @Get()
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.deletion.status(user.id);
  }

  @Get("pending")
  @Roles("SUPER_ADMIN")
  pending(@Query() query: DeletionQueueQuery) {
    return this.deletion.pending(query.after);
  }

  @Post("tracking")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  tracking(@CurrentUser() user: AuthenticatedUser, @Body() dto: TrackingDto) {
    return this.erasure.tracking(user.id, dto.password);
  }

  @Post("receipt")
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  receipt(@Body() dto: ReceiptDto) {
    return this.erasure.receipt(dto.token);
  }

  @Get(":requestId/inspection")
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Roles("SUPER_ADMIN")
  inspect(@Param("requestId") id: string) {
    return this.erasure.inspect(id);
  }

  @Post(":requestId/finalize")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Roles("SUPER_ADMIN")
  @HttpCode(200)
  finalize(
    @Param("requestId") id: string,
    @Body() dto: FinalizeDeletionDto,
    @CurrentUser() operator: AuthenticatedUser,
  ) {
    void dto;
    return this.erasure.finalize(id, operator.id);
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
