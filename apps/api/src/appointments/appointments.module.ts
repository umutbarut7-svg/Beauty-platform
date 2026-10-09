import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { CategoriesModule } from "../categories/categories.module.js";
import { GlobalizationModule } from "../globalization/globalization.module.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import {
  AppointmentsController,
  StaffAvailabilityController,
} from "./appointments.controller.js";
import { AppointmentsService } from "./appointments.service.js";
import { AvailabilityService } from "./availability.service.js";

@Module({
  imports: [AuthModule, CategoriesModule, GlobalizationModule],
  controllers: [AppointmentsController, StaffAvailabilityController],
  providers: [AppointmentsService, AvailabilityService, ResourceIdPipe],
  exports: [AvailabilityService, AppointmentsService],
})
export class AppointmentsModule {}
