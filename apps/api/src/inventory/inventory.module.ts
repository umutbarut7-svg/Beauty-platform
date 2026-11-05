import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import {
  AppointmentMaterialsController,
  InventoryController,
  PublicProductsController,
} from "./inventory.controller.js";
import { InventoryService } from "./inventory.service.js";
@Module({
  imports: [AuthModule],
  controllers: [
    InventoryController,
    PublicProductsController,
    AppointmentMaterialsController,
  ],
  providers: [InventoryService, ResourceIdPipe],
})
export class InventoryModule {}
