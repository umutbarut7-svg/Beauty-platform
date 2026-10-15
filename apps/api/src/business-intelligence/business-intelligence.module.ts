import { Module } from "@nestjs/common";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import { BusinessIntelligenceController } from "./business-intelligence.controller.js";
import { BusinessIntelligenceService } from "./business-intelligence.service.js";
import { BusinessIntelligenceEngine } from "./business-intelligence.engine.js";
@Module({
  controllers: [BusinessIntelligenceController],
  providers: [
    BusinessIntelligenceService,
    BusinessIntelligenceEngine,
    ResourceIdPipe,
  ],
  exports: [BusinessIntelligenceService, BusinessIntelligenceEngine],
})
export class BusinessIntelligenceModule {}
