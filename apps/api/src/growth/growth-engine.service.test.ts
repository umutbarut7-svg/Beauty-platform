import { describe, expect, it } from "vitest";
import { GlobalizationEngine } from "../globalization/globalization-engine.service.js";
import { GrowthEngine } from "./growth-engine.service.js";

const engine = new GrowthEngine(new GlobalizationEngine());
describe("GrowthEngine", () => {
  it("normalizes collision-key representation and builds an internal link", () => {
    expect(engine.normalizeCode(" ab12cd ")).toBe("AB12CD");
    expect(engine.referralPath("ab12cd")).toBe("/r/AB12CD");
  });
  it("rejects malformed codes and open redirects", () => {
    expect(() => engine.normalizeCode("bad!")).toThrow("Invalid referral code");
    expect(() => engine.assertSafeRedirect("//evil.example/x")).toThrow(
      "Unsafe",
    );
    expect(() => engine.assertSafeRedirect("https://evil.example")).toThrow(
      "Unsafe",
    );
  });
  it("enforces referral lifecycle transitions", () => {
    expect(() => engine.transition("CREATED", "SIGNED_UP")).not.toThrow();
    expect(() => engine.transition("CREATED", "REWARDED")).toThrow(
      "Invalid referral transition",
    );
    expect(() => engine.transition("REVERSED", "REWARDED")).toThrow();
  });
  it("evaluates configuration-driven qualification without guessing", () => {
    const now = new Date("2026-10-04T12:00:00Z");
    const result = engine.qualify(
      [
        { type: "REGISTRATION_COMPLETED" },
        { type: "PAYMENT_MINIMUM", amountMinor: "1000", currency: "USD" },
        { type: "REFUND_WINDOW_PASSED", hours: 24 },
      ],
      {
        registrationCompleted: true,
        identityVerified: false,
        firstBookingCompleted: false,
        paymentAmountMinor: 1500n,
        currency: "USD",
        qualifiedActionAt: new Date("2026-10-03T11:00:00Z"),
        now,
      },
    );
    expect(result).toEqual({ qualified: true, failures: [] });
  });
  it("reports exact failed qualification rules", () => {
    const result = engine.qualify(
      [{ type: "IDENTITY_VERIFIED" }, { type: "MARKET", marketId: "m1" }],
      {
        registrationCompleted: true,
        identityVerified: false,
        firstBookingCompleted: false,
        marketId: "m2",
        now: new Date(),
      },
    );
    expect(result).toEqual({
      qualified: false,
      failures: ["IDENTITY_VERIFIED", "MARKET"],
    });
  });
  it("blocks self referrals, existing users, cycles and exhausted codes", () => {
    expect(
      engine.assessRisk({
        ownerId: "u1",
        referredId: "u1",
        existingUser: false,
        codeUses: 0,
        conversionsLastHour: 0,
        cyclic: false,
      }).decision,
    ).toBe("BLOCK");
    expect(
      engine.assessRisk({
        ownerId: "u1",
        referredId: "u2",
        existingUser: true,
        codeUses: 0,
        conversionsLastHour: 0,
        cyclic: false,
      }).reasons,
    ).toContain("EXISTING_USER");
    expect(
      engine.assessRisk({
        ownerId: "u1",
        referredId: "u2",
        existingUser: false,
        codeUses: 1,
        usageLimit: 1,
        conversionsLastHour: 0,
        cyclic: true,
      }).reasons,
    ).toEqual(
      expect.arrayContaining(["CYCLIC_REFERRAL", "USAGE_LIMIT_EXCEEDED"]),
    );
  });
  it("routes rapid conversion patterns to review", () => {
    expect(
      engine.assessRisk({
        ownerId: "u1",
        referredId: "u2",
        existingUser: false,
        codeUses: 0,
        conversionsLastHour: 5,
        cyclic: false,
      }),
    ).toEqual({ decision: "REVIEW", reasons: ["RAPID_CONVERSIONS"] });
  });
  it("assigns experiments deterministically and respects weighted variants", () => {
    const variants = [
      { key: "control", weight: 5000 },
      { key: "offer", weight: 5000 },
    ];
    const first = engine.assignVariant("t1", "e1", "subject", variants);
    expect(engine.assignVariant("t1", "e1", "subject", variants)).toBe(first);
    expect(["control", "offer"]).toContain(first);
  });
  it("rejects invalid experiment weights", () => {
    expect(() => engine.assignVariant("t", "e", "s", [])).toThrow();
    expect(() =>
      engine.assignVariant("t", "e", "s", [{ key: "x", weight: 0 }]),
    ).toThrow();
  });
  it("uses market timezone calendar boundaries for DST-safe streaks", () => {
    const before = engine.streakPeriod(
      new Date("2026-03-08T06:30:00Z"),
      "America/New_York",
      "DAILY",
    );
    const after = engine.streakPeriod(
      new Date("2026-03-08T07:30:00Z"),
      "America/New_York",
      "DAILY",
    );
    expect(before.key).toBe("2026-03-08");
    expect(after.key).toBe(before.key);
    expect(before.endsAtUtc.getTime() - before.startsAtUtc.getTime()).toBe(
      23 * 3_600_000,
    );
  });
  it("calculates deterministic lifecycle states and reactivation", () => {
    const now = new Date("2026-10-04T00:00:00Z");
    expect(engine.lifecycle({ accountCreatedAt: now, now })).toBe("NEW");
    expect(
      engine.lifecycle({ accountCreatedAt: now, activatedAt: now, now }),
    ).toBe("ACTIVATED");
    expect(
      engine.lifecycle({
        accountCreatedAt: now,
        activatedAt: now,
        lastActivityAt: new Date("2026-08-01T00:00:00Z"),
        now,
      }),
    ).toBe("DORMANT");
    expect(
      engine.lifecycle({
        accountCreatedAt: now,
        activatedAt: now,
        lastActivityAt: now,
        previous: "DORMANT",
        now,
      }),
    ).toBe("REACTIVATED");
  });
  it("returns no invented ratios when denominators have no data", () => {
    expect(
      engine.metrics({
        activeUsers: 0,
        invitesSent: 0,
        clicks: 0,
        signups: 0,
        qualified: 0,
        conversions: 0,
        rewardsGranted: 0,
      }),
    ).toMatchObject({
      viralCoefficient: null,
      inviteClickRate: null,
      dataState: "INSUFFICIENT_DATA",
    });
  });
  it("calculates a transparent viral coefficient", () => {
    expect(
      engine.metrics({
        activeUsers: 10,
        invitesSent: 20,
        clicks: 10,
        signups: 5,
        qualified: 4,
        conversions: 2,
        rewardsGranted: 2,
      }),
    ).toMatchObject({
      inviteClickRate: 0.5,
      clickSignupRate: 0.5,
      viralCoefficient: 0.2,
    });
  });
});
