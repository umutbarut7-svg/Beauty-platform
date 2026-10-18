/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from "@nestjs/common";
import type {
  GrowthAction,
  MetricPoint,
} from "./business-intelligence.types.js";
@Injectable()
export class BusinessIntelligenceEngine {
  confidence(
    sample: number,
    completeness: number,
    recency: number,
    reliability: number,
    consistency: number,
  ) {
    if (sample <= 0) return 0;
    return Number(
      (
        Math.min(1, sample / 30) * 0.3 +
        this.bound(completeness) * 0.2 +
        this.bound(recency) * 0.2 +
        this.bound(reliability) * 0.2 +
        this.bound(consistency) * 0.1
      ).toFixed(4),
    );
  }
  compare(current: number | null, previous: number | null) {
    if (current === null || previous === null)
      return { state: "INSUFFICIENT_DATA" as const, change: null };
    if (previous === 0)
      return { state: "AVAILABLE" as const, change: current === 0 ? 0 : null };
    return {
      state: "AVAILABLE" as const,
      change: Number(((current - previous) / Math.abs(previous)).toFixed(4)),
    };
  }
  analyze(points: MetricPoint[]) {
    const by = new Map(points.map((x) => [x.category, x]));
    const insights: any[] = [],
      opportunities: any[] = [],
      risks: any[] = [],
      recommendations: any[] = [];
    const booking = by.get("BOOKINGS"),
      cancel = by.get("CANCELLATIONS"),
      util = by.get("UTILIZATION"),
      repeat = by.get("REPEAT_CUSTOMERS");
    if (booking) {
      const c = this.compare(booking.value, booking.previousValue ?? null);
      if (c.change !== null && c.change >= 0.15)
        insights.push(this.signal("BOOKING_DEMAND_INCREASING", booking));
      if (c.change !== null && c.change <= -0.15)
        risks.push(this.signal("BOOKING_DECLINE", booking));
    }
    if (util?.value !== null && util?.value !== undefined && util.value < 0.5) {
      opportunities.push(this.signal("UNUSED_CAPACITY", util));
      risks.push(this.signal("CAPACITY_UNDERUTILIZATION", util));
      recommendations.push(
        this.recommend("FILL_UNUSED_CAPACITY", util, "LOW_RISK_WRITE"),
      );
    }
    if (
      cancel?.value !== null &&
      cancel?.value !== undefined &&
      cancel.value > 0.2
    ) {
      risks.push(this.signal("HIGH_CANCELLATION_RATE", cancel));
      recommendations.push(
        this.recommend("REDUCE_NO_SHOWS", cancel, "REQUIRES_CONFIRMATION"),
      );
    }
    if (
      repeat?.value !== null &&
      repeat?.value !== undefined &&
      repeat.value < 0.3
    ) {
      opportunities.push(this.signal("REPEAT_CUSTOMER_OPPORTUNITY", repeat));
      recommendations.push(
        this.recommend("IMPROVE_REPEAT_BOOKINGS", repeat, "READ_ONLY"),
      );
    }
    return { insights, opportunities, risks, recommendations };
  }
  actionClass(action: GrowthAction) {
    return action === "ANALYZE"
      ? "READ_ONLY"
      : action === "DRAFT_CAMPAIGN"
        ? "LOW_RISK_WRITE"
        : action === "TRANSFER_FUNDS"
          ? "PROHIBITED_AUTONOMOUS"
          : "REQUIRES_CONFIRMATION";
  }
  experiment(
    baseline: number | null,
    current: number | null,
    sample: number,
    direction: "INCREASE" | "DECREASE",
  ) {
    if (baseline === null || current === null || sample < 10)
      return "INSUFFICIENT_DATA";
    const delta = current - baseline;
    if (Math.abs(delta) < Math.max(0.01, Math.abs(baseline) * 0.03))
      return "INCONCLUSIVE";
    return (direction === "INCREASE" ? delta > 0 : delta < 0)
      ? "POSITIVE"
      : "NEGATIVE";
  }
  benchmark(values: number[], privacyThreshold = 5) {
    if (values.length < privacyThreshold)
      return {
        state: "INSUFFICIENT_BENCHMARK_DATA",
        cohortSize: values.length,
        value: null,
      };
    return {
      state: "AVAILABLE",
      cohortSize: values.length,
      value: Number(
        (values.reduce((a, b) => a + b, 0) / values.length).toFixed(4),
      ),
    };
  }
  private signal(type: string, p: MetricPoint) {
    return {
      type,
      evidence: {
        metric: p.category,
        value: p.value,
        sampleSize: p.sampleSize,
        source: p.source,
      },
      confidence: this.confidence(
        p.sampleSize,
        1,
        1,
        p.source === "OBSERVED" ? 1 : 0.7,
        1,
      ),
    };
  }
  private recommend(type: string, p: MetricPoint, actionClass: string) {
    return {
      ...this.signal(type, p),
      actionClass,
      estimatedImpactRange: { min: null, max: null },
      constraints: [
        "Correlation is not causation",
        "Requires review before execution",
      ],
    };
  }
  private bound(x: number) {
    return Math.max(0, Math.min(1, x));
  }
}
