/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "../auth/auth.decorators.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import {
  AutomationListQueryDto,
  CreateAutomationDto,
  ProcessEventDto,
  UpdateAutomationDto,
} from "./automation.dto.js";
import { AutomationsService } from "./automations.service.js";
@Controller("businesses/:businessId/automations")
export class AutomationsController {
  constructor(private readonly service: AutomationsService) {}
  @Get() list(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Query() q: AutomationListQueryDto,
  ) {
    return this.service.list(u, b, q);
  }
  @Post() create(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Body() d: CreateAutomationDto,
  ) {
    return this.service.create(u, b, d);
  }
  @Get(":id") get(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("id", ResourceIdPipe) id: string,
  ) {
    return this.service.get(u, b, id);
  }
  @Patch(":id") update(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("id", ResourceIdPipe) id: string,
    @Body() d: UpdateAutomationDto,
  ) {
    return this.service.update(u, b, id, d);
  }
  @Delete(":id") archive(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("id", ResourceIdPipe) id: string,
  ) {
    return this.service.archive(u, b, id);
  }
  @Post(":id/activate") activate(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("id", ResourceIdPipe) id: string,
  ) {
    return this.service.activate(u, b, id);
  }
  @Post(":id/pause") pause(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("id", ResourceIdPipe) id: string,
  ) {
    return this.service.pause(u, b, id);
  }
  @Get(":id/executions") executions(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("id", ResourceIdPipe) id: string,
    @Query() q: AutomationListQueryDto,
  ) {
    return this.service.executions(u, b, id, q);
  }
  @Post("events/process") process(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Body() d: ProcessEventDto,
  ) {
    return this.service.process(u, b, d);
  }
}
