/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../auth/auth.decorators.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import { SharedServiceQueryDto } from "./shared-service.controller.js";
import {
  SharedAvailabilityQueryDto,
  SharedCancelBookingDto,
  SharedCreateBookingDto,
} from "./shared-booking.dto.js";
import { SharedBookingService } from "./shared-booking.service.js";

@Controller("discovery/shared-service")
export class SharedBookingController {
  constructor(private readonly bookings: SharedBookingService) {}
  @Get("availability")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  availability(@Query() query: SharedAvailabilityQueryDto) {
    return this.bookings.quote(query);
  }
  @Post("bookings")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  book(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SharedCreateBookingDto,
  ) {
    return this.bookings.book(user, body);
  }
  @Get("bookings")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  mine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SharedServiceQueryDto,
  ) {
    return this.bookings.mine(user, query);
  }
  @Post("bookings/:appointmentId/cancel")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param("appointmentId", ResourceIdPipe) id: string,
    @Body() body: SharedCancelBookingDto,
  ) {
    return this.bookings.cancel(user, body.businessId, id);
  }
}
