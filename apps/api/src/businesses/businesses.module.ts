import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import {
  BusinessesController,
  LocationsController,
  StaffController,
} from "./businesses.controller.js";
import { BusinessesService } from "./businesses.service.js";
import {
  BranchesController,
  MembersController,
  SettingsController,
  WorkingHoursController,
} from "./salon-core.controller.js";
import { SalonCoreService } from "./salon-core.service.js";
import {
  CatalogServicesController,
  ServiceCategoriesController,
  StaffServicesController,
} from "./catalog.controller.js";
import { CatalogService } from "./catalog.service.js";
import { ResourceIdPipe } from "./resource-id.pipe.js";
@Module({
  imports: [AuthModule],
  controllers: [
    BusinessesController,
    LocationsController,
    StaffController,
    ServiceCategoriesController,
    CatalogServicesController,
    StaffServicesController,
    MembersController,
    BranchesController,
    SettingsController,
    WorkingHoursController,
  ],
  providers: [
    BusinessesService,
    SalonCoreService,
    CatalogService,
    ResourceIdPipe,
  ],
})
export class BusinessesModule {}
