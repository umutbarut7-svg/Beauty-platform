/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/auth.decorators.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import { BusinessIntelligenceService } from "./business-intelligence.service.js";
import {
  CreateExperimentDto,
  ExperimentResultDto,
  MetricParamDto,
  RecalculateDto,
} from "./business-intelligence.dto.js";
@Controller("businesses/:businessId/intelligence")
export class BusinessIntelligenceController {
  constructor(private readonly s: BusinessIntelligenceService) {}
  @Get() overview(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
  ) {
    return this.s.overview(u, b);
  }
  @Get("metrics") metrics(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
  ) {
    return this.s.metrics(u, b);
  }
  @Get("insights") insights(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
  ) {
    return this.s.insights(u, b);
  }
  @Get("opportunities") opportunities(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
  ) {
    return this.s.opportunities(u, b);
  }
  @Get("risks") risks(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
  ) {
    return this.s.risks(u, b);
  }
  @Get("recommendations") recommendations(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
  ) {
    return this.s.recommendations(u, b);
  }
  @Post("recalculate") recalculate(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Body() d: RecalculateDto,
  ) {
    return this.s.recalculate(u, b, d.window);
  }
  @Get("experiments") experiments(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
  ) {
    return this.s.experiments(u, b);
  }
  @Post("experiments") create(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Body() d: CreateExperimentDto,
  ) {
    return this.s.createExperiment(u, b, d);
  }
  @Post("experiments/:id/result") result(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("id", ResourceIdPipe) id: string,
    @Body() d: ExperimentResultDto,
  ) {
    return this.s.result(
      u,
      b,
      id,
      d.baselineValue ?? null,
      d.experimentValue ?? null,
      d.sampleSize,
    );
  }
  @Post("experiments/:id/:state") transition(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("id", ResourceIdPipe) id: string,
    @Param("state") state: string,
  ) {
    return this.s.transitionExperiment(u, b, id, state);
  }
  @Get("benchmarks/:metric") benchmark(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param() p: MetricParamDto,
  ) {
    return this.s.benchmark(u, b, p.metric);
  }
  @Get("versions") versions(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
  ) {
    return this.s.versions(u, b);
  }
}
