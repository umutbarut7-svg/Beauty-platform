/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/auth.decorators.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import {
  LiquidityQueryDto,
  RecalculateLiquidityDto,
} from "./marketplace-liquidity.dto.js";
import { MarketplaceLiquidityService } from "./marketplace-liquidity.service.js";
@Controller("businesses/:businessId/marketplace")
export class MarketplaceLiquidityController {
  constructor(private readonly service: MarketplaceLiquidityService) {}
  @Get("liquidity") liquidity(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Query() query: LiquidityQueryDto,
  ) {
    return this.service.overview(user, businessId, query.window);
  }
  @Get("demand") demand(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Query() query: LiquidityQueryDto,
  ) {
    return this.service.demand(user, businessId, query.limit, query.window);
  }
  @Get("supply") supply(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Query() query: LiquidityQueryDto,
  ) {
    return this.service.supply(user, businessId, query.limit);
  }
  @Get("capacity") capacity(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Query() query: LiquidityQueryDto,
  ) {
    return this.service.capacity(user, businessId, query.limit);
  }
  @Get("supply-gaps") gaps(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Query() query: LiquidityQueryDto,
  ) {
    return this.service.gaps(user, businessId, query.limit);
  }
  @Get("opportunities") opportunities(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Query() query: LiquidityQueryDto,
  ) {
    return this.service.opportunities(user, businessId, query.limit);
  }
  @Post("recalculate") recalculate(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Body() dto: RecalculateLiquidityDto,
  ) {
    return this.service.recalculate(user, businessId, dto.window);
  }
}
