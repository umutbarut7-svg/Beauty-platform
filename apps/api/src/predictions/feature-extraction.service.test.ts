import { describe, expect, it } from "vitest";
import { FeatureExtractionService } from "./feature-extraction.service.js";
import { PredictionConfidenceService } from "./confidence.service.js";
const day = 86_400_000,
  now = new Date("2026-06-01T12:00:00Z");
describe("prediction features and confidence", () => {
  it("extracts deterministic recurrence, affinity, time, price and cancellation features", () => {
    const f = new FeatureExtractionService().extract(
      [
        {
          id: "1",
          status: "COMPLETED",
          serviceId: "cut",
          staffId: "s",
          startsAt: new Date(now.getTime() - 84 * day),
          price: 100,
        },
        {
          id: "2",
          status: "COMPLETED",
          serviceId: "cut",
          staffId: "s",
          startsAt: new Date(now.getTime() - 42 * day),
          price: 120,
        },
        {
          id: "3",
          status: "COMPLETED",
          serviceId: "cut",
          staffId: "s",
          startsAt: new Date(now.getTime() - 1 * day),
          price: 110,
        },
        {
          id: "4",
          status: "CANCELLED",
          serviceId: "color",
          staffId: null,
          startsAt: new Date(now.getTime() - 10 * day),
          price: 200,
        },
      ],
      now,
    );
    expect(f.averageRebookingIntervalDays).toBe(41.5);
    expect(f.serviceAffinity).toEqual({ id: "cut", ratio: 1 });
    expect(f.averagePrice).toBe(110);
    expect(f.cancellationRate).toBe(0.25);
  });
  it("returns insufficient evidence instead of inventing a prediction", () => {
    const f = new FeatureExtractionService().extract([], now);
    expect(new PredictionConfidenceService().calculate(f).sufficient).toBe(
      false,
    );
  });
  it("reduces confidence for conflicting/cancellation evidence", () => {
    const f = new FeatureExtractionService().extract(
      [
        {
          id: "1",
          status: "COMPLETED",
          serviceId: "a",
          staffId: null,
          startsAt: new Date(now.getTime() - 50 * day),
          price: 1,
        },
        {
          id: "2",
          status: "COMPLETED",
          serviceId: "a",
          staffId: null,
          startsAt: new Date(now.getTime() - 10 * day),
          price: 1,
        },
      ],
      now,
    );
    const service = new PredictionConfidenceService();
    expect(service.calculate(f, 1, 1, 0.8).confidence).toBeLessThan(
      service.calculate(f, 1, 1, 0).confidence,
    );
  });
});
