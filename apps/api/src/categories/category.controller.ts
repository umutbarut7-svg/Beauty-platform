/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { CurrentUser } from "../auth/auth.decorators.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import { CategoryEngineService } from "./category-engine.service.js";
import { TenantCategoryConfigurationDto } from "./category.dto.js";
@Controller("categories")
export class CategoryRegistryController {
  constructor(private readonly categories: CategoryEngineService) {}
  @Get() registry() {
    return this.categories.registry();
  }
}
@Controller("businesses/:businessId/category-configurations")
export class TenantCategoryController {
  constructor(private readonly categories: CategoryEngineService) {}
  @Get() list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
  ) {
    return this.categories.tenantRegistry(user, businessId);
  }
  @Put()
  configure(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Body() dto: TenantCategoryConfigurationDto,
  ) {
    return this.categories.configure(user, businessId, dto);
  }
}
