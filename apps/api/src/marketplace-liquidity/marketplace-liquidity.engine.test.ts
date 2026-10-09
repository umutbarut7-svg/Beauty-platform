import { describe, expect, it } from "vitest";
import { MarketplaceLiquidityEngine } from "./marketplace-liquidity.engine.js";
const engine = new MarketplaceLiquidityEngine();
describe("MarketplaceLiquidityEngine", () => {
  it("calculates deterministic liquidity and confidence", () => {
    const input = {
      demand: 10,
      supply: 12,
      capacity: 10,
      matches: 9,
      completedBookings: 8,
      freshness: 1,
      sampleSize: 50,
    };
    expect(engine.calculate(input)).toEqual(engine.calculate(input));
    expect(engine.calculate(input).health).toBe("HEALTHY");
    expect(engine.confidence(20, 1, 1, 1, 1)).toBe(
      engine.confidence(20, 1, 1, 1, 1),
    );
  });
  it("distinguishes no data, insufficient data, and observed zero", () => {
    expect(
      engine.calculate({
        demand: null,
        supply: null,
        capacity: null,
        matches: null,
        completedBookings: null,
        freshness: 0,
        sampleSize: 0,
      }).state,
    ).toBe("NO_DATA");
    expect(
      engine.calculate({
        demand: 1,
        supply: null,
        capacity: null,
        matches: null,
        completedBookings: null,
        freshness: 1,
        sampleSize: 1,
      }).state,
    ).toBe("INSUFFICIENT_DATA");
    expect(
      engine.calculate({
        demand: 0,
        supply: 0,
        capacity: 0,
        matches: 0,
        completedBookings: 0,
        freshness: 1,
        sampleSize: 5,
      }).state,
    ).toBe("ZERO");
  });
  it("detects supply gaps and healthy supply", () => {
    expect(engine.supplyGap(10, 2, 5, 20)).toMatchObject({
      state: "GAP",
      severity: "HIGH",
    });
    expect(engine.supplyGap(10, 10, 0, 20)).toEqual({ state: "HEALTHY" });
    expect(engine.supplyGap(10, 1, 1, 1)).toEqual({
      state: "INSUFFICIENT_DATA",
    });
  });
  it("returns no-match and insufficient-data explicitly", () => {
    expect(engine.route([]).status).toBe("INSUFFICIENT_DATA");
    expect(
      engine.route([
        {
          id: "x",
          suitability: null,
          resultProbability: null,
          confidence: 0,
          capacity: null,
          trust: null,
          evidenceCount: 0,
        },
      ]).status,
    ).toBe("NO_MATCH");
  });
  it("keeps money and sponsorship out of organic rank", () => {
    const base = [
      {
        id: "best",
        suitability: 0.9,
        resultProbability: 0.8,
        confidence: 0.8,
        capacity: 2,
        trust: 0.8,
        evidenceCount: 4,
        commercialValue: 0,
      },
      {
        id: "paid",
        suitability: 0.5,
        resultProbability: 0.9,
        confidence: 0.9,
        capacity: 9,
        trust: 0.9,
        evidenceCount: 10,
        commercialValue: 999999,
        sponsored: true,
      },
    ];
    const result = engine.route(base);
    expect(result.organic[0]!.candidateId).toBe("best");
    expect(result.sponsored).toEqual([
      { candidateId: "paid", sponsoredPlacement: true, label: "SPONSORED" },
    ]);
  });
  it("uses suitability before all other routing factors", () => {
    const result = engine.route([
      {
        id: "suitable",
        suitability: 0.8,
        resultProbability: 0.1,
        confidence: 0.1,
        capacity: 1,
        trust: 0.1,
        evidenceCount: 3,
      },
      {
        id: "otherwise-high",
        suitability: 0.7,
        resultProbability: 1,
        confidence: 1,
        capacity: 100,
        trust: 1,
        evidenceCount: 100,
      },
    ]);
    expect(result.organic[0]!.candidateId).toBe("suitable");
  });
  it("represents cold start without fake trust or confidence", () => {
    const result = engine.route([
      {
        id: "new",
        suitability: 0.7,
        resultProbability: null,
        confidence: 0.8,
        capacity: 1,
        trust: 0.5,
        evidenceCount: 0,
      },
    ]);
    expect(result.organic[0]).toMatchObject({ coldStart: true, confidence: 0 });
  });
  it("labels network effects as correlation, never causation", () => {
    expect(
      engine.networkEffect({
        supplyChange: 0.1,
        matchChange: 0.1,
        completionChange: 0.1,
        repeatChange: 0.1,
      }),
    ).toMatchObject({ state: "OBSERVED_CORRELATION", causal: false });
  });
  it("prohibits marketplace manipulation and gates critical actions", () => {
    expect(engine.intervention("BUY_ORGANIC_RANK")).toBe(
      "PROHIBITED_AUTONOMOUS",
    );
    expect(engine.intervention("CHANGE_PRICE")).toBe("REQUIRES_CONFIRMATION");
    expect(engine.intervention("READ")).toBe("READ_ONLY_INSIGHT");
  });
});
