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
/* eslint-disable @typescript-eslint/consistent-type-imports */
import { CreateBusinessDto, UpdateBusinessDto } from "./business.dto.js";
import { BusinessesService } from "./businesses.service.js";
import { CreateLocationDto, UpdateLocationDto } from "./location.dto.js";
import { CreateStaffDto, UpdateStaffDto } from "./staff.dto.js";
import { CreateServiceDto, UpdateServiceDto } from "./service.dto.js";

@Controller("businesses")
export class BusinessesController {
  constructor(private readonly businesses: BusinessesService) {}
  @Post() create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBusinessDto,
  ) {
    return this.businesses.createBusiness(user, dto);
  }
  @Get() list(@CurrentUser() user: AuthenticatedUser) {
    return this.businesses.listBusinesses(user);
  }
  @Get(":businessId") get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") id: string,
  ) {
    return this.businesses.getBusiness(user, id);
  }
  @Patch(":businessId") update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") id: string,
    @Body() dto: UpdateBusinessDto,
  ) {
    return this.businesses.updateBusiness(user, id, dto);
  }
}

@Controller("businesses/:businessId/locations")
export class LocationsController {
  constructor(private readonly businesses: BusinessesService) {}
  @Post() create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
    @Body() dto: CreateLocationDto,
  ) {
    return this.businesses.createLocation(user, businessId, dto);
  }
  @Get() list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
  ) {
    return this.businesses.listLocations(user, businessId);
  }
  @Get(":locationId") get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
    @Param("locationId") id: string,
  ) {
    return this.businesses.getLocation(user, businessId, id);
  }
  @Patch(":locationId") update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
    @Param("locationId") id: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.businesses.updateLocation(user, businessId, id, dto);
  }
  @Delete(":locationId") @HttpCode(204) remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
    @Param("locationId") id: string,
  ) {
    return this.businesses.deleteLocation(user, businessId, id);
  }
}

@Controller("businesses/:businessId/staff")
export class StaffController {
  constructor(private readonly businesses: BusinessesService) {}
  @Post() create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
    @Body() dto: CreateStaffDto,
  ) {
    return this.businesses.createStaff(user, businessId, dto);
  }
  @Get() list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
  ) {
    return this.businesses.listStaff(user, businessId);
  }
  @Get(":staffId") get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
    @Param("staffId") id: string,
  ) {
    return this.businesses.getStaff(user, businessId, id);
  }
  @Patch(":staffId") update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
    @Param("staffId") id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.businesses.updateStaff(user, businessId, id, dto);
  }
  @Delete(":staffId") @HttpCode(204) remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
    @Param("staffId") id: string,
  ) {
    return this.businesses.deleteStaff(user, businessId, id);
  }
  @Post(":staffId/services/:serviceId") addService(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
    @Param("staffId") staffId: string,
    @Param("serviceId") serviceId: string,
  ) {
    return this.businesses.addStaffService(
      user,
      businessId,
      staffId,
      serviceId,
    );
  }
  @Delete(":staffId/services/:serviceId") @HttpCode(204) removeService(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
    @Param("staffId") staffId: string,
    @Param("serviceId") serviceId: string,
  ) {
    return this.businesses.removeStaffService(
      user,
      businessId,
      staffId,
      serviceId,
    );
  }
}

@Controller("businesses/:businessId/services")
export class ServicesController {
  constructor(private readonly businesses: BusinessesService) {}
  @Post() create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
    @Body() dto: CreateServiceDto,
  ) {
    return this.businesses.createService(user, businessId, dto);
  }
  @Get() list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
  ) {
    return this.businesses.listServices(user, businessId);
  }
  @Get(":serviceId") get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
    @Param("serviceId") id: string,
  ) {
    return this.businesses.getService(user, businessId, id);
  }
  @Patch(":serviceId") update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
    @Param("serviceId") id: string,
    @Body() dto: UpdateServiceDto,
  ) {
    return this.businesses.updateService(user, businessId, id, dto);
  }
  @Delete(":serviceId") @HttpCode(204) remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
    @Param("serviceId") id: string,
  ) {
    return this.businesses.deleteService(user, businessId, id);
  }
}
