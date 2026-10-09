/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentUser } from "../auth/auth.decorators.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import {
  AgentActionDto,
  AgentMessageDto,
  CreateAgentSessionDto,
} from "./agent.dto.js";
import { AgentOrchestrator } from "./agent-orchestrator.service.js";
@Controller("businesses/:businessId/ai/sessions")
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class AgentController {
  constructor(private readonly agent: AgentOrchestrator) {}
  @Post() create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Body() dto: CreateAgentSessionDto,
  ) {
    return this.agent.create({ user, businessId }, dto);
  }
  @Get(":sessionId") get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("sessionId", ResourceIdPipe) sessionId: string,
  ) {
    return this.agent.get({ user, businessId }, sessionId);
  }
  @Post(":sessionId/messages") message(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("sessionId", ResourceIdPipe) sessionId: string,
    @Body() dto: AgentMessageDto,
  ) {
    return this.agent.message({ user, businessId }, sessionId, dto);
  }
  @Post(":sessionId/confirm") confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("sessionId", ResourceIdPipe) sessionId: string,
    @Body() dto: AgentActionDto,
  ) {
    return this.agent.confirm({ user, businessId }, sessionId, dto.actionId);
  }
  @Post(":sessionId/reject") reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("sessionId", ResourceIdPipe) sessionId: string,
    @Body() dto: AgentActionDto,
  ) {
    return this.agent.reject({ user, businessId }, sessionId, dto.actionId);
  }
}
