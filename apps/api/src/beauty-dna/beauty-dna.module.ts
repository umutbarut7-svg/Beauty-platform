import { Module } from "@nestjs/common";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import { BeautyDNAController } from "./beauty-dna.controller.js";
import { BeautyDNAService } from "./beauty-dna.service.js";
import { BeautyDNAIntelligenceService } from "./beauty-dna-intelligence.service.js";
import { BeautyDNARegistry } from "./beauty-dna-registry.service.js";
@Module({
  controllers: [BeautyDNAController],
  providers: [
    BeautyDNAService,
    BeautyDNAIntelligenceService,
    BeautyDNARegistry,
    ResourceIdPipe,
  ],
  exports: [BeautyDNAService, BeautyDNARegistry],
})
export class BeautyDNAModule {}
