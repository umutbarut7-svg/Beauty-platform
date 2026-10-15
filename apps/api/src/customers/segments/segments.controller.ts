/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "../../auth/auth.decorators.js";
import type { AuthenticatedUser } from "../../auth/auth.types.js";
import { ResourceIdPipe } from "../../businesses/resource-id.pipe.js";
import {
  CreateSegmentDto,
  SegmentCustomersQueryDto,
  UpdateSegmentDto,
} from "./segment.dto.js";
import { SegmentsService } from "./segments.service.js";
@Controller("businesses/:businessId/customer-segments")
export class SegmentsController {
  constructor(private readonly service: SegmentsService) {}
  @Get() list(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
  ) {
    return this.service.list(u, b);
  }
  @Post() create(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Body() d: CreateSegmentDto,
  ) {
    return this.service.create(u, b, d);
  }
  @Get(":segmentId") get(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("segmentId", ResourceIdPipe) s: string,
  ) {
    return this.service.get(u, b, s);
  }
  @Patch(":segmentId") update(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("segmentId", ResourceIdPipe) s: string,
    @Body() d: UpdateSegmentDto,
  ) {
    return this.service.update(u, b, s, d);
  }
  @Delete(":segmentId") remove(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("segmentId", ResourceIdPipe) s: string,
  ) {
    return this.service.delete(u, b, s);
  }
  @Post(":segmentId/customers/:customerId") add(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("segmentId", ResourceIdPipe) s: string,
    @Param("customerId", ResourceIdPipe) c: string,
  ) {
    return this.service.addCustomer(u, b, s, c);
  }
  @Delete(":segmentId/customers/:customerId") drop(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("segmentId", ResourceIdPipe) s: string,
    @Param("customerId", ResourceIdPipe) c: string,
  ) {
    return this.service.removeCustomer(u, b, s, c);
  }
  @Get(":segmentId/customers") customers(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("segmentId", ResourceIdPipe) s: string,
    @Query() q: SegmentCustomersQueryDto,
  ) {
    return this.service.customers(u, b, s, q);
  }
}
@Controller("businesses/:businessId")
export class InsightsController {
  constructor(private readonly service: SegmentsService) {}
  @Get("customer-insights") insights(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
  ) {
    return this.service.insights(u, b);
  }
  @Get("customers/:customerId/metrics") metrics(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("customerId", ResourceIdPipe) c: string,
  ) {
    return this.service.customerMetrics(u, b, c);
  }
}
