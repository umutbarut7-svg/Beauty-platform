import { Injectable } from "@nestjs/common";
import type {
  ConfidenceResult,
  PredictionFeatures,
} from "./prediction.types.js";
@Injectable()
export class PredictionConfidenceService {
  calculate(
    f: PredictionFeatures,
    reliability = 1,
    freshness = 1,
    conflict = 0,
  ): ConfidenceResult {
    if (f.completedCount < 2)
      return { confidence: 0, band: "LOW", sufficient: false };
    const quantity = Math.min(1, f.completedCount / 6);
    const score = Math.max(
      0,
      Math.min(
        1,
        quantity * 0.35 +
          f.consistency * 0.3 +
          reliability * 0.2 +
          freshness * 0.15 -
          conflict * 0.3,
      ),
    );
    const confidence = Number(score.toFixed(4));
    return {
      confidence,
      band: confidence >= 0.75 ? "HIGH" : confidence >= 0.45 ? "MEDIUM" : "LOW",
      sufficient: confidence >= 0.35,
    };
  }
}
