import { describe, expect, it } from "vitest";
import { BusinessIntelligenceEngine } from "./business-intelligence.engine.js";
describe("BusinessIntelligenceEngine", () => {
  const e = new BusinessIntelligenceEngine();
  it("calculates deterministic confidence and distinguishes missing from zero", () => {
    expect(e.confidence(10, 1, 1, 1, 1)).toBe(e.confidence(10, 1, 1, 1, 1));
    expect(e.compare(null, 0).state).toBe("INSUFFICIENT_DATA");
    expect(e.compare(0, 0)).toEqual({ state: "AVAILABLE", change: 0 });
  });
  it("compares periods", () => expect(e.compare(120, 100).change).toBe(0.2));
  it("detects evidence-linked opportunities risks and non-executing recommendations", () => {
    const r = e.analyze([
      {
        category: "UTILIZATION",
        value: 0.3,
        previousValue: 0.4,
        sampleSize: 30,
        source: "OBSERVED",
      },
      {
        category: "CANCELLATIONS",
        value: 0.3,
        previousValue: 0.1,
        sampleSize: 30,
        source: "OBSERVED",
      },
    ]);
    expect(r.opportunities[0].type).toBe("UNUSED_CAPACITY");
    expect(r.risks.map((x) => x.type)).toContain("HIGH_CANCELLATION_RATE");
    expect(r.recommendations.every((x) => x.evidence && x.actionClass)).toBe(
      true,
    );
  });
  it("enforces autonomous safety classes", () => {
    expect(e.actionClass("ANALYZE")).toBe("READ_ONLY");
    expect(e.actionClass("SEND_CUSTOMER_MESSAGE")).toBe(
      "REQUIRES_CONFIRMATION",
    );
    expect(e.actionClass("TRANSFER_FUNDS")).toBe("PROHIBITED_AUTONOMOUS");
  });
  it("evaluates experiments without causal claims", () => {
    expect(e.experiment(null, 2, 20, "INCREASE")).toBe("INSUFFICIENT_DATA");
    expect(e.experiment(100, 101, 20, "INCREASE")).toBe("INCONCLUSIVE");
    expect(e.experiment(100, 120, 20, "INCREASE")).toBe("POSITIVE");
  });
  it("protects small benchmark cohorts", () => {
    expect(e.benchmark([1, 2], 5).state).toBe("INSUFFICIENT_BENCHMARK_DATA");
    expect(e.benchmark([1, 2, 3, 4, 5], 5)).toEqual({
      state: "AVAILABLE",
      cohortSize: 5,
      value: 3,
    });
  });
});
