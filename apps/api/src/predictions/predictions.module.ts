import { Module } from "@nestjs/common";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import {
  PredictionsController,
  PredictionInsightsController,
} from "./predictions.controller.js";
import { PredictionsService } from "./predictions.service.js";
import { FeatureExtractionService } from "./feature-extraction.service.js";
import { PredictionConfidenceService } from "./confidence.service.js";
import { PredictionTypeRegistry } from "./prediction-registry.service.js";
@Module({
  controllers: [PredictionsController, PredictionInsightsController],
  providers: [
    PredictionsService,
    FeatureExtractionService,
    PredictionConfidenceService,
    PredictionTypeRegistry,
    ResourceIdPipe,
  ],
  exports: [PredictionsService, PredictionTypeRegistry],
})
export class PredictionsModule {}
