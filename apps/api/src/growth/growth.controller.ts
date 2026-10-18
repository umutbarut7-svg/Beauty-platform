/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { CurrentUser, Public } from "../auth/auth.decorators.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import {
  AttributionDto,
  ChallengeProgressDto,
  CreateReferralDto,
  CreateReferralProgramDto,
  ExperimentAssignmentDto,
  GenerateReferralCodeDto,
  GrantRewardDto,
  ReverseRewardDto,
  TransitionReferralDto,
} from "./growth.dto.js";
import { GrowthService } from "./growth.service.js";
import type { ReferralState } from "./growth.types.js";

@Controller()
export class GrowthController {
  constructor(private readonly service: GrowthService) {}
  @Public()
  @Get("growth/referrals/resolve/:code")
  resolve(
    @Param("code") code: string,
    @Headers("x-forwarded-for") forwarded?: string,
  ) {
    return this.service.resolveCode(
      code,
      forwarded?.split(",")[0]?.trim() || "anonymous",
    );
  }
  @Get("businesses/:businessId/growth/programs")
  programs(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
  ) {
    return this.service.programs(user, businessId);
  }
  @Post("businesses/:businessId/growth/programs")
  createProgram(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Body() dto: CreateReferralProgramDto,
  ) {
    return this.service.createProgram(user, businessId, {
      ...dto,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
    });
  }
  @Post("businesses/:businessId/growth/codes")
  code(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Body() dto: GenerateReferralCodeDto,
  ) {
    return this.service.generateCode(user, businessId, {
      ...dto,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    });
  }
  @Post("businesses/:businessId/growth/referrals")
  referral(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Body() dto: CreateReferralDto,
  ) {
    return this.service.createReferral(user, businessId, dto);
  }
  @Post("businesses/:businessId/growth/referrals/:referralId/transition")
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("referralId", ResourceIdPipe) referralId: string,
    @Body() dto: TransitionReferralDto,
  ) {
    return this.service.transition(
      user,
      businessId,
      referralId,
      dto.state as ReferralState,
      dto.reason,
      dto.idempotencyKey,
    );
  }
  @Post("businesses/:businessId/growth/referrals/:referralId/rewards")
  reward(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("referralId", ResourceIdPipe) referralId: string,
    @Body() dto: GrantRewardDto,
  ) {
    return this.service.grantReward(user, businessId, referralId, {
      ...dto,
      amountMinor: BigInt(dto.amountMinor),
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    });
  }
  @Post("businesses/:businessId/growth/rewards/:rewardId/reverse")
  reverseReward(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("rewardId", ResourceIdPipe) rewardId: string,
    @Body() dto: ReverseRewardDto,
  ) {
    return this.service.reverseReward(
      user,
      businessId,
      rewardId,
      dto.reason,
      dto.idempotencyKey,
    );
  }
  @Post("businesses/:businessId/growth/experiments/:experimentId/assignment")
  assignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("experimentId", ResourceIdPipe) experimentId: string,
    @Body() dto: ExperimentAssignmentDto,
  ) {
    return this.service.assignExperiment(
      user,
      businessId,
      experimentId,
      dto.subjectId,
    );
  }
  @Post("businesses/:businessId/growth/attribution")
  attribution(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Body() dto: AttributionDto,
  ) {
    return this.service.recordAttribution(user, businessId, dto);
  }
  @Post("businesses/:businessId/growth/challenges/:challengeId/progress")
  challenge(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("challengeId", ResourceIdPipe) challengeId: string,
    @Body() dto: ChallengeProgressDto,
  ) {
    return this.service.progressChallenge(
      user,
      businessId,
      challengeId,
      dto.subjectId,
      dto.eventId,
      dto.increment,
    );
  }
}
