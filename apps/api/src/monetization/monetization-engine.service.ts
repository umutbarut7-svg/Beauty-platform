/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { GlobalizationEngine } from "../globalization/globalization-engine.service.js";
import type { Money } from "../globalization/globalization.types.js";
import type {
  CommissionConfiguration,
  ForecastResult,
  PriceConfiguration,
  PromotionPolicy,
  SubscriptionStatus,
} from "./monetization.types.js";
@Injectable()
export class MonetizationEngine {
  constructor(private readonly globalization: GlobalizationEngine) {}
  price(configuration: PriceConfiguration, quantity: bigint): Money {
    if (quantity < 0n)
      throw new BadRequestException("Quantity must be non-negative");
    let amount = configuration.amountMinor;
    if (
      [
        "USAGE",
        "PER_SEAT",
        "PER_LOCATION",
        "PER_PROFESSIONAL",
        "TRANSACTION",
      ].includes(configuration.model)
    )
      amount *= quantity;
    if (configuration.model === "TIERED") {
      if (!configuration.tiers?.length)
        throw new BadRequestException("Tiered price requires tiers");
      amount = this.tiered(configuration.tiers, quantity);
    }
    if (configuration.model === "HYBRID")
      amount += this.basisPoints(
        configuration.amountMinor * quantity,
        configuration.percentageBasisPoints ?? 0n,
      );
    return this.globalization.money(amount, configuration.currency);
  }
  commission(gross: Money, configuration: CommissionConfiguration): Money {
    let amount =
      configuration.fixedMinor +
      this.basisPoints(gross.amountMinor, configuration.percentageBasisPoints);
    if (
      configuration.minimumMinor !== undefined &&
      amount < configuration.minimumMinor
    )
      amount = configuration.minimumMinor;
    if (
      configuration.maximumMinor !== undefined &&
      amount > configuration.maximumMinor
    )
      amount = configuration.maximumMinor;
    if (amount > gross.amountMinor)
      throw new ConflictException("Commission exceeds gross amount");
    return this.globalization.money(amount, gross.currency);
  }
  transition(current: SubscriptionStatus, next: SubscriptionStatus) {
    const allowed: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
      TRIAL: ["ACTIVE", "CANCELLED", "EXPIRED"],
      ACTIVE: ["PAST_DUE", "PAUSED", "CANCELLED", "EXPIRED"],
      PAST_DUE: ["ACTIVE", "PAUSED", "CANCELLED", "EXPIRED"],
      PAUSED: ["ACTIVE", "CANCELLED", "EXPIRED"],
      CANCELLED: [],
      EXPIRED: [],
    };
    if (!allowed[current].includes(next))
      throw new ConflictException(
        `Invalid subscription transition ${current} -> ${next}`,
      );
    return next;
  }
  prorate(
    oldPrice: Money,
    newPrice: Money,
    remainingSeconds: bigint,
    periodSeconds: bigint,
  ): Money {
    if (oldPrice.currency !== newPrice.currency)
      throw new ConflictException("Currency mismatch");
    if (
      remainingSeconds < 0n ||
      periodSeconds <= 0n ||
      remainingSeconds > periodSeconds
    )
      throw new BadRequestException("Invalid proration period");
    return this.globalization.money(
      ((newPrice.amountMinor - oldPrice.amountMinor) * remainingSeconds) /
        periodSeconds,
      oldPrice.currency,
    );
  }
  discount(
    basket: Money,
    policy: PromotionPolicy,
    priorUserUses: number,
    totalUses: number,
  ): Money {
    const now = new Date();
    if (
      now < policy.validFrom ||
      now >= policy.validTo ||
      basket.amountMinor < policy.minimumBasketMinor
    )
      return this.globalization.money(0n, basket.currency);
    if (
      (policy.usageLimit !== undefined && totalUses >= policy.usageLimit) ||
      (policy.perUserLimit !== undefined &&
        priorUserUses >= policy.perUserLimit)
    )
      throw new ConflictException("Promotion usage limit reached");
    if (policy.currency && policy.currency !== basket.currency)
      throw new ConflictException("Promotion currency mismatch");
    let value =
      policy.type === "PERCENTAGE"
        ? this.basisPoints(basket.amountMinor, policy.value)
        : policy.value;
    value = value > basket.amountMinor ? basket.amountMinor : value;
    if (
      policy.maximumDiscountMinor !== undefined &&
      value > policy.maximumDiscountMinor
    )
      value = policy.maximumDiscountMinor;
    return this.globalization.money(value, basket.currency);
  }
  settlement(
    gross: Money,
    commission: Money,
    fees: Money,
    refunds: Money,
    adjustments: Money,
  ) {
    for (const value of [commission, fees, refunds, adjustments])
      if (value.currency !== gross.currency)
        throw new ConflictException("Settlement currency mismatch");
    const net =
      gross.amountMinor -
      commission.amountMinor -
      fees.amountMinor -
      refunds.amountMinor +
      adjustments.amountMinor;
    return {
      gross,
      commission,
      fees,
      refunds,
      adjustments,
      netPayable: this.globalization.money(net, gross.currency),
    };
  }
  aiCost(
    inputTokens: bigint,
    outputTokens: bigint,
    toolExecutions: bigint,
    configuration: {
      currency: string;
      inputPerMillionMinor: bigint;
      outputPerMillionMinor: bigint;
      toolExecutionMinor: bigint;
    },
  ) {
    const input =
      (inputTokens * configuration.inputPerMillionMinor) / 1_000_000n;
    const output =
      (outputTokens * configuration.outputPerMillionMinor) / 1_000_000n;
    return this.globalization.money(
      input + output + toolExecutions * configuration.toolExecutionMinor,
      configuration.currency,
    );
  }
  creditBalance(
    grants: ReadonlyArray<{
      amountMinor: bigint;
      currency: string;
      expiresAt?: Date | null;
    }>,
    consumptions: ReadonlyArray<{ amountMinor: bigint; currency: string }>,
    currency: string,
    now = new Date(),
  ) {
    const granted = grants
      .filter(
        (entry) =>
          entry.currency === currency &&
          (!entry.expiresAt || entry.expiresAt > now),
      )
      .reduce((sum, entry) => sum + entry.amountMinor, 0n);
    const consumed = consumptions
      .filter((entry) => entry.currency === currency)
      .reduce((sum, entry) => sum + entry.amountMinor, 0n);
    if (consumed > granted)
      throw new ConflictException("Credit ledger is over-consumed");
    return this.globalization.money(granted - consumed, currency);
  }
  unitEconomics(input: {
    gmv: Money;
    platformRevenue: Money;
    infrastructureCost: Money;
    activeTenants: bigint;
    transactions: bigint;
    cac?: Money;
    ltv?: Money;
  }) {
    const values = [
      input.platformRevenue,
      input.infrastructureCost,
      input.cac,
      input.ltv,
    ].filter(Boolean) as Money[];
    for (const value of values)
      if (value.currency !== input.gmv.currency)
        throw new ConflictException("Unit economics currency mismatch");
    return {
      currency: input.gmv.currency,
      gmvMinor: input.gmv.amountMinor,
      platformRevenueMinor: input.platformRevenue.amountMinor,
      takeRateBasisPoints:
        input.gmv.amountMinor === 0n
          ? null
          : Number(
              (input.platformRevenue.amountMinor * 10000n) /
                input.gmv.amountMinor,
            ),
      arpaMinor:
        input.activeTenants === 0n
          ? null
          : input.platformRevenue.amountMinor / input.activeTenants,
      revenuePerTransactionMinor:
        input.transactions === 0n
          ? null
          : input.platformRevenue.amountMinor / input.transactions,
      contributionMarginMinor:
        input.platformRevenue.amountMinor -
        input.infrastructureCost.amountMinor,
      ltvCacBasisPoints:
        !input.cac || !input.ltv || input.cac.amountMinor === 0n
          ? null
          : Number((input.ltv.amountMinor * 10000n) / input.cac.amountMinor),
      externalInputsStatus:
        input.cac && input.ltv ? "AVAILABLE" : "NOT_AVAILABLE",
    };
  }
  forecast(
    history: ReadonlyArray<{ amount: Money; evidenceId: string }>,
    horizonDays: number,
  ): ForecastResult {
    if (history.length < 2)
      return {
        status: "INSUFFICIENT_DATA",
        confidenceBasisPoints: 0,
        horizonDays,
        inputCoverageBasisPoints: history.length ? 2500 : 0,
        evidence: history.map((x) => ({
          sourceType: "LEDGER_PERIOD",
          sourceId: x.evidenceId,
        })),
      };
    const currency = history[0]!.amount.currency;
    if (history.some((x) => x.amount.currency !== currency))
      throw new ConflictException("Forecast currency mismatch");
    const average =
      history.reduce((sum, x) => sum + x.amount.amountMinor, 0n) /
      BigInt(history.length);
    return {
      status: "AVAILABLE",
      amount: this.globalization.money(average, currency),
      confidenceBasisPoints: Math.min(9000, 4000 + history.length * 500),
      horizonDays,
      inputCoverageBasisPoints: 10000,
      evidence: history.map((x) => ({
        sourceType: "LEDGER_PERIOD",
        sourceId: x.evidenceId,
      })),
    };
  }
  pricingRecommendation(input: {
    demandBasisPoints?: number;
    utilizationBasisPoints?: number;
    conversionBasisPoints?: number;
    marginBasisPoints?: number;
    evidence: ReadonlyArray<{ sourceType: string; sourceId: string }>;
  }) {
    if (
      !input.evidence.length ||
      [
        input.demandBasisPoints,
        input.utilizationBasisPoints,
        input.conversionBasisPoints,
        input.marginBasisPoints,
      ].every((x) => x === undefined)
    )
      return { status: "INSUFFICIENT_DATA" as const, recommendations: [] };
    const reasonCodes: string[] = [];
    let direction: "INCREASE" | "DECREASE" | "HOLD" = "HOLD";
    if (
      (input.demandBasisPoints ?? 0) >= 7500 &&
      (input.utilizationBasisPoints ?? 0) >= 7500
    ) {
      direction = "INCREASE";
      reasonCodes.push("HIGH_DEMAND", "HIGH_UTILIZATION");
    } else if ((input.conversionBasisPoints ?? 10000) < 3000) {
      direction = "DECREASE";
      reasonCodes.push("LOW_CONVERSION");
    }
    return {
      status: "AVAILABLE" as const,
      recommendations: [
        {
          direction,
          reasonCodes,
          confidenceBasisPoints: Math.min(
            9000,
            3000 + input.evidence.length * 1000,
          ),
          evidence: input.evidence,
        },
      ],
    };
  }
  private basisPoints(amount: bigint, basisPoints: bigint) {
    if (basisPoints < 0n || basisPoints > 10000n)
      throw new BadRequestException("Invalid basis points");
    return (amount * basisPoints + 5000n) / 10000n;
  }
  private tiered(
    tiers: ReadonlyArray<{ upTo: bigint | null; unitAmountMinor: bigint }>,
    quantity: bigint,
  ) {
    let previous = 0n;
    let total = 0n;
    for (const tier of tiers) {
      const capped =
        tier.upTo === null || quantity < tier.upTo ? quantity : tier.upTo;
      if (capped > previous)
        total += (capped - previous) * tier.unitAmountMinor;
      previous = capped;
      if (previous >= quantity) break;
    }
    if (previous < quantity)
      throw new BadRequestException(
        "Tier configuration does not cover quantity",
      );
    return total;
  }
}
