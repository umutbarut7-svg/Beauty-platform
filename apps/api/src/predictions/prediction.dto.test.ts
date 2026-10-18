import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { PredictionListDto, RefreshPredictionDto } from "./prediction.dto.js";
describe("prediction DTO", () => {
  it("caps pagination", async () =>
    expect(
      await validate(plainToInstance(PredictionListDto, { limit: 51 })),
    ).not.toHaveLength(0));
  it("rejects unregistered prediction types", async () =>
    expect(
      await validate(
        plainToInstance(RefreshPredictionDto, { type: "MEDICAL_DIAGNOSIS" }),
      ),
    ).not.toHaveLength(0));
});
