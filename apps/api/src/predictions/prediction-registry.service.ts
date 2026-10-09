import { BadRequestException, Injectable } from "@nestjs/common";
import {
  PREDICTION_TYPES,
  PROHIBITED_FEATURES,
  type PredictionType,
} from "./prediction.types.js";
@Injectable()
export class PredictionTypeRegistry {
  list() {
    return PREDICTION_TYPES;
  }
  assertAllowed(type: string): asserts type is PredictionType {
    if (!(PREDICTION_TYPES as readonly string[]).includes(type))
      throw new BadRequestException("Unsupported prediction type");
    if ((PROHIBITED_FEATURES as readonly string[]).includes(type))
      throw new BadRequestException("Prohibited sensitive inference");
  }
}
