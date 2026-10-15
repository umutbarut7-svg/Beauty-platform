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
  Put,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "../auth/auth.decorators.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import {
  AddMemberDto,
  CreateBranchDto,
  UpdateBranchDto,
  UpdateMemberDto,
  UpdateSettingsDto,
  UpdateWorkingHoursDto,
} from "./salon-core.dto.js";
import { SalonCoreService } from "./salon-core.service.js";

@Controller("businesses/:businessId/members")
export class MembersController {
  constructor(private readonly core: SalonCoreService) {}
  @Get() list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
  ) {
    return this.core.listMembers(user, businessId);
  }
  @Get("me") me(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
  ) {
    return this.core.myMembership(user, businessId);
  }
  @Post() add(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.core.addMember(user, businessId, dto);
  }
  @Patch(":memberId") update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
    @Param("memberId") memberId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.core.updateMember(user, businessId, memberId, dto);
  }
  @Delete(":memberId") @HttpCode(204) remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
    @Param("memberId") memberId: string,
  ) {
    return this.core.removeMember(user, businessId, memberId);
  }
}

@Controller("businesses/:businessId/branches")
export class BranchesController {
  constructor(private readonly core: SalonCoreService) {}
  @Get() list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
  ) {
    return this.core.listBranches(user, businessId);
  }
  @Post() create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
    @Body() dto: CreateBranchDto,
  ) {
    return this.core.createBranch(user, businessId, dto);
  }
  @Get(":branchId") get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
    @Param("branchId") branchId: string,
  ) {
    return this.core.getBranch(user, businessId, branchId);
  }
  @Patch(":branchId") update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
    @Param("branchId") branchId: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.core.updateBranch(user, businessId, branchId, dto);
  }
}

@Controller("businesses/:businessId/settings")
export class SettingsController {
  constructor(private readonly core: SalonCoreService) {}
  @Get() get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
  ) {
    return this.core.getSettings(user, businessId);
  }
  @Patch() update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.core.updateSettings(user, businessId, dto);
  }
}

@Controller("businesses/:businessId/working-hours")
export class WorkingHoursController {
  constructor(private readonly core: SalonCoreService) {}
  @Get() get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
    @Query("branchId") branchId?: string,
  ) {
    return this.core.getWorkingHours(user, businessId, branchId);
  }
  @Put() update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId") businessId: string,
    @Body() dto: UpdateWorkingHoursDto,
  ) {
    return this.core.updateWorkingHours(user, businessId, dto);
  }
}
