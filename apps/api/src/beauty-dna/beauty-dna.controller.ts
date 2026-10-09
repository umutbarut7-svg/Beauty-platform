/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../auth/auth.decorators.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import { BeautyDNAService } from "./beauty-dna.service.js";
import {
  BeautyDNAHistoryQueryDto,
  DeclaredTraitDto,
  PredictionInferenceDto,
} from "./beauty-dna.dto.js";
@Controller("businesses/:businessId/customers/:customerId/beauty-dna")
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class BeautyDNAController {
  constructor(private readonly beautyDNA: BeautyDNAService) {}
  @Get() get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("customerId", ResourceIdPipe) customerId: string,
  ) {
    return this.beautyDNA.get(user, businessId, customerId);
  }
  @Get("history") history(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("customerId", ResourceIdPipe) customerId: string,
    @Query() query: BeautyDNAHistoryQueryDto,
  ) {
    return this.beautyDNA.history(user, businessId, customerId, query.limit);
  }
  @Put("traits") declare(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("customerId", ResourceIdPipe) customerId: string,
    @Body() dto: DeclaredTraitDto,
  ) {
    return this.beautyDNA.declare(
      user,
      businessId,
      customerId,
      dto.category,
      dto.traitType,
      dto.value,
      dto.idempotencyKey,
    );
  }
  @Delete("traits/:category/:traitType") deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("customerId", ResourceIdPipe) customerId: string,
    @Param("category") category: string,
    @Param("traitType") traitType: string,
  ) {
    return this.beautyDNA.deactivate(
      user,
      businessId,
      customerId,
      category,
      traitType,
    );
  }
  @Post("recalculate") recalculate(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("customerId", ResourceIdPipe) customerId: string,
  ) {
    return this.beautyDNA.recalculate(user, businessId, customerId);
  }
  @Post("prediction-inference") predictionInference(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("customerId", ResourceIdPipe) customerId: string,
    @Body() dto: PredictionInferenceDto,
  ) {
    return this.beautyDNA.applyPredictionInference(
      user,
      businessId,
      customerId,
      dto.predictionId,
      dto.category,
      dto.traitType,
    );
  }
}
