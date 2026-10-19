import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import type { DateTime as DateTimeType } from "luxon";
import { DateTime } from "luxon";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Nest uses this token at runtime.
import { GlobalizationEngine } from "../globalization/globalization-engine.service.js";
import type {
  ExperimentVariantInput,
  GrowthMetricInput,
  LifecycleState,
  QualificationFacts,
  QualificationRule,
  ReferralState,
  RiskDecision,
} from "./growth.types.js";

const transitions: Record<ReferralState, readonly ReferralState[]> = {
  CREATED: ["CLICKED", "SIGNED_UP", "EXPIRED", "CANCELLED", "FRAUD_REVIEW"],
  CLICKED: ["SIGNED_UP", "EXPIRED", "CANCELLED", "FRAUD_REVIEW"],
  SIGNED_UP: ["QUALIFIED", "REJECTED", "EXPIRED", "FRAUD_REVIEW"],
  QUALIFIED: ["CONVERTED", "REJECTED", "FRAUD_REVIEW"],
  CONVERTED: ["REWARDED", "REVERSED", "FRAUD_REVIEW"],
  REWARDED: ["REVERSED"],
  FRAUD_REVIEW: ["QUALIFIED", "REJECTED", "CANCELLED"],
  EXPIRED: [],
  REJECTED: [],
  CANCELLED: [],
  REVERSED: [],
};

@Injectable()
export class GrowthEngine {
  constructor(private readonly globalization: GlobalizationEngine) {}
  normalizeCode(code: string) {
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{6,32}$/.test(normalized))
      throw new BadRequestException("Invalid referral code");
    return normalized;
  }
  referralPath(code: string) {
    return `/r/${this.normalizeCode(code)}`;
  }
  assertSafeRedirect(path: string) {
    if (
      !path.startsWith("/") ||
      path.startsWith("//") ||
      path.includes("\\") ||
      [...path].some((character) => character.charCodeAt(0) < 32)
    )
      throw new BadRequestException("Unsafe referral redirect");
    return path;
  }
  transition(from: ReferralState, to: ReferralState) {
    if (!transitions[from].includes(to))
      throw new ConflictException(
        `Invalid referral transition: ${from} -> ${to}`,
      );
  }
  qualify(rules: readonly QualificationRule[], facts: QualificationFacts) {
    const failures: string[] = [];
    for (const rule of rules) {
      let ok = false;
      switch (rule.type) {
        case "REGISTRATION_COMPLETED":
          ok = facts.registrationCompleted;
          break;
        case "IDENTITY_VERIFIED":
          ok = facts.identityVerified;
          break;
        case "FIRST_BOOKING_COMPLETED":
          ok = facts.firstBookingCompleted;
          break;
        case "PAYMENT_MINIMUM":
          ok =
            facts.currency === rule.currency &&
            (facts.paymentAmountMinor ?? -1n) >= BigInt(rule.amountMinor);
          break;
        case "MARKET":
          ok = facts.marketId === rule.marketId;
          break;
        case "CATEGORY":
          ok = facts.categoryId === rule.categoryId;
          break;
        case "REFUND_WINDOW_PASSED":
          ok =
            !!facts.qualifiedActionAt &&
            facts.now.getTime() >=
              facts.qualifiedActionAt.getTime() + rule.hours * 3_600_000;
          break;
      }
      if (!ok) failures.push(rule.type);
    }
    return { qualified: failures.length === 0, failures };
  }
  assessRisk(input: {
    ownerId: string;
    referredId?: string;
    existingUser: boolean;
    codeUses: number;
    usageLimit?: number;
    conversionsLastHour: number;
    cyclic: boolean;
  }): { decision: RiskDecision; reasons: string[] } {
    const reasons: string[] = [];
    if (input.referredId && input.ownerId === input.referredId)
      reasons.push("SELF_REFERRAL");
    if (input.cyclic) reasons.push("CYCLIC_REFERRAL");
    if (input.existingUser) reasons.push("EXISTING_USER");
    if (input.usageLimit !== undefined && input.codeUses >= input.usageLimit)
      reasons.push("USAGE_LIMIT_EXCEEDED");
    if (reasons.length) return { decision: "BLOCK", reasons };
    if (input.conversionsLastHour >= 5)
      return { decision: "REVIEW", reasons: ["RAPID_CONVERSIONS"] };
    return { decision: "ALLOW", reasons: [] };
  }
  assignVariant(
    tenantId: string,
    experimentId: string,
    subjectId: string,
    variants: readonly ExperimentVariantInput[],
  ) {
    const total = variants.reduce((sum, value) => sum + value.weight, 0);
    if (
      !variants.length ||
      variants.some((v) => !Number.isInteger(v.weight) || v.weight <= 0) ||
      total > 10_000
    )
      throw new BadRequestException("Invalid experiment weights");
    const bucket = Number(
      BigInt(
        `0x${createHash("sha256").update(`${tenantId}:${experimentId}:${subjectId}`).digest("hex").slice(0, 12)}`,
      ) % BigInt(total),
    );
    let cursor = 0;
    for (const variant of variants) {
      cursor += variant.weight;
      if (bucket < cursor) return variant.key;
    }
    throw new ConflictException("Experiment assignment failed");
  }
  streakPeriod(
    at: Date,
    timezone: string,
    cadence: "DAILY" | "WEEKLY" | "MONTHLY",
  ) {
    this.globalization.validateTimezone(timezone);
    const local = DateTime.fromJSDate(at, { zone: "utc" }).setZone(timezone);
    const start: DateTimeType =
      cadence === "DAILY"
        ? local.startOf("day")
        : cadence === "WEEKLY"
          ? local.startOf("week")
          : local.startOf("month");
    return {
      key: start.toISODate()!,
      startsAtUtc: start.toUTC().toJSDate(),
      endsAtUtc: (cadence === "DAILY"
        ? start.plus({ days: 1 })
        : cadence === "WEEKLY"
          ? start.plus({ weeks: 1 })
          : start.plus({ months: 1 })
      )
        .toUTC()
        .toJSDate(),
    };
  }
  lifecycle(input: {
    accountCreatedAt: Date;
    activatedAt?: Date;
    lastActivityAt?: Date;
    previous?: LifecycleState;
    now: Date;
  }): LifecycleState {
    if (!input.activatedAt) return "NEW";
    if (!input.lastActivityAt) return "ACTIVATED";
    const days =
      (input.now.getTime() - input.lastActivityAt.getTime()) / 86_400_000;
    if (
      (input.previous === "DORMANT" || input.previous === "AT_RISK") &&
      days <= 7
    )
      return "REACTIVATED";
    if (days > 60) return "DORMANT";
    if (days > 30) return "AT_RISK";
    return "ENGAGED";
  }
  metrics(input: GrowthMetricInput) {
    const ratio = (a: number, b: number) => (b === 0 ? null : a / b);
    return {
      inviteClickRate: ratio(input.clicks, input.invitesSent),
      clickSignupRate: ratio(input.signups, input.clicks),
      signupQualificationRate: ratio(input.qualified, input.signups),
      referralConversionRate: ratio(input.conversions, input.qualified),
      referralsPerActiveUser: ratio(input.conversions, input.activeUsers),
      viralCoefficient:
        input.activeUsers === 0 || input.invitesSent === 0
          ? null
          : (input.invitesSent / input.activeUsers) *
            (input.conversions / input.invitesSent),
      dataState: input.activeUsers === 0 ? "INSUFFICIENT_DATA" : "AVAILABLE",
    };
  }
}
