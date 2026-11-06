/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/auth.decorators.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import { MvpService } from "./mvp.service.js";
import { ResultDto, SatisfactionDto } from "./mvp.dto.js";
@Controller("mvp/v1")
export class MvpController {
  constructor(private readonly service: MvpService) {}
  @Get("capabilities") capabilities() {
    return this.service.capabilities();
  }
  @Get("bookings") bookings(@CurrentUser() user: AuthenticatedUser) {
    return this.service.bookings(user);
  }
  @Get("passport") passport(@CurrentUser() user: AuthenticatedUser) {
    return this.service.passport(user);
  }
  @Get("catalog/:businessId") catalog(
    @Param("businessId", ResourceIdPipe) businessId: string,
  ) {
    return this.service.catalog(businessId);
  }
  @Get("businesses/:businessId/appointments/:appointmentId/result") result(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("appointmentId", ResourceIdPipe) appointmentId: string,
  ) {
    return this.service.getResult(user, businessId, appointmentId);
  }
  @Post("businesses/:businessId/appointments/:appointmentId/result") record(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("appointmentId", ResourceIdPipe) appointmentId: string,
    @Body() dto: ResultDto,
  ) {
    return this.service.recordResult(user, businessId, appointmentId, dto);
  }
  @Post("businesses/:businessId/appointments/:appointmentId/satisfaction")
  satisfy(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("appointmentId", ResourceIdPipe) appointmentId: string,
    @Body() dto: SatisfactionDto,
  ) {
    return this.service.satisfy(user, businessId, appointmentId, dto);
  }
}
