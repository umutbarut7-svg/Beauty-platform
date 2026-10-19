/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { Public } from "../auth/auth.decorators.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import { ApiPrincipalParam } from "./public-api.decorators.js";
import type { ApiPrincipal } from "./public-api.types.js";
import {
  CreateWebhookDto,
  PublicAiInvokeDto,
  PublicAvailabilityQueryDto,
  PublicBookingDto,
  PublicDiscoveryQueryDto,
} from "./public-api.dto.js";
import { PublicApiCredentialGuard } from "./public-api.guard.js";
import { PublicApiExceptionFilter } from "./public-api-exception.filter.js";
import { PublicApiUsageInterceptor } from "./public-api-usage.interceptor.js";
import { PublicApiService } from "./public-api.service.js";
import { ExternalAiToolsService } from "./external-ai-tools.service.js";
import { WebhookService } from "./webhook.service.js";
import { CategoryEngineService } from "../categories/category-engine.service.js";
import { GlobalizationContextQueryDto } from "../globalization/globalization.dto.js";
import { GlobalizationService } from "../globalization/globalization.service.js";
@Public()
@UseGuards(PublicApiCredentialGuard)
@UseFilters(PublicApiExceptionFilter)
@UseInterceptors(PublicApiUsageInterceptor)
@Controller("api/public/v1")
export class PublicApiController {
  constructor(
    private readonly service: PublicApiService,
    private readonly ai: ExternalAiToolsService,
    private readonly webhooks: WebhookService,
    private readonly categoryEngine: CategoryEngineService,
    private readonly globalization: GlobalizationService,
  ) {}
  @Get("business") business(@ApiPrincipalParam() p: ApiPrincipal) {
    return this.service.business(p);
  }
  @Get("categories") categories(@ApiPrincipalParam() p: ApiPrincipal) {
    this.service.requireScope(p, "services.read");
    return this.categoryEngine
      .registry()
      .then((data) => ({ data, meta: { apiVersion: "v1" } }));
  }
  @Get("globalization/context") globalizationContext(
    @ApiPrincipalParam() p: ApiPrincipal,
    @Query() query: GlobalizationContextQueryDto,
  ) {
    this.service.requireScope(p, "business.read");
    return this.globalization
      .resolveForBusiness(p.businessId, query)
      .then((data) => ({ data, meta: { apiVersion: "v1" } }));
  }
  @Get("services") services(@ApiPrincipalParam() p: ApiPrincipal) {
    return this.service.services(p);
  }
  @Get("professionals") professionals(@ApiPrincipalParam() p: ApiPrincipal) {
    return this.service.professionals(p);
  }
  @Get("availability") availability(
    @ApiPrincipalParam() p: ApiPrincipal,
    @Query() q: PublicAvailabilityQueryDto,
  ) {
    return this.service.availability(p, q);
  }
  @Get("bookings/:id") booking(
    @ApiPrincipalParam() p: ApiPrincipal,
    @Param("id", ResourceIdPipe) id: string,
  ) {
    return this.service.getBooking(p, id);
  }
  @Post("bookings") createBooking(
    @ApiPrincipalParam() p: ApiPrincipal,
    @Headers("idempotency-key") key: string,
    @Body() d: PublicBookingDto,
  ) {
    return this.service.createBooking(p, d, key);
  }
  @Delete("bookings/:id") cancelBooking(
    @ApiPrincipalParam() p: ApiPrincipal,
    @Param("id", ResourceIdPipe) id: string,
    @Headers("idempotency-key") key: string,
  ) {
    return this.service.cancelBooking(p, id, key);
  }
  @Get("results/:id") result(
    @ApiPrincipalParam() p: ApiPrincipal,
    @Param("id", ResourceIdPipe) id: string,
  ) {
    return this.service.result(p, id);
  }
  @Get("discovery") discovery(
    @ApiPrincipalParam() p: ApiPrincipal,
    @Query() q: PublicDiscoveryQueryDto,
  ) {
    return this.service.discovery(p, q);
  }
  @Get("ai/tools") tools() {
    return { data: this.ai.list(), meta: { apiVersion: "v1" } };
  }
  @Post("webhooks") createWebhook(
    @ApiPrincipalParam() p: ApiPrincipal,
    @Body() dto: CreateWebhookDto,
  ) {
    this.service.requireScope(p, "webhook.manage");
    return this.webhooks.create(p, dto.url, dto.events);
  }
  @Post("ai/authorize") authorizeAi(
    @ApiPrincipalParam() p: ApiPrincipal,
    @Body() d: PublicAiInvokeDto,
  ) {
    return {
      data: this.ai.authorize(p, d.tool, Boolean(d.confirmationToken)),
      meta: { apiVersion: "v1" },
    };
  }
}
