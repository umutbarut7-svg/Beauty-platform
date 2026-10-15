import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { GlobalizationEngine } from "./globalization-engine.service.js";
import type { MarketPolicy } from "./globalization.types.js";
const engine = new GlobalizationEngine();
const policy: MarketPolicy = {
  id: "cfg-2",
  marketId: "m",
  marketKey: "global",
  countryCode: "GB",
  version: 2,
  defaultLocale: "en-GB",
  supportedLocales: ["en-GB", "de-DE"],
  defaultCurrency: "GBP",
  supportedCurrencies: ["GBP", "EUR"],
  defaultTimezone: "Europe/London",
  supportedTimezones: ["Europe/London", "Europe/Berlin"],
  measurementSystem: "METRIC",
  featureFlags: { AI: true, COMMERCE: false },
  supportedPaymentMethods: ["CARD", "CASH"],
  bookingPolicy: {
    minimumLeadMinutes: 60,
    maximumAdvanceDays: 90,
    cancellationWindowMinutes: 120,
    rescheduleWindowMinutes: 120,
  },
  addressPolicy: {
    administrativeAreaRequired: true,
    postalCodeRequired: true,
    postalCodePattern: "^[A-Z0-9 ]+$",
  },
  effectiveFrom: new Date("2026-01-01T00:00:00Z"),
  effectiveTo: null,
};
describe("GlobalizationEngine", () => {
  it("resolves user → tenant → market fallback without guessing", () => {
    expect(
      engine.resolve(
        policy,
        {},
        { locale: "de-DE", currency: "EUR", timezone: "Europe/Berlin" },
      ),
    ).toMatchObject({
      locale: "de-DE",
      currency: "EUR",
      timezone: "Europe/Berlin",
      marketConfigurationVersion: 2,
    });
    expect(engine.resolve(policy)).toMatchObject({
      locale: "en-GB",
      currency: "GBP",
    });
  });
  it("rejects invalid and unsupported locales", () => {
    expect(() => engine.validateLocale("not_locale")).toThrow(
      BadRequestException,
    );
    expect(() => engine.resolve(policy, { locale: "fr-FR" })).toThrow(
      "Unsupported locale",
    );
  });
  it("stores money in exact minor units and rejects currency mismatch", () => {
    expect(
      engine.add(engine.money(101n, "GBP"), engine.money(2n, "GBP")),
    ).toEqual({ amountMinor: 103n, currency: "GBP" });
    expect(() =>
      engine.add(engine.money(1n, "GBP"), engine.money(1n, "EUR")),
    ).toThrow(ConflictException);
  });
  it("converts FX deterministically for a validity window", () => {
    const rate = {
      baseCurrency: "GBP",
      quoteCurrency: "EUR",
      rate: "1.125",
      provider: "test",
      effectiveAt: new Date("2026-01-01Z"),
      expiresAt: new Date("2027-01-01Z"),
      version: 1,
    };
    expect(
      engine.convert(engine.money(1000n, "GBP"), rate, new Date("2026-06-01Z")),
    ).toEqual({ amountMinor: 1125n, currency: "EUR" });
    expect(() =>
      engine.convert(engine.money(1n, "GBP"), rate, new Date("2028-01-01Z")),
    ).toThrow("not valid");
  });
  it("does not mutate historical money when FX changes", () => {
    const original = engine.money(999n, "GBP");
    engine.convert(
      original,
      {
        baseCurrency: "GBP",
        quoteCurrency: "EUR",
        rate: "2",
        provider: "x",
        effectiveAt: new Date(0),
        expiresAt: new Date("2100-01-01"),
        version: 3,
      },
      new Date(),
    );
    expect(original).toEqual({ amountMinor: 999n, currency: "GBP" });
  });
  it("converts unambiguous local time to UTC", () => {
    expect(
      engine.localToUtc("2026-06-01T10:00", "Europe/London").toISOString(),
    ).toBe("2026-06-01T09:00:00.000Z");
  });
  it("rejects nonexistent DST time", () => {
    expect(() =>
      engine.localToUtc("2026-03-29T01:30", "Europe/London"),
    ).toThrow("Non-existent");
  });
  it("requires explicit disambiguation for repeated DST time", () => {
    expect(() =>
      engine.localToUtc("2026-10-25T01:30", "Europe/London"),
    ).toThrow("Ambiguous");
    expect(
      engine.localToUtc("2026-10-25T01:30", "Europe/London", "LATER"),
    ).toBeInstanceOf(Date);
  });
  it("rejects timezone guessing and unsupported tenant timezone", () => {
    expect(() => engine.validateTimezone("GMT+3")).toThrow("IANA");
    expect(() =>
      engine.resolve(policy, { timezone: "America/New_York" }),
    ).toThrow("Unsupported timezone");
  });
  it("formats canonical values only at the presentation boundary", () => {
    expect(engine.format(1234.5, "de-DE", "DECIMAL")).toContain("1.234,5");
    expect(
      engine.format(
        new Date("2026-01-02T12:00Z"),
        "en-GB",
        "DATE",
        "Europe/London",
      ),
    ).toBeTruthy();
  });
  it("canonicalizes global phone input as E.164", () => {
    expect(engine.canonicalPhone("+44", "07700 900123")).toEqual({
      countryCallingCode: "+44",
      nationalNumber: "7700900123",
      e164: "+447700900123",
    });
  });
  it("validates addresses from market policy rather than country branches", () => {
    expect(() =>
      engine.validateAddress(
        { countryCode: "GB", locality: "London", addressLine1: "1 High St" },
        policy.addressPolicy,
      ),
    ).toThrow("Administrative");
    expect(
      engine.validateAddress(
        {
          countryCode: "GB",
          administrativeArea: "London",
          locality: "London",
          postalCode: "SW1A 1AA",
          addressLine1: "1 High St",
        },
        policy.addressPolicy,
      ).postalCode,
    ).toBe("SW1A 1AA");
  });
  it("converts metric and imperial measurements with bounded precision", () => {
    expect(engine.convertMeasurement(2.54, "CM", "IN")).toBe(1);
    expect(engine.convertMeasurement(1, "KG", "LB")).toBe(2.2046);
    expect(() => engine.convertMeasurement(1, "KG", "CM")).toThrow("mismatch");
  });
  it("enforces market feature flags server-side", () => {
    expect(() => engine.assertFeature(policy, "COMMERCE")).toThrow(
      "unavailable",
    );
    expect(engine.assertFeature(policy, "AI")).toBeUndefined();
  });
  it("enforces regional payment method and currency capabilities", () => {
    expect(engine.assertPayment(policy, "CARD", "GBP")).toBeUndefined();
    expect(() => engine.assertPayment(policy, "WALLET", "GBP")).toThrow(
      "unavailable",
    );
  });
  it("enforces deterministic booking lead and horizon policies", () => {
    const now = new Date("2026-01-01T00:00Z");
    expect(() =>
      engine.assertBookingWindow(policy, new Date("2026-01-01T00:30Z"), now),
    ).toThrow("outside");
    expect(
      engine.assertBookingWindow(policy, new Date("2026-01-02T00:00Z"), now),
    ).toBeUndefined();
  });
  it("uses controlled translation fallback and never returns keys as prose", () => {
    expect(
      engine.translate("booking.title", "de-DE", ["en-GB"], {
        "en-GB": { "booking.title": "Booking" },
      }),
    ).toEqual({ value: "Booking", locale: "en-GB", fallbackUsed: true });
    expect(() => engine.translate("missing", "de-DE", ["en-GB"], {})).toThrow(
      NotFoundException,
    );
  });
  it("calculates inclusive and exclusive tax using integer arithmetic", () => {
    expect(
      engine.calculateTax(engine.money(10000n, "GBP"), 2000n, false),
    ).toEqual({
      netMinor: 10000n,
      taxMinor: 2000n,
      grossMinor: 12000n,
      currency: "GBP",
    });
    expect(
      engine.calculateTax(engine.money(12000n, "GBP"), 2000n, true).netMinor,
    ).toBe(10000n);
  });
});
