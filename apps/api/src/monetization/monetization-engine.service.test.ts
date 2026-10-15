import { ConflictException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { GlobalizationEngine } from "../globalization/globalization-engine.service.js";
import { MonetizationEngine } from "./monetization-engine.service.js";
const engine = new MonetizationEngine(new GlobalizationEngine());
const money = (amountMinor: bigint, currency = "GBP") => ({
  amountMinor,
  currency,
});
describe("MonetizationEngine", () => {
  it("keeps versioned fixed pricing configuration-driven", () => {
    expect(
      engine.price(
        { model: "FIXED", amountMinor: 1000n, currency: "GBP" },
        99n,
      ),
    ).toEqual(money(1000n));
  });
  it("calculates usage and per-seat prices in minor units", () => {
    expect(
      engine.price(
        { model: "PER_SEAT", amountMinor: 250n, currency: "GBP" },
        4n,
      ),
    ).toEqual(money(1000n));
  });
  it("calculates progressive tier pricing", () => {
    expect(
      engine.price(
        {
          model: "TIERED",
          amountMinor: 0n,
          currency: "GBP",
          tiers: [
            { upTo: 10n, unitAmountMinor: 100n },
            { upTo: null, unitAmountMinor: 50n },
          ],
        },
        12n,
      ),
    ).toEqual(money(1100n));
  });
  it("applies percentage, fixed, min and max commission rules", () => {
    expect(
      engine.commission(money(10000n), {
        fixedMinor: 100n,
        percentageBasisPoints: 500n,
      }),
    ).toEqual(money(600n));
    expect(
      engine.commission(money(10000n), {
        fixedMinor: 0n,
        percentageBasisPoints: 100n,
        minimumMinor: 200n,
      }),
    ).toEqual(money(200n));
  });
  it("rejects commission above gross", () => {
    expect(() =>
      engine.commission(money(100n), {
        fixedMinor: 200n,
        percentageBasisPoints: 0n,
      }),
    ).toThrow(ConflictException);
  });
  it("enforces subscription lifecycle", () => {
    expect(engine.transition("TRIAL", "ACTIVE")).toBe("ACTIVE");
    expect(engine.transition("PAUSED", "ACTIVE")).toBe("ACTIVE");
    expect(() => engine.transition("CANCELLED", "ACTIVE")).toThrow(
      "Invalid subscription transition",
    );
  });
  it("calculates deterministic proration without floats", () => {
    expect(engine.prorate(money(1000n), money(2000n), 15n, 30n)).toEqual(
      money(500n),
    );
  });
  it("enforces promotion limits, caps and currency", () => {
    const p = {
      type: "PERCENTAGE" as const,
      value: 2500n,
      minimumBasketMinor: 1000n,
      maximumDiscountMinor: 2000n,
      usageLimit: 10,
      perUserLimit: 1,
      validFrom: new Date(Date.now() - 1000),
      validTo: new Date(Date.now() + 100000),
      stacking: "EXCLUSIVE" as const,
    };
    expect(engine.discount(money(10000n), p, 0, 0)).toEqual(money(2000n));
    expect(() => engine.discount(money(10000n), p, 1, 0)).toThrow("limit");
  });
  it("calculates settlement net and rejects currency mismatch", () => {
    expect(
      engine.settlement(
        money(10000n),
        money(1000n),
        money(200n),
        money(500n),
        money(100n),
      ).netPayable,
    ).toEqual(money(8400n));
    expect(() =>
      engine.settlement(
        money(1n),
        money(1n, "EUR"),
        money(0n),
        money(0n),
        money(0n),
      ),
    ).toThrow("currency");
  });
  it("derives credit balance from immutable grants and consumption history", () => {
    expect(
      engine.creditBalance(
        [
          { amountMinor: 1000n, currency: "GBP" },
          {
            amountMinor: 500n,
            currency: "GBP",
            expiresAt: new Date("2020-01-01"),
          },
        ],
        [{ amountMinor: 250n, currency: "GBP" }],
        "GBP",
      ),
    ).toEqual(money(750n));
  });
  it("calculates AI cost from version-supplied provider pricing", () => {
    expect(
      engine.aiCost(1_000_000n, 500_000n, 2n, {
        currency: "GBP",
        inputPerMillionMinor: 100n,
        outputPerMillionMinor: 200n,
        toolExecutionMinor: 25n,
      }),
    ).toEqual(money(250n));
  });
  it("returns unknown external unit economics inputs instead of inventing CAC", () => {
    const result = engine.unitEconomics({
      gmv: money(10000n),
      platformRevenue: money(1000n),
      infrastructureCost: money(400n),
      activeTenants: 2n,
      transactions: 5n,
    });
    expect(result).toMatchObject({
      takeRateBasisPoints: 1000,
      arpaMinor: 500n,
      externalInputsStatus: "NOT_AVAILABLE",
    });
  });
  it("computes LTV/CAC only when both external inputs exist", () => {
    expect(
      engine.unitEconomics({
        gmv: money(100n),
        platformRevenue: money(20n),
        infrastructureCost: money(5n),
        activeTenants: 1n,
        transactions: 1n,
        cac: money(50n),
        ltv: money(200n),
      }).ltvCacBasisPoints,
    ).toBe(40000);
  });
  it("does not forecast without sufficient evidence", () => {
    expect(engine.forecast([], 30)).toEqual(
      expect.objectContaining({
        status: "INSUFFICIENT_DATA",
        confidenceBasisPoints: 0,
      }),
    );
    expect(
      engine.forecast([{ amount: money(100n), evidenceId: "a" }], 30).status,
    ).toBe("INSUFFICIENT_DATA");
  });
  it("produces an explainable deterministic forecast", () => {
    expect(
      engine.forecast(
        [
          { amount: money(100n), evidenceId: "a" },
          { amount: money(200n), evidenceId: "b" },
        ],
        30,
      ),
    ).toMatchObject({
      status: "AVAILABLE",
      amount: money(150n),
      inputCoverageBasisPoints: 10000,
    });
  });
  it("does not recommend pricing without evidence", () => {
    expect(engine.pricingRecommendation({ evidence: [] })).toEqual({
      status: "INSUFFICIENT_DATA",
      recommendations: [],
    });
  });
  it("returns evidence-backed direction without changing price", () => {
    expect(
      engine.pricingRecommendation({
        demandBasisPoints: 9000,
        utilizationBasisPoints: 8000,
        evidence: [{ sourceType: "DEMAND", sourceId: "d1" }],
      }),
    ).toMatchObject({
      status: "AVAILABLE",
      recommendations: [
        {
          direction: "INCREASE",
          reasonCodes: ["HIGH_DEMAND", "HIGH_UTILIZATION"],
        },
      ],
    });
  });
});
