import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import {
  CreateExperimentDto,
  ExperimentResultDto,
  MetricParamDto,
} from "./business-intelligence.dto.js";
describe("BI DTO", () => {
  it("rejects invalid taxonomy and windows", async () =>
    expect(
      await validate(
        plainToInstance(CreateExperimentDto, {
          hypothesis: "x",
          targetMetric: "VANITY",
          baselineWindow: "FOREVER",
          experimentWindow: "MONTHLY",
          expectedDirection: "UP",
          constraints: {},
        }),
      ),
    ).not.toHaveLength(0));
});
describe("BI boundary DTOs", () => {
  it("rejects free-text metrics and invalid experiment samples", async () => {
    expect(
      await validate(plainToInstance(MetricParamDto, { metric: "SCORE" })),
    ).not.toHaveLength(0);
    expect(
      await validate(plainToInstance(ExperimentResultDto, { sampleSize: -1 })),
    ).not.toHaveLength(0);
  });
});
