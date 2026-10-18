import { describe, expect, it } from "vitest";
import { ProfessionalConfidenceService } from "./professional-confidence.service.js";
describe("ProfessionalConfidenceService", () => {
  const s = new ProfessionalConfidenceService(),
    now = new Date("2026-01-01");
  it("returns insufficient evidence without facts", () =>
    expect(
      s.calculate(
        {
          weights: [],
          verifiedResults: 0,
          completedJobs: 0,
          repeatCustomers: 0,
        },
        now,
      ),
    ).toEqual({ sufficient: false, confidence: 0 }));
  it("requires deterministic job/result threshold", () => {
    expect(
      s.calculate(
        {
          weights: [1],
          latestAt: now,
          verifiedResults: 0,
          completedJobs: 1,
          repeatCustomers: 0,
        },
        now,
      ).sufficient,
    ).toBe(false);
    expect(
      s.calculate(
        {
          weights: [1, 1, 1],
          latestAt: now,
          verifiedResults: 2,
          completedJobs: 3,
          repeatCustomers: 1,
        },
        now,
      ).sufficient,
    ).toBe(true);
  });
  it("decays old evidence", () =>
    expect(
      s.calculate(
        {
          weights: [1, 1, 1],
          latestAt: new Date("2023-01-01"),
          verifiedResults: 2,
          completedJobs: 3,
          repeatCustomers: 0,
        },
        now,
      ).confidence,
    ).toBeLessThan(
      s.calculate(
        {
          weights: [1, 1, 1],
          latestAt: now,
          verifiedResults: 2,
          completedJobs: 3,
          repeatCustomers: 0,
        },
        now,
      ).confidence,
    ));
});
