/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../auth/auth.decorators.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import {
  PredictionFeedbackDto,
  PredictionListDto,
  PredictionOutcomeDto,
  RefreshPredictionDto,
} from "./prediction.dto.js";
import { PredictionsService } from "./predictions.service.js";
@Controller("businesses/:businessId/customers/:customerId/predictions")
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class PredictionsController {
  constructor(private readonly predictions: PredictionsService) {}
  @Get() list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("customerId", ResourceIdPipe) customerId: string,
    @Query() q: PredictionListDto,
  ) {
    return this.predictions.list(
      user,
      businessId,
      customerId,
      q.limit,
      q.cursor,
    );
  }
  @Get(":idOrType") get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("customerId", ResourceIdPipe) customerId: string,
    @Param("idOrType") idOrType: string,
  ) {
    return this.predictions.get(user, businessId, customerId, idOrType);
  }
  @Post("refresh") refresh(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("customerId", ResourceIdPipe) customerId: string,
    @Body() dto: RefreshPredictionDto,
  ) {
    return this.predictions.refresh(user, businessId, customerId, dto.type);
  }
  @Post(":predictionId/feedback") feedback(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("customerId", ResourceIdPipe) customerId: string,
    @Param("predictionId", ResourceIdPipe) predictionId: string,
    @Body() dto: PredictionFeedbackDto,
  ) {
    return this.predictions.feedback(
      user,
      businessId,
      customerId,
      predictionId,
      dto.kind,
      dto.metadata,
    );
  }
  @Post(":predictionId/outcome") outcome(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("customerId", ResourceIdPipe) customerId: string,
    @Param("predictionId", ResourceIdPipe) predictionId: string,
    @Body() dto: PredictionOutcomeDto,
  ) {
    return this.predictions.outcome(
      user,
      businessId,
      customerId,
      predictionId,
      dto.outcome,
      dto.actualValue,
      new Date(dto.occurredAt),
    );
  }
}
@Controller("businesses/:businessId/prediction-insights")
export class PredictionInsightsController {
  constructor(private readonly predictions: PredictionsService) {}
  @Get() get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
  ) {
    return this.predictions.aggregate(user, businessId);
  }
}
