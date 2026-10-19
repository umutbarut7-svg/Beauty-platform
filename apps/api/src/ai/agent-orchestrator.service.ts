/* eslint-disable @typescript-eslint/consistent-type-imports */
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import { AuditService } from "../infrastructure/audit.service.js";
import { MetricsService } from "../infrastructure/metrics.service.js";
import { AgentAuthorizationService } from "./agent-authorization.service.js";
import { AgentPlanner } from "./planner.service.js";
import { ContextBuilder } from "./context-builder.service.js";
import { ToolRegistry } from "./tool-registry.service.js";
import { AgentPolicyEngine } from "./policy-engine.service.js";
import { AgentUsageGuard } from "./usage-guard.service.js";
import { ToolExecutor } from "./tool-executor.service.js";
import { ConfirmationManager } from "./confirmation-manager.service.js";
import { AgentStateService } from "./agent-state.service.js";
import type {
  AgentIdentity,
  AgentPublicResponse,
  AgentStatus,
} from "./agent.types.js";
import type { AgentMessageDto, CreateAgentSessionDto } from "./agent.dto.js";
import { AISafetyEngine } from "./ai-safety.service.js";
import { AITraceService } from "./ai-trace.service.js";
import { AIEvaluationService } from "./ai-evaluation.service.js";
import { AIKillSwitchService } from "./ai-kill-switch.service.js";
import { AIRateLimitService } from "./ai-rate-limit.service.js";
import { redactAI } from "./ai-redaction.js";
@Injectable()
export class AgentOrchestrator {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly authorization: AgentAuthorizationService,
    private readonly planner: AgentPlanner,
    private readonly context: ContextBuilder,
    private readonly registry: ToolRegistry,
    private readonly policy: AgentPolicyEngine,
    private readonly usage: AgentUsageGuard,
    private readonly executor: ToolExecutor,
    private readonly confirmations: ConfirmationManager,
    private readonly states: AgentStateService,
    private readonly audit: AuditService,
    private readonly metrics: MetricsService,
    private readonly safety: AISafetyEngine,
    private readonly traces: AITraceService,
    private readonly evaluations: AIEvaluationService,
    private readonly killSwitch: AIKillSwitchService,
    private readonly aiRateLimit: AIRateLimitService,
  ) {}
  async create(identity: AgentIdentity, dto: CreateAgentSessionDto) {
    await this.authorization.assertSessionAccess(identity, dto.agentType);
    const session = await this.db.agentSession.create({
      data: {
        businessId: identity.businessId,
        userId: identity.user.id,
        agentType: dto.agentType,
        inputSource: dto.source,
        status: "ACTIVE",
      },
    });
    await this.event(identity, "session.started", session.id, "SUCCEEDED", {
      agentType: dto.agentType,
      source: dto.source,
    });
    if (dto.message)
      return this.message(identity, session.id, {
        source: dto.source,
        content: dto.message,
      });
    return this.public(session, "Session started");
  }
  async get(identity: AgentIdentity, sessionId: string) {
    return this.public(
      await this.authorization.assertOwnSession(identity, sessionId),
      "Session state",
    );
  }
  async message(
    identity: AgentIdentity,
    sessionId: string,
    message: AgentMessageDto,
  ): Promise<AgentPublicResponse> {
    const started = Date.now();
    const session = await this.authorization.assertOwnSession(
      identity,
      sessionId,
    );
    await this.authorization.assertSessionAccess(identity, session.agentType);
    const run = await this.traces.start({
      businessId: identity.businessId,
      sessionId,
      userId: identity.user.id,
      agentType: session.agentType,
    });
    try {
      await this.killSwitch.assertEnabled({
        businessId: identity.businessId,
        agentType: session.agentType,
        toolName: message.requestedTool,
      });
      await this.aiRateLimit.consume(identity, sessionId, session.agentType);
    } catch (error) {
      const rateLimited =
        error instanceof Error && error.message.includes("RATE_LIMIT");
      await this.traces.event(
        identity.businessId,
        run.id,
        rateLimited ? "AI_RATE_LIMIT_REACHED" : "AI_POLICY_BLOCKED",
        { category: rateLimited ? "RATE_LIMITED" : "AI_CAPABILITY_DISABLED" },
      );
      await this.finishRun(identity.businessId, run.id, started, {
        status: "BLOCKED",
        errorCategory: rateLimited ? "RATE_LIMITED" : "POLICY_BLOCKED",
      });
      throw error;
    }
    const inputSafety = this.safety.evaluate(message, {
      allowedTools: this.registry.list().map((tool) => tool.name),
      requestedTool: message.requestedTool,
      businessId: identity.businessId,
      argumentBusinessId:
        typeof message.arguments?.businessId === "string"
          ? message.arguments.businessId
          : undefined,
    });
    if (!inputSafety.allowed) {
      await this.traces.incident({
        businessId: identity.businessId,
        runId: run.id,
        category: inputSafety.categories[0] ?? "UNSAFE_ACTION",
        severity: inputSafety.severity,
        blocked: true,
        evidence: inputSafety.sanitized,
      });
      await this.traces.event(
        identity.businessId,
        run.id,
        "AI_SAFETY_TRIGGERED",
        { severity: inputSafety.severity, categories: inputSafety.categories },
      );
      await this.finishRun(identity.businessId, run.id, started, {
        status: "BLOCKED",
        errorCategory: "SAFETY_BLOCKED",
      });
      this.metrics.aiSafetyBlock();
      throw new BadRequestException("AI_SAFETY_BLOCKED");
    }
    if (
      ["COMPLETED", "FAILED", "CANCELLED", "NO_MATCH"].includes(session.status)
    )
      throw new BadRequestException("Agent session is terminal");
    await this.db.agentTurn.create({
      data: {
        sessionId,
        role: "USER",
        source: message.source,
        content: String(redactAI(message.content)).slice(0, 2000),
      },
    });
    await this.event(identity, "message.received", sessionId, "SUCCEEDED", {
      source: message.source,
      contentLength: message.content.length,
    });
    const plan = this.planner.plan(message);
    await this.traces.event(identity.businessId, run.id, "AI_PLAN_CREATED", {
      intent: plan.intent,
      toolName: plan.toolName,
      missingInformation: plan.missingInformation,
    });
    await this.event(identity, "intent.detected", sessionId, "SUCCEEDED", {
      intent: plan.intent,
    });
    await this.event(identity, "plan.created", sessionId, "SUCCEEDED", {
      intent: plan.intent,
      toolName: plan.toolName,
      missing: plan.missingInformation,
    });
    if (plan.intent === "UNKNOWN") {
      const updated = await this.states.transition(
        session,
        "NEEDS_INFORMATION",
        { intent: "UNKNOWN", activeGoal: null, missingInformation: ["intent"] },
      );
      this.metrics.agent(Date.now() - started);
      this.metrics.aiNeedsInformation();
      await this.traces.event(
        identity.businessId,
        run.id,
        "AI_NEEDS_INFORMATION",
        { reason: "UNKNOWN_INTENT" },
      );
      await this.finishRun(identity.businessId, run.id, started, {
        status: "NEEDS_INFORMATION",
        intent: "UNKNOWN",
        errorCategory: "NEEDS_INFORMATION",
      });
      return this.public(updated, "I need clarification", {
        field: "intent",
        reason: "The requested goal is unknown",
        priority: 100,
        questionKey: "agent.question.intent",
      });
    }
    if (!plan.toolName) {
      const updated = await this.states.transition(
        session,
        "NEEDS_INFORMATION",
        {
          intent: plan.intent,
          activeGoal: plan.goal,
          missingInformation: ["capability"],
        },
      );
      this.metrics.agent(Date.now() - started);
      this.metrics.aiNotAvailable();
      await this.traces.event(identity.businessId, run.id, "AI_NOT_AVAILABLE", {
        intent: plan.intent,
      });
      await this.finishRun(identity.businessId, run.id, started, {
        status: "NOT_AVAILABLE",
        intent: plan.intent,
        goal: plan.goal ?? undefined,
        errorCategory: "NOT_AVAILABLE",
      });
      return this.public(
        updated,
        "This capability is not available",
        null,
        null,
        "NOT_AVAILABLE",
      );
    }
    const tool = this.registry.get(plan.toolName);
    try {
      await this.killSwitch.assertEnabled({
        businessId: identity.businessId,
        agentType: session.agentType,
        toolName: tool.name,
      });
    } catch (error) {
      await this.traces.event(
        identity.businessId,
        run.id,
        "AI_POLICY_BLOCKED",
        { category: "AI_CAPABILITY_DISABLED", toolName: tool.name },
      );
      await this.finishRun(identity.businessId, run.id, started, {
        status: "BLOCKED",
        intent: plan.intent,
        goal: plan.goal ?? undefined,
        errorCategory: "POLICY_BLOCKED",
      });
      throw error;
    }
    this.registry.validate(tool, plan.arguments);
    const executions = await this.db.agentToolExecution.count({
      where: { sessionId },
    });
    const writes = await this.db.agentToolExecution.count({
      where: { sessionId, operationType: "WRITE" },
    });
    this.usage.assertBudget({ tokens: 0, estimatedCostMicros: 0, retries: 0 });
    const decision = this.policy.evaluate({
      tool,
      authenticated: true,
      sameTenant: session.businessId === identity.businessId,
      permissionGranted: this.authorization.toolAllowed(
        session.agentType,
        tool.name,
      ),
      confirmed: false,
      missing: plan.missingInformation,
      toolCalls: executions,
      writeActions: writes,
      limits: this.usage.limits,
    });
    if (decision.decision === "REQUIRE_INFORMATION") {
      const updated = await this.states.transition(
        session,
        "NEEDS_INFORMATION",
        {
          intent: plan.intent,
          activeGoal: plan.goal,
          missingInformation: plan.missingInformation,
        },
      );
      this.metrics.agent(Date.now() - started);
      this.metrics.aiNeedsInformation();
      await this.traces.event(
        identity.businessId,
        run.id,
        "AI_NEEDS_INFORMATION",
        { missing: plan.missingInformation },
      );
      await this.finishRun(identity.businessId, run.id, started, {
        status: "NEEDS_INFORMATION",
        intent: plan.intent,
        goal: plan.goal ?? undefined,
        errorCategory: "NEEDS_INFORMATION",
      });
      return this.public(
        updated,
        "More information is required",
        plan.question ?? null,
      );
    }
    if (decision.decision === "DENY") {
      this.metrics.agentLimitExceeded();
      this.metrics.aiPolicyBlock();
      await this.traces.event(
        identity.businessId,
        run.id,
        decision.code === "AGENT_LIMIT_EXCEEDED"
          ? "AI_BUDGET_LIMIT_REACHED"
          : "AI_POLICY_BLOCKED",
        { code: decision.code, toolName: tool.name },
      );
      await this.finishRun(identity.businessId, run.id, started, {
        status: "BLOCKED",
        intent: plan.intent,
        goal: plan.goal ?? undefined,
        errorCategory:
          decision.code === "AGENT_LIMIT_EXCEEDED"
            ? "BUDGET_EXCEEDED"
            : "POLICY_BLOCKED",
      });
      await this.event(identity, "tool.denied", sessionId, "DENIED", {
        toolName: tool.name,
        code: decision.code,
      });
      throw new BadRequestException(decision.code);
    }
    await this.event(identity, "tool.requested", sessionId, "SUCCEEDED", {
      toolName: tool.name,
      operationType: tool.operationType,
    });
    await this.traces.event(identity.businessId, run.id, "AI_TOOL_REQUESTED", {
      toolName: tool.name,
      operationType: tool.operationType,
    });
    if (decision.decision === "REQUIRE_CONFIRMATION") {
      const action = await this.confirmations.create({
        businessId: identity.businessId,
        sessionId,
        toolName: tool.name,
        arguments: plan.arguments,
        summary: `Confirm ${tool.name}`,
      });
      const updated = await this.states.transition(
        session,
        "NEEDS_CONFIRMATION",
        { intent: plan.intent, activeGoal: plan.goal, missingInformation: [] },
      );
      await this.event(
        identity,
        "confirmation.requested",
        sessionId,
        "SUCCEEDED",
        { toolName: tool.name, actionId: action.id },
      );
      this.metrics.agent(Date.now() - started);
      await this.traces.event(
        identity.businessId,
        run.id,
        "AI_CONFIRMATION_REQUIRED",
        { toolName: tool.name, actionId: action.id },
      );
      await this.finishRun(identity.businessId, run.id, started, {
        status: "COMPLETED",
        intent: plan.intent,
        goal: plan.goal ?? undefined,
      });
      return this.public(updated, "Confirmation required", null, {
        actionId: action.id,
        toolName: tool.name,
        summary: action.summary,
        expiresAt: action.expiresAt.toISOString(),
      });
    }
    await this.event(identity, "tool.allowed", sessionId, "SUCCEEDED", {
      toolName: tool.name,
    });
    await this.traces.event(identity.businessId, run.id, "AI_TOOL_AUTHORIZED", {
      toolName: tool.name,
    });
    this.context.build(
      session,
      session.turns ?? [],
      this.registry
        .list()
        .filter((t) => t.enabled)
        .map((t) => t.name),
      this.usage.limits.maxContextSize,
    );
    this.usage.assertElapsed(started);
    let result: unknown;
    try {
      result = await this.executor.execute(tool, plan.arguments, {
        ...identity,
        sessionId,
      });
      await this.event(identity, "tool.executed", sessionId, "SUCCEEDED", {
        toolName: tool.name,
      });
      const outputSafety = this.safety.evaluate(result);
      if (!outputSafety.allowed)
        throw new BadRequestException("AI_SAFETY_BLOCKED");
      result = outputSafety.sanitized;
      await this.traces.event(identity.businessId, run.id, "AI_TOOL_EXECUTED", {
        toolName: tool.name,
        result,
      });
    } catch (error) {
      const safetyBlocked =
        error instanceof Error && error.message.includes("AI_SAFETY_BLOCKED");
      await this.event(identity, "tool.failed", sessionId, "FAILED", {
        toolName: tool.name,
      });
      await this.states.transition(session, "FAILED");
      if (safetyBlocked) {
        await this.traces.incident({
          businessId: identity.businessId,
          runId: run.id,
          category: "SECRET_EXPOSURE",
          severity: "HIGH",
          blocked: true,
        });
        this.metrics.aiSafetyBlock();
      }
      await this.traces.event(
        identity.businessId,
        run.id,
        safetyBlocked ? "AI_SAFETY_TRIGGERED" : "AI_TOOL_FAILED",
        {
          toolName: tool.name,
          error: safetyBlocked ? "SAFETY_BLOCKED" : "TOOL_EXECUTION_FAILED",
        },
      );
      await this.finishRun(identity.businessId, run.id, started, {
        status: safetyBlocked ? "BLOCKED" : "FAILED",
        intent: plan.intent,
        goal: plan.goal ?? undefined,
        errorCategory: safetyBlocked
          ? "SAFETY_BLOCKED"
          : "TOOL_EXECUTION_FAILED",
      });
      throw error;
    }
    const noMatch = this.isNoMatch(result);
    const status: AgentStatus = noMatch ? "NO_MATCH" : "COMPLETED";
    const updated = await this.states.transition(session, status, {
      intent: plan.intent,
      activeGoal: plan.goal,
      candidateResults: noMatch ? [] : result,
    });
    await this.event(
      identity,
      noMatch ? "goal.failed" : "goal.completed",
      sessionId,
      "SUCCEEDED",
      { noMatch },
    );
    this.metrics.agent(Date.now() - started, noMatch);
    if (noMatch)
      await this.traces.event(identity.businessId, run.id, "AI_NO_MATCH", {
        toolName: tool.name,
      });
    await this.finishRun(identity.businessId, run.id, started, {
      status: noMatch ? "NO_MATCH" : "COMPLETED",
      intent: plan.intent,
      goal: plan.goal ?? undefined,
      errorCategory: noMatch ? "NO_MATCH" : undefined,
      toolCalls: 1,
    });
    return this.public(
      updated,
      noMatch ? "No matching result was found" : "Request completed",
      null,
      null,
      undefined,
      result,
    );
  }
  async confirm(identity: AgentIdentity, sessionId: string, actionId: string) {
    const started = Date.now();
    const session = await this.authorization.assertOwnSession(
      identity,
      sessionId,
    );
    await this.authorization.assertSessionAccess(identity, session.agentType);
    const run = await this.traces.start({
      businessId: identity.businessId,
      sessionId,
      userId: identity.user.id,
      agentType: session.agentType,
      goal: session.activeGoal ?? undefined,
    });
    await this.aiRateLimit.consume(identity, sessionId, session.agentType);
    const action = await this.confirmations.claim(
      identity.businessId,
      sessionId,
      actionId,
    );
    const tool = this.registry.get(action.toolName);
    await this.killSwitch.assertEnabled({
      businessId: identity.businessId,
      agentType: session.agentType,
      toolName: tool.name,
    });
    const args = action.arguments as Record<string, unknown>;
    this.registry.validate(tool, args);
    const decision = this.policy.evaluate({
      tool,
      authenticated: true,
      sameTenant: session.businessId === identity.businessId,
      permissionGranted: this.authorization.toolAllowed(
        session.agentType,
        tool.name,
      ),
      confirmed: true,
      missing: [],
      toolCalls: 0,
      writeActions: 0,
      limits: this.usage.limits,
    });
    if (decision.decision !== "ALLOW")
      throw new BadRequestException(decision.code);
    const executing = await this.states.transition(session, "EXECUTING");
    await this.event(
      identity,
      "confirmation.confirmed",
      sessionId,
      "SUCCEEDED",
      { actionId, toolName: tool.name },
    );
    this.metrics.agentConfirmation();
    await this.traces.event(
      identity.businessId,
      run.id,
      "AI_CONFIRMATION_ACCEPTED",
      { actionId, toolName: tool.name },
    );
    try {
      const result = await this.executor.execute(tool, args, {
        ...identity,
        sessionId,
        confirmedActionId: actionId,
      });
      await this.confirmations.executed(actionId, result);
      const updated = await this.states.transition(executing, "COMPLETED", {
        candidateResults: result,
      });
      await this.event(identity, "tool.executed", sessionId, "SUCCEEDED", {
        toolName: tool.name,
        actionId,
      });
      await this.event(identity, "goal.completed", sessionId, "SUCCEEDED", {});
      await this.traces.event(identity.businessId, run.id, "AI_TOOL_EXECUTED", {
        actionId,
        toolName: tool.name,
      });
      await this.finishRun(identity.businessId, run.id, started, {
        status: "COMPLETED",
        intent: session.intent,
        goal: session.activeGoal ?? undefined,
        toolCalls: 1,
      });
      return this.public(
        updated,
        "Confirmed action completed",
        null,
        null,
        undefined,
        result,
      );
    } catch (error) {
      await this.states.transition(executing, "FAILED");
      await this.event(identity, "tool.failed", sessionId, "FAILED", {
        toolName: tool.name,
        actionId,
      });
      await this.traces.event(identity.businessId, run.id, "AI_TOOL_FAILED", {
        actionId,
        toolName: tool.name,
        error: "TOOL_EXECUTION_FAILED",
      });
      await this.finishRun(identity.businessId, run.id, started, {
        status: "FAILED",
        intent: session.intent,
        goal: session.activeGoal ?? undefined,
        errorCategory: "TOOL_EXECUTION_FAILED",
        toolCalls: 1,
      });
      throw error;
    }
  }
  async reject(identity: AgentIdentity, sessionId: string, actionId: string) {
    const started = Date.now();
    const session = await this.authorization.assertOwnSession(
      identity,
      sessionId,
    );
    const run = await this.traces.start({
      businessId: identity.businessId,
      sessionId,
      userId: identity.user.id,
      agentType: session.agentType,
      goal: session.activeGoal ?? undefined,
    });
    await this.confirmations.reject(identity.businessId, sessionId, actionId);
    const updated = await this.states.transition(session, "CANCELLED");
    await this.event(
      identity,
      "confirmation.rejected",
      sessionId,
      "SUCCEEDED",
      { actionId },
    );
    await this.traces.event(
      identity.businessId,
      run.id,
      "AI_CONFIRMATION_REJECTED",
      { actionId },
    );
    await this.finishRun(identity.businessId, run.id, started, {
      status: "COMPLETED",
      intent: session.intent,
      goal: session.activeGoal ?? undefined,
    });
    return this.public(updated, "Action rejected");
  }
  private isNoMatch(result: unknown) {
    return Boolean(
      result &&
      typeof result === "object" &&
      "meta" in result &&
      (result as { meta?: { noMatch?: boolean } }).meta?.noMatch,
    );
  }
  private public(
    session: Record<string, unknown>,
    message: string,
    question: AgentPublicResponse["question"] = null,
    pendingAction: AgentPublicResponse["pendingAction"] = null,
    capability?: "AVAILABLE" | "NOT_AVAILABLE",
    result: unknown = null,
  ): AgentPublicResponse {
    return {
      sessionId: String(session.id),
      status: session.status as AgentStatus,
      message,
      intent: (session.intent ?? "UNKNOWN") as AgentPublicResponse["intent"],
      goal: (session.activeGoal as string | null) ?? null,
      question,
      options: [],
      pendingAction,
      result,
      meta: {
        noMatch: session.status === "NO_MATCH",
        ...(capability ? { capability } : {}),
      },
    };
  }
  private event(
    identity: AgentIdentity,
    action: string,
    resourceId: string,
    result: "SUCCEEDED" | "DENIED" | "FAILED",
    metadata: unknown,
  ) {
    return this.audit.record({
      businessId: identity.businessId,
      actorId: identity.user.id,
      actorType: identity.user.role,
      action: `agent.${action}`,
      resourceType: "AgentSession",
      resourceId,
      metadata,
      result,
    });
  }
  private async finishRun(
    businessId: string,
    runId: string,
    startedAt: number,
    input: {
      status:
        | "COMPLETED"
        | "FAILED"
        | "BLOCKED"
        | "NEEDS_INFORMATION"
        | "NO_MATCH"
        | "NOT_AVAILABLE";
      intent?: string;
      goal?: string;
      errorCategory?: import("./ai-safety.types.js").AIFailureCategory;
      toolCalls?: number;
    },
  ) {
    const run = await this.traces.finish({
      businessId,
      runId,
      startedAt,
      provider: "RULE_BASED",
      ...input,
    });
    await this.evaluations.evaluate({
      businessId,
      runId,
      status: input.status,
      intentKnown: input.intent !== "UNKNOWN",
      toolRequested: Boolean(input.toolCalls),
      toolSucceeded: input.status === "COMPLETED",
      policyAllowed: input.status !== "BLOCKED",
      authorized: input.errorCategory !== "AUTHORIZATION_ERROR",
      safetyBlocked: input.errorCategory === "SAFETY_BLOCKED",
      toolCalls: input.toolCalls ?? 0,
      latencyMs: run.latencyMs ?? 0,
      costMicros: run.estimatedCostMicros ?? 0,
      expiresAt: run.expiresAt,
    });
    this.metrics.aiRun(
      input.status === "COMPLETED"
        ? "SUCCEEDED"
        : input.status === "BLOCKED"
          ? "BLOCKED"
          : "FAILED",
    );
  }
}
