import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import {
  CustomersController,
  CustomerTagsController,
} from "./customers.controller.js";
import { CustomersService } from "./customers.service.js";
import { CustomerMetricsService } from "./segments/customer-metrics.service.js";
import {
  InsightsController,
  SegmentsController,
} from "./segments/segments.controller.js";
import { SegmentsService } from "./segments/segments.service.js";

@Module({
  imports: [AuthModule],
  controllers: [
    CustomersController,
    CustomerTagsController,
    SegmentsController,
    InsightsController,
  ],
  providers: [
    CustomersService,
    CustomerMetricsService,
    SegmentsService,
    ResourceIdPipe,
  ],
})
export class CustomersModule {}
