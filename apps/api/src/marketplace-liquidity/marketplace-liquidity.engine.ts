import { Injectable } from "@nestjs/common";
import type {
  LiquidityInputs,
  RouteCandidate,
} from "./marketplace-liquidity.types.js";
@Injectable()
export class MarketplaceLiquidityEngine {
  confidence(
    sampleSize: number,
    completeness: number,
    freshness: number,
    reliability: number,
    consistency: number,
  ) {
    if (sampleSize <= 0) return 0;
    return Number(
      (
        Math.min(1, sampleSize / 50) * 0.3 +
        this.bound(completeness) * 0.25 +
        this.bound(freshness) * 0.2 +
        this.bound(reliability) * 0.15 +
        this.bound(consistency) * 0.1
      ).toFixed(4),
    );
  }
  calculate(input: LiquidityInputs) {
    const required = [
      input.demand,
      input.supply,
      input.capacity,
      input.matches,
      input.completedBookings,
    ];
    if (required.every((value) => value === null))
      return {
        state: "NO_DATA" as const,
        health: "DATA_INSUFFICIENT" as const,
        components: null,
        confidence: 0,
      };
    if (required.some((value) => value === null))
      return {
        state: "INSUFFICIENT_DATA" as const,
        health: "DATA_INSUFFICIENT" as const,
        components: null,
        confidence: this.confidence(
          input.sampleSize,
          required.filter((x) => x !== null).length / required.length,
          input.freshness,
          1,
          1,
        ),
      };
    const demand = input.demand!,
      supply = input.supply!,
      capacity = input.capacity!,
      matches = input.matches!,
      completed = input.completedBookings!;
    const demandCoverage = demand === 0 ? 1 : Math.min(1, supply / demand);
    const capacityCoverage = demand === 0 ? 1 : Math.min(1, capacity / demand);
    const matchSuccess = demand === 0 ? 1 : Math.min(1, matches / demand);
    const bookingConversion =
      matches === 0 ? (demand === 0 ? 1 : 0) : Math.min(1, completed / matches);
    const components = {
      demandCoverage,
      supplyCoverage: demandCoverage,
      capacityCoverage,
      matchSuccess,
      bookingConversion,
      unfulfilledDemand: Math.max(0, demand - matches),
    };
    const health =
      supply < demand
        ? "SUPPLY_CONSTRAINED"
        : capacity < demand
          ? "CAPACITY_CONSTRAINED"
          : matches < demand * 0.7
            ? "MATCH_CONSTRAINED"
            : "HEALTHY";
    return {
      state: demand === 0 ? ("ZERO" as const) : ("AVAILABLE" as const),
      health,
      components,
      confidence: this.confidence(input.sampleSize, 1, input.freshness, 1, 1),
    };
  }
  supplyGap(
    demand: number | null,
    usableCapacity: number | null,
    noMatches: number | null,
    sampleSize: number,
  ) {
    if (
      demand === null ||
      usableCapacity === null ||
      noMatches === null ||
      sampleSize < 3
    )
      return { state: "INSUFFICIENT_DATA" as const };
    const gap = Math.max(0, demand - usableCapacity);
    if (gap === 0 && noMatches === 0) return { state: "HEALTHY" as const };
    const ratio = demand === 0 ? 0 : Math.min(1, (gap + noMatches) / demand);
    return {
      state: "GAP" as const,
      severity: ratio >= 0.6 ? "HIGH" : ratio >= 0.3 ? "MEDIUM" : "LOW",
      confidence: this.confidence(sampleSize, 1, 1, 1, 1),
      evidence: { demand, usableCapacity, noMatches, gap },
    };
  }
  route(candidates: RouteCandidate[]) {
    const eligible = candidates.filter(
      (x) =>
        x.suitability !== null &&
        x.capacity !== null &&
        x.capacity > 0 &&
        x.trust !== null,
    );
    if (!eligible.length)
      return {
        status: candidates.length ? "NO_MATCH" : "INSUFFICIENT_DATA",
        organic: [],
        sponsored: [],
      };
    const compare = (a: RouteCandidate, b: RouteCandidate) =>
      b.suitability! - a.suitability! ||
      (b.resultProbability ?? -1) - (a.resultProbability ?? -1) ||
      b.confidence - a.confidence ||
      b.capacity! - a.capacity! ||
      b.trust! - a.trust! ||
      a.id.localeCompare(b.id);
    const organic = [...eligible].sort(compare).map((candidate, index) => ({
      candidateId: candidate.id,
      organicRank: index + 1,
      confidence: candidate.evidenceCount ? candidate.confidence : 0,
      coldStart: candidate.evidenceCount < 3,
      sponsored: false,
    }));
    const sponsored = eligible
      .filter((x) => x.sponsored)
      .map((x) => ({
        candidateId: x.id,
        sponsoredPlacement: true,
        label: "SPONSORED" as const,
      }));
    return { status: "MATCHED", organic, sponsored };
  }
  networkEffect(input: {
    supplyChange: number | null;
    matchChange: number | null;
    completionChange: number | null;
    repeatChange: number | null;
  }) {
    if (Object.values(input).some((value) => value === null))
      return { state: "INSUFFICIENT_DATA" as const };
    return {
      state: "OBSERVED_CORRELATION" as const,
      direction: Object.values(input).every((value) => value! > 0)
        ? "POSITIVE"
        : "MIXED",
      causal: false,
      evidence: input,
    };
  }
  intervention(action: string) {
    if (
      [
        "BUY_ORGANIC_RANK",
        "HIDDEN_SPONSOR_BOOST",
        "PENALIZE_PROVIDER",
        "TRANSFER_FUNDS",
        "OVERRIDE_USER_PREFERENCE",
      ].includes(action)
    )
      return "PROHIBITED_AUTONOMOUS";
    if (
      ["CHANGE_PRICE", "PUBLISH_CAMPAIGN", "MESSAGE_CUSTOMERS"].includes(action)
    )
      return "REQUIRES_CONFIRMATION";
    return action === "READ" ? "READ_ONLY_INSIGHT" : "RECOMMENDATION";
  }
  private bound(value: number) {
    return Math.max(0, Math.min(1, value));
  }
}
