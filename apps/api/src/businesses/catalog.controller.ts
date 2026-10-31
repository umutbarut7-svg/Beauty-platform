/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { CurrentUser } from "../auth/auth.decorators.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import {
  AssignStaffServiceDto,
  CreateCatalogServiceDto,
  CreateServiceCategoryDto,
  UpdateCatalogServiceDto,
  UpdateServiceCategoryDto,
  UpdateStaffServiceDto,
} from "./catalog.dto.js";
import { CatalogService } from "./catalog.service.js";
import { ResourceIdPipe } from "./resource-id.pipe.js";

@Controller("businesses/:businessId/service-categories")
export class ServiceCategoriesController {
  constructor(private readonly catalog: CatalogService) {}
  @Post() create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Body() dto: CreateServiceCategoryDto,
  ) {
    return this.catalog.createCategory(user, businessId, dto);
  }
  @Get() list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
  ) {
    return this.catalog.listCategories(user, businessId);
  }
  @Get(":categoryId") get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("categoryId", ResourceIdPipe) categoryId: string,
  ) {
    return this.catalog.getCategory(user, businessId, categoryId);
  }
  @Patch(":categoryId") update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("categoryId", ResourceIdPipe) categoryId: string,
    @Body() dto: UpdateServiceCategoryDto,
  ) {
    return this.catalog.updateCategory(user, businessId, categoryId, dto);
  }
  @Delete(":categoryId") @HttpCode(204) remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("categoryId", ResourceIdPipe) categoryId: string,
  ) {
    return this.catalog.deleteCategory(user, businessId, categoryId);
  }
}

@Controller("businesses/:businessId/services")
export class CatalogServicesController {
  constructor(private readonly catalog: CatalogService) {}
  @Post() create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Body() dto: CreateCatalogServiceDto,
  ) {
    return this.catalog.createService(user, businessId, dto);
  }
  @Get() list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
  ) {
    return this.catalog.listServices(user, businessId);
  }
  @Get(":serviceId") get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("serviceId", ResourceIdPipe) serviceId: string,
  ) {
    return this.catalog.getService(user, businessId, serviceId);
  }
  @Patch(":serviceId") update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("serviceId", ResourceIdPipe) serviceId: string,
    @Body() dto: UpdateCatalogServiceDto,
  ) {
    return this.catalog.updateService(user, businessId, serviceId, dto);
  }
  @Delete(":serviceId") @HttpCode(204) remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("serviceId", ResourceIdPipe) serviceId: string,
  ) {
    return this.catalog.deleteService(user, businessId, serviceId);
  }
}

@Controller("businesses/:businessId/members/:memberId/services")
export class StaffServicesController {
  constructor(private readonly catalog: CatalogService) {}
  @Post() assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("memberId", ResourceIdPipe) memberId: string,
    @Body() dto: AssignStaffServiceDto,
  ) {
    return this.catalog.assignService(user, businessId, memberId, dto);
  }
  @Get() list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("memberId", ResourceIdPipe) memberId: string,
  ) {
    return this.catalog.listStaffServices(user, businessId, memberId);
  }
  @Patch(":serviceId") update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("memberId", ResourceIdPipe) memberId: string,
    @Param("serviceId", ResourceIdPipe) serviceId: string,
    @Body() dto: UpdateStaffServiceDto,
  ) {
    return this.catalog.updateStaffService(
      user,
      businessId,
      memberId,
      serviceId,
      dto,
    );
  }
  @Delete(":serviceId") @HttpCode(204) remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("memberId", ResourceIdPipe) memberId: string,
    @Param("serviceId", ResourceIdPipe) serviceId: string,
  ) {
    return this.catalog.deleteStaffService(
      user,
      businessId,
      memberId,
      serviceId,
    );
  }
}
