/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Body, Controller, Get, Param, Put, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/auth.decorators.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import {
  ConfigureTenantGlobalizationDto,
  GlobalizationContextQueryDto,
} from "./globalization.dto.js";
import { GlobalizationService } from "./globalization.service.js";
@Controller("businesses/:businessId/globalization")
export class GlobalizationController {
  constructor(private readonly globalization: GlobalizationService) {}
  @Get("context") context(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Query() query: GlobalizationContextQueryDto,
  ) {
    return this.globalization.authorizedContext(user, businessId, query);
  }
  @Put() configure(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Body() dto: ConfigureTenantGlobalizationDto,
  ) {
    return this.globalization.configureTenant(user, businessId, dto);
  }
}
