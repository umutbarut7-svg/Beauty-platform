import { Module } from "@nestjs/common";
import { AppointmentsModule } from "../appointments/appointments.module.js";
import { DiscoveryModule } from "../discovery/discovery.module.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import { AgentController } from "./agent.controller.js";
import { AgentOrchestrator } from "./agent-orchestrator.service.js";
import { AgentAuthorizationService } from "./agent-authorization.service.js";
import { AgentPlanner } from "./planner.service.js";
import {
  ContextBuilder,
  UnavailableCustomerMemory,
} from "./context-builder.service.js";
import {
  DeterministicModelProvider,
  ModelRouter,
} from "./model-router.service.js";
import { ToolRegistry } from "./tool-registry.service.js";
import { AgentPolicyEngine } from "./policy-engine.service.js";
import { AgentUsageGuard } from "./usage-guard.service.js";
import { ToolExecutor } from "./tool-executor.service.js";
import { ConfirmationManager } from "./confirmation-manager.service.js";
import { AgentStateService } from "./agent-state.service.js";
import { AgentCapabilities } from "./capabilities.service.js";
import {
  BusinessGrowthAgent,
  CustomerBeautyAgent,
  ProfessionalCopilot,
} from "./agent-profiles.js";
import { AISafetyEngine } from "./ai-safety.service.js";
import { AITraceService } from "./ai-trace.service.js";
import { AIEvaluationService } from "./ai-evaluation.service.js";
import { AIKillSwitchService } from "./ai-kill-switch.service.js";
import { AIRateLimitService } from "./ai-rate-limit.service.js";
import { AIObservabilityQueryService } from "./ai-observability-query.service.js";
import { BeautyDNAModule } from "../beauty-dna/beauty-dna.module.js";
import { ProfessionalIntelligenceModule } from "../professional-intelligence/professional-intelligence.module.js";
import { BusinessIntelligenceModule } from "../business-intelligence/business-intelligence.module.js";
import { PredictionsModule } from "../predictions/predictions.module.js";
import { MarketplaceLiquidityModule } from "../marketplace-liquidity/marketplace-liquidity.module.js";
@Module({
  imports: [
    AppointmentsModule,
    DiscoveryModule,
    PredictionsModule,
    BeautyDNAModule,
    ProfessionalIntelligenceModule,
    BusinessIntelligenceModule,
    MarketplaceLiquidityModule,
  ],
  controllers: [AgentController],
  providers: [
    AgentOrchestrator,
    AgentAuthorizationService,
    AgentPlanner,
    ContextBuilder,
    UnavailableCustomerMemory,
    DeterministicModelProvider,
    ModelRouter,
    ToolRegistry,
    AgentPolicyEngine,
    AgentUsageGuard,
    ToolExecutor,
    ConfirmationManager,
    AgentStateService,
    AgentCapabilities,
    CustomerBeautyAgent,
    BusinessGrowthAgent,
    ProfessionalCopilot,
    ResourceIdPipe,
    AISafetyEngine,
    AITraceService,
    AIEvaluationService,
    AIKillSwitchService,
    AIRateLimitService,
    AIObservabilityQueryService,
  ],
  exports: [
    AgentOrchestrator,
    ToolRegistry,
    ModelRouter,
    AgentCapabilities,
    AIObservabilityQueryService,
  ],
})
export class AiModule {}
