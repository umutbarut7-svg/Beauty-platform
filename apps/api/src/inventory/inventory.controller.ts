/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "../auth/auth.decorators.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import { InventoryService } from "./inventory.service.js";
import {
  ImportProductsDto,
  ProductPageDto,
  StockMovementDto,
  UpdateProductDto,
} from "./inventory.dto.js";
@Controller("businesses/:businessId/products")
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}
  @Get() list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Query() page: ProductPageDto,
  ) {
    return this.inventory.list(user, businessId, page.after);
  }
  @Post("import") importProducts(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Body() dto: ImportProductsDto,
  ) {
    return this.inventory.importProducts(user, businessId, dto);
  }
  @Patch(":productId") update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("productId", ResourceIdPipe) productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.inventory.update(user, businessId, productId, dto);
  }
  @Post(":productId/movements") move(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("productId", ResourceIdPipe) productId: string,
    @Body() dto: StockMovementDto,
  ) {
    return this.inventory.move(user, businessId, productId, dto);
  }
  @Get(":productId/movements") history(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("productId", ResourceIdPipe) productId: string,
  ) {
    return this.inventory.history(user, businessId, productId);
  }
}
@Controller("mvp/v1/catalog/:businessId/products")
export class PublicProductsController {
  constructor(private readonly inventory: InventoryService) {}
  @Get() list(
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Query() page: ProductPageDto,
  ) {
    return this.inventory.publicCatalog(businessId, page.after);
  }
}
