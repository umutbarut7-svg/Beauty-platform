import { Module } from "@nestjs/common";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import { ProfessionalIntelligenceController } from "./professional-intelligence.controller.js";
import { ProfessionalIntelligenceService } from "./professional-intelligence.service.js";
import { ProfessionalConfidenceService } from "./professional-confidence.service.js";
import { ProfessionalTaxonomyService } from "./professional-taxonomy.service.js";
@Module({
  controllers: [ProfessionalIntelligenceController],
  providers: [
    ProfessionalIntelligenceService,
    ProfessionalConfidenceService,
    ProfessionalTaxonomyService,
    ResourceIdPipe,
  ],
  exports: [ProfessionalIntelligenceService],
})
export class ProfessionalIntelligenceModule {}
