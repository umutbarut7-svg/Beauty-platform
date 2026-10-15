/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from "@nestjs/common";
import { CurrentUser } from "../auth/auth.decorators.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import { ProfessionalIntelligenceService } from "./professional-intelligence.service.js";
import {
  CredentialDto,
  ExperienceDto,
  SkillDto,
} from "./professional-intelligence.dto.js";
@Controller("businesses/:businessId/professionals/:professionalId/intelligence")
export class ProfessionalIntelligenceController {
  constructor(private readonly service: ProfessionalIntelligenceService) {}
  @Get() get(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("professionalId", ResourceIdPipe) p: string,
  ) {
    return this.service.get(u, b, p);
  }
  @Get("skills") skills(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("professionalId", ResourceIdPipe) p: string,
  ) {
    return this.service.skills(u, b, p);
  }
  @Get("skills/:skillId/evidence") evidence(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("professionalId", ResourceIdPipe) p: string,
    @Param("skillId", ResourceIdPipe) s: string,
  ) {
    return this.service.evidence(u, b, p, s);
  }
  @Put("skills") declare(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("professionalId", ResourceIdPipe) p: string,
    @Body() d: SkillDto,
  ) {
    return this.service.declare(u, b, p, d.category, d.skillCode);
  }
  @Delete("skills/:category/:skillCode") deactivate(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("professionalId", ResourceIdPipe) p: string,
    @Param("category") c: string,
    @Param("skillCode") s: string,
  ) {
    return this.service.deactivate(u, b, p, c, s);
  }
  @Get("experience") experience(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("professionalId", ResourceIdPipe) p: string,
  ) {
    return this.service.experiences(u, b, p);
  }
  @Post("experience") addExperience(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("professionalId", ResourceIdPipe) p: string,
    @Body() d: ExperienceDto,
  ) {
    return this.service.addExperience(u, b, p, {
      ...d,
      startDate: new Date(d.startDate),
      endDate: d.endDate ? new Date(d.endDate) : undefined,
    });
  }
  @Get("credentials") credentials(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("professionalId", ResourceIdPipe) p: string,
  ) {
    return this.service.credentials(u, b, p);
  }
  @Post("credentials") addCredential(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("professionalId", ResourceIdPipe) p: string,
    @Body() d: CredentialDto,
  ) {
    return this.service.addCredential(u, b, p, {
      ...d,
      issuedAt: new Date(d.issuedAt),
      expiresAt: d.expiresAt ? new Date(d.expiresAt) : undefined,
    });
  }
  @Post("credentials/:credentialId/verify") verifyCredential(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("professionalId", ResourceIdPipe) p: string,
    @Param("credentialId", ResourceIdPipe) credentialId: string,
  ) {
    return this.service.verifyCredential(u, b, p, credentialId);
  }
  @Get("timeline") timeline(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("professionalId", ResourceIdPipe) p: string,
  ) {
    return this.service.timeline(u, b, p);
  }
  @Get("performance") performance(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("professionalId", ResourceIdPipe) p: string,
  ) {
    return this.service.performance(u, b, p);
  }
  @Get("specializations") specializations(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("professionalId", ResourceIdPipe) p: string,
  ) {
    return this.service.specializations(u, b, p);
  }
  @Get("history") history(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("professionalId", ResourceIdPipe) p: string,
  ) {
    return this.service.history(u, b, p);
  }
}
