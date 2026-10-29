/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { MultipartFile } from "@fastify/multipart";
import { CurrentUser } from "../auth/auth.decorators.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import { VisualService } from "./visual.service.js";
import { SemanticService } from "./semantic.service.js";
import { VerificationService } from "./verification.service.js";
import {
  IndexCatalogDto,
  PhotoConsentDto,
  SemanticQueryDto,
  VerificationDecisionDto,
  VerificationSubmitDto,
  VisualAnswersDto,
  VisualSessionDto,
} from "./visual.dto.js";
import { MAX_PHOTO_BYTES } from "./providers/private-photo-store.js";
@Controller("mvp/v1")
export class VisualController {
  constructor(
    private readonly visual: VisualService,
    private readonly semantic: SemanticService,
    private readonly verification: VerificationService,
  ) {}
  @Get("photos/policy") policy() {
    return this.visual.capability();
  }
  @Post("photos/consents") consent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PhotoConsentDto,
  ) {
    return this.visual.consent(user, dto);
  }
  @Get("photos/consents") consents(@CurrentUser() user: AuthenticatedUser) {
    return this.visual.consents(user);
  }
  @Post("photos/consents/:consentId/withdraw") withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Param("consentId", ResourceIdPipe) id: string,
  ) {
    return this.visual.withdraw(user, id);
  }
  @Post("photos/upload/:consentId") async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param("consentId", ResourceIdPipe) id: string,
    @Req() req: { file(options: unknown): Promise<MultipartFile | undefined> },
  ) {
    if (!this.visual.capability().available)
      throw new ServiceUnavailableException("VISUAL_WORKFLOW_UNAVAILABLE");
    let file: MultipartFile | undefined;
    let bytes: Buffer;
    try {
      file = await req.file({
        limits: { files: 1, fields: 0, parts: 1, fileSize: MAX_PHOTO_BYTES },
      });
      if (
        !file ||
        file.fieldname !== "photo" ||
        !["image/jpeg", "image/png"].includes(file.mimetype)
      )
        throw new Error("InvalidPhotoUpload");
      bytes = await file.toBuffer();
      if (file.file.truncated) throw new Error("PhotoSizeLimit");
    } catch {
      throw new BadRequestException("PHOTO_UPLOAD_INVALID");
    }
    return this.visual.upload(user, id, bytes, file.mimetype);
  }
  @Post("visual/sessions") create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VisualSessionDto,
  ) {
    return this.visual.create(user, dto);
  }
  @Get("visual/sessions")
  @Header("Cache-Control", "no-store")
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.visual.list(user);
  }
  @Get("visual/sessions/:sessionId") get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("sessionId", ResourceIdPipe) id: string,
  ) {
    return this.visual.get(user, id);
  }
  @Post("visual/sessions/:sessionId/analyze") analyze(
    @CurrentUser() user: AuthenticatedUser,
    @Param("sessionId", ResourceIdPipe) id: string,
    @Body() dto: VisualAnswersDto,
  ) {
    return this.visual.analyze(user, id, dto.answers, dto.expectedAttempt);
  }
  @Post("visual/sessions/:sessionId/matches") async matches(
    @CurrentUser() user: AuthenticatedUser,
    @Param("sessionId", ResourceIdPipe) id: string,
  ) {
    const session = await this.visual.get(user, id);
    if (session.status !== "PLAN")
      throw new BadRequestException("VISUAL_PLAN_REQUIRED");
    return this.semantic.search(user, session.output.searchQuery);
  }
  @Post("businesses/:businessId/services/:serviceId/semantic-index") index(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("serviceId", ResourceIdPipe) s: string,
    @Body() dto: IndexCatalogDto,
  ) {
    return this.semantic.enqueue(user, b, s, dto.idempotencyKey);
  }
  @Post("businesses/:businessId/ai-match") businessMatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Body() dto: SemanticQueryDto,
  ) {
    return this.semantic.businessSearch(user, b, dto.query);
  }
  @Get("verification/policy") verificationPolicy() {
    return this.verification.policy();
  }
  @Get("businesses/:businessId/verification") verificationRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
  ) {
    return this.verification.list(user, b);
  }
  @Post("businesses/:businessId/verification") submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Body() dto: VerificationSubmitDto,
  ) {
    return this.verification.submit(user, b, dto.policyVersion, dto.answers);
  }
  @Post("businesses/:businessId/verification/:requestId/review") review(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("requestId", ResourceIdPipe) id: string,
    @Body() dto: VerificationDecisionDto,
  ) {
    return this.verification.decide(user, b, id, dto.decision, dto.note);
  }
  @Post("businesses/:businessId/verification/:requestId/cancel") cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("requestId", ResourceIdPipe) id: string,
  ) {
    return this.verification.cancel(user, b, id);
  }
}
