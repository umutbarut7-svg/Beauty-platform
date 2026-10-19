/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Body, Controller, Param, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/auth.decorators.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import {
  ConsentDto,
  CreateDisputeDto,
  CreatePolicyDto,
  DisputeTransitionDto,
  EnforcementDto,
  EnforcementTransitionDto,
  EvaluatePolicyDto,
  OverrideDto,
  PolicyTransitionDto,
  PrivacyRequestDto,
  PrivacyTransitionDto,
} from "./governance.dto.js";
import { GovernanceService } from "./governance.service.js";
import type {
  DisputeState,
  EnforcementState,
  GovernanceDecision,
  PolicyStatus,
  PrivacyRequestState,
} from "./governance.types.js";
@Controller("businesses/:businessId/governance")
export class GovernanceController {
  constructor(private readonly service: GovernanceService) {}
  @Post("policies") createPolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Body() dto: CreatePolicyDto,
  ) {
    return this.service.createPolicy(user, businessId, {
      ...dto,
      effectiveFrom: dto.effectiveFrom
        ? new Date(dto.effectiveFrom)
        : undefined,
      effectiveUntil: dto.effectiveUntil
        ? new Date(dto.effectiveUntil)
        : undefined,
    });
  }
  @Post("policy-versions/:versionId/transition") transitionPolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("versionId", ResourceIdPipe) versionId: string,
    @Body() dto: PolicyTransitionDto,
  ) {
    return this.service.transitionPolicy(
      user,
      businessId,
      versionId,
      dto.status as PolicyStatus,
      dto.reason,
      dto.idempotencyKey,
    );
  }
  @Post("evaluate") evaluate(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Body() dto: EvaluatePolicyDto,
  ) {
    return this.service.evaluate(
      user,
      businessId,
      dto.scope,
      dto.context,
      dto.highRisk ?? false,
      dto.idempotencyKey,
      dto.ai,
    );
  }
  @Post("evaluations/:evaluationId/override") override(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("evaluationId", ResourceIdPipe) evaluationId: string,
    @Body() dto: OverrideDto,
  ) {
    return this.service.override(
      user,
      businessId,
      evaluationId,
      dto.decision as GovernanceDecision,
      dto.reason,
      dto.idempotencyKey,
    );
  }
  @Post("disputes") dispute(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Body() dto: CreateDisputeDto,
  ) {
    return this.service.createDispute(user, businessId, dto);
  }
  @Post("disputes/:disputeId/transition") disputeTransition(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("disputeId", ResourceIdPipe) disputeId: string,
    @Body() dto: DisputeTransitionDto,
  ) {
    return this.service.transitionDispute(
      user,
      businessId,
      disputeId,
      dto.state as DisputeState,
      dto.reason,
      dto.idempotencyKey,
      dto.metadata,
    );
  }
  @Post("consents") consent(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Body() dto: ConsentDto,
  ) {
    return this.service.recordConsent(user, businessId, dto);
  }
  @Post("privacy-requests") privacy(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Body() dto: PrivacyRequestDto,
  ) {
    return this.service.createPrivacyRequest(
      user,
      businessId,
      dto.subjectId,
      dto.type,
      dto.idempotencyKey,
    );
  }
  @Post("privacy-requests/:requestId/transition") privacyTransition(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("requestId", ResourceIdPipe) requestId: string,
    @Body() dto: PrivacyTransitionDto,
  ) {
    return this.service.transitionPrivacy(
      user,
      businessId,
      requestId,
      dto.state as PrivacyRequestState,
      dto.reason,
      dto.idempotencyKey,
    );
  }
  @Post("enforcement-actions") enforcement(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Body() dto: EnforcementDto,
  ) {
    return this.service.createEnforcement(user, businessId, dto);
  }
  @Post("enforcement-actions/:actionId/transition") enforcementTransition(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("actionId", ResourceIdPipe) actionId: string,
    @Body() dto: EnforcementTransitionDto,
  ) {
    return this.service.transitionEnforcement(
      user,
      businessId,
      actionId,
      dto.state as EnforcementState,
      dto.reason,
      dto.idempotencyKey,
    );
  }
}
