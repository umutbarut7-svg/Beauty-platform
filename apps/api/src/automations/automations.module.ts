import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { CustomerMetricsService } from "../customers/segments/customer-metrics.service.js";
import { AutomationsController } from "./automations.controller.js";
import { AutomationsService } from "./automations.service.js";
@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [AutomationsController],
  providers: [AutomationsService, CustomerMetricsService],
  exports: [AutomationsService],
})
export class AutomationsModule {}
