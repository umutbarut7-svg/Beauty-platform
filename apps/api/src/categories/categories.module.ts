import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import { CategoryEngineService } from "./category-engine.service.js";
import {
  CategoryRegistryController,
  TenantCategoryController,
} from "./category.controller.js";
@Module({
  imports: [AuthModule],
  controllers: [CategoryRegistryController, TenantCategoryController],
  providers: [CategoryEngineService, ResourceIdPipe],
  exports: [CategoryEngineService],
})
export class CategoriesModule {}
