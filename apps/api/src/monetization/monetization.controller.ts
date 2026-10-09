/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/auth.decorators.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import {
  ForecastDto,
  RefundDto,
  SubscriptionTransitionDto,
  UsageIngestionDto,
} from "./monetization.dto.js";
import { MonetizationService } from "./monetization.service.js";
@Controller("businesses/:businessId/financial")
export class MonetizationController {
  constructor(private readonly service: MonetizationService) {}
  @Get("plans") plans(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
  ) {
    return this.service.plans(user, businessId);
  }
  @Get("subscription") subscription(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
  ) {
    return this.service.subscription(user, businessId);
  }
  @Post("subscriptions/:subscriptionId/transition") transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("subscriptionId", ResourceIdPipe) subscriptionId: string,
    @Body() dto: SubscriptionTransitionDto,
  ) {
    return this.service.transitionSubscription(
      user,
      businessId,
      subscriptionId,
      dto.status,
      dto.reason,
    );
  }
  @Post("usage") usage(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Body() dto: UsageIngestionDto,
  ) {
    return this.service.ingestUsage(user, businessId, {
      ...dto,
      quantity: BigInt(dto.quantity),
      occurredAt: new Date(dto.occurredAt),
    });
  }
  @Post("refunds") refund(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Body() dto: RefundDto,
  ) {
    return this.service.refund(user, businessId, {
      ...dto,
      amountMinor: BigInt(dto.amountMinor),
    });
  }
  @Get("summary") summary(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
  ) {
    return this.service.summary(user, businessId);
  }
  @Get("settlements") settlements(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
  ) {
    return this.service.settlements(user, businessId);
  }
  @Get("credits") credits(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
  ) {
    return this.service.credits(user, businessId);
  }
  @Post("forecast") forecast(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Body() dto: ForecastDto,
  ) {
    return this.service.forecast(
      user,
      businessId,
      (dto.periods ?? []).map((x) => ({
        ...x,
        amountMinor: BigInt(x.amountMinor),
      })),
      Number(dto.horizonDays),
    );
  }
}
