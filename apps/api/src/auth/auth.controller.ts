import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
/* eslint-disable @typescript-eslint/consistent-type-imports */
import { AuthService } from "./auth.service.js";
import { CurrentUser, Public } from "./auth.decorators.js";
import { LoginDto, LogoutDto, RefreshDto, RegisterDto } from "./dto.js";
import type { AuthenticatedUser } from "./auth.types.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.password);
  }
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post("refresh")
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }
  @Public() @HttpCode(204) @Post("logout") logout(@Body() dto: LogoutDto) {
    return this.auth.logout(dto.refreshToken);
  }
  @Get("me") me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
