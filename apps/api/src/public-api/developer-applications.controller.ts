/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Body, Controller, Param, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/auth.decorators.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import {
  CreateApiApplicationDto,
  RotateCredentialDto,
} from "./public-api.dto.js";
import { DeveloperApplicationsService } from "./developer-applications.service.js";
@Controller("businesses/:businessId/integrations")
export class DeveloperApplicationsController {
  constructor(private readonly service: DeveloperApplicationsService) {}
  @Post("applications") create(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Body() d: CreateApiApplicationDto,
  ) {
    return this.service.create(u, b, d.name, d.scopes);
  }
  @Post("clients/:clientId/credentials") issue(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("clientId", ResourceIdPipe) id: string,
    @Body() d: RotateCredentialDto,
  ) {
    return this.service.issue(
      u,
      b,
      id,
      d.expiresAt ? new Date(d.expiresAt) : undefined,
    );
  }
}
