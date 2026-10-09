import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DateTime } from "luxon";
import type {
  FxRate,
  GlobalAddress,
  GlobalizationPreferences,
  MarketPolicy,
  MeasurementSystem,
  Money,
  PaymentMethod,
  ResolvedGlobalizationContext,
} from "./globalization.types.js";

@Injectable()
export class GlobalizationEngine {
  validateLocale(value: string): string {
    try {
      const locale = new Intl.Locale(value);
      if (!locale.language || !locale.region) throw new Error();
      return locale.toString();
    } catch {
      throw new BadRequestException("Invalid BCP 47 locale");
    }
  }
  validateCurrency(value: string): string {
    const currency = value.toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency))
      throw new BadRequestException("Invalid ISO 4217 currency");
    try {
      new Intl.NumberFormat("en", { style: "currency", currency }).format(0);
    } catch {
      throw new BadRequestException("Invalid ISO 4217 currency");
    }
    return currency;
  }
  validateTimezone(value: string): string {
    if (!value.includes("/"))
      throw new BadRequestException("Invalid IANA timezone");
    try {
      new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
      return value;
    } catch {
      throw new BadRequestException("Invalid IANA timezone");
    }
  }
  resolve(
    policy: MarketPolicy,
    user: GlobalizationPreferences = {},
    tenant: GlobalizationPreferences = {},
  ): ResolvedGlobalizationContext {
    const requestedLocale =
      user.locale ?? tenant.locale ?? policy.defaultLocale;
    const locale = this.validateLocale(requestedLocale);
    if (!policy.supportedLocales.includes(locale))
      throw new BadRequestException("Unsupported locale for market");
    const currency = this.validateCurrency(
      user.currency ?? tenant.currency ?? policy.defaultCurrency,
    );
    if (!policy.supportedCurrencies.includes(currency))
      throw new BadRequestException("Unsupported currency for market");
    const timezone = this.validateTimezone(
      user.timezone ?? tenant.timezone ?? policy.defaultTimezone,
    );
    if (!policy.supportedTimezones.includes(timezone))
      throw new BadRequestException("Unsupported timezone for market");
    const language =
      user.language ?? tenant.language ?? new Intl.Locale(locale).language;
    return {
      marketId: policy.marketId,
      marketKey: policy.marketKey,
      marketConfigurationId: policy.id,
      marketConfigurationVersion: policy.version,
      countryCode: policy.countryCode,
      locale,
      language,
      currency,
      timezone,
      measurementSystem:
        user.measurementSystem ??
        tenant.measurementSystem ??
        policy.measurementSystem,
    };
  }
  money(amountMinor: bigint, currency: string): Money {
    if (typeof amountMinor !== "bigint")
      throw new BadRequestException("Money requires integer minor units");
    return { amountMinor, currency: this.validateCurrency(currency) };
  }
  add(left: Money, right: Money): Money {
    if (left.currency !== right.currency)
      throw new ConflictException("Currency mismatch");
    return {
      amountMinor: left.amountMinor + right.amountMinor,
      currency: left.currency,
    };
  }
  convert(value: Money, rate: FxRate, at: Date): Money {
    if (value.currency !== rate.baseCurrency)
      throw new ConflictException("FX base currency mismatch");
    if (at < rate.effectiveAt || at >= rate.expiresAt)
      throw new ConflictException("FX rate is not valid at requested instant");
    const [whole = "", fraction = ""] = rate.rate.split(".");
    if (
      !/^\d+$/.test(whole) ||
      !/^\d*$/.test(fraction) ||
      (Number(whole) === 0 && !/[1-9]/.test(fraction))
    )
      throw new BadRequestException("Invalid FX rate");
    const denominator = 10n ** BigInt(fraction.length);
    const numerator = BigInt(`${whole}${fraction}`);
    const scaled = value.amountMinor * numerator;
    const rounded = (scaled + denominator / 2n) / denominator;
    return { amountMinor: rounded, currency: rate.quoteCurrency };
  }
  localToUtc(
    localIso: string,
    timezone: string,
    disambiguation?: "EARLIER" | "LATER",
  ): Date {
    this.validateTimezone(timezone);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(localIso))
      throw new BadRequestException(
        "Local datetime must not contain an offset",
      );
    const parsed = DateTime.fromISO(localIso, { zone: timezone });
    if (
      !parsed.isValid ||
      parsed.toFormat(
        localIso.length === 16 ? "yyyy-MM-dd'T'HH:mm" : "yyyy-MM-dd'T'HH:mm:ss",
      ) !== localIso
    )
      throw new BadRequestException("Non-existent local time");
    const offsets = parsed.getPossibleOffsets();
    if (offsets.length > 1 && !disambiguation)
      throw new ConflictException(
        "Ambiguous local time requires disambiguation",
      );
    const selected =
      disambiguation === "LATER" ? offsets.at(-1)! : (offsets[0] ?? parsed);
    return selected.toUTC().toJSDate();
  }
  format(
    value: Date | number | Money,
    locale: string,
    kind: "DATE" | "TIME" | "DATETIME" | "DECIMAL" | "PERCENT" | "CURRENCY",
    timezone = "UTC",
  ): string {
    this.validateLocale(locale);
    if (value instanceof Date) {
      this.validateTimezone(timezone);
      const options: Intl.DateTimeFormatOptions =
        kind === "DATE"
          ? { dateStyle: "short", timeZone: timezone }
          : kind === "TIME"
            ? { timeStyle: "short", timeZone: timezone }
            : { dateStyle: "short", timeStyle: "short", timeZone: timezone };
      return new Intl.DateTimeFormat(locale, options).format(value);
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value))
        throw new BadRequestException("Non-finite number");
      return new Intl.NumberFormat(
        locale,
        kind === "PERCENT" ? { style: "percent" } : {},
      ).format(value);
    }
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: value.currency,
    }).format(Number(value.amountMinor) / 100);
  }
  canonicalPhone(countryCallingCode: string, nationalNumber: string) {
    const callingCode = countryCallingCode.replace(/^\+/, "");
    const national = nationalNumber.replace(/[\s().-]/g, "").replace(/^0+/, "");
    if (
      !/^\d{1,3}$/.test(callingCode) ||
      !/^\d{4,14}$/.test(national) ||
      callingCode.length + national.length > 15
    )
      throw new BadRequestException("Invalid international phone number");
    return {
      countryCallingCode: `+${callingCode}`,
      nationalNumber: national,
      e164: `+${callingCode}${national}`,
    };
  }
  validateAddress(
    address: GlobalAddress,
    policy: MarketPolicy["addressPolicy"],
  ): GlobalAddress {
    if (
      !/^[A-Z]{2}$/.test(address.countryCode) ||
      !address.locality.trim() ||
      !address.addressLine1.trim()
    )
      throw new BadRequestException("Invalid address");
    if (
      policy.administrativeAreaRequired &&
      !address.administrativeArea?.trim()
    )
      throw new BadRequestException("Administrative area is required");
    if (policy.postalCodeRequired && !address.postalCode?.trim())
      throw new BadRequestException("Postal code is required");
    if (
      address.postalCode &&
      policy.postalCodePattern &&
      !new RegExp(policy.postalCodePattern).test(address.postalCode)
    )
      throw new BadRequestException("Invalid postal code");
    return address;
  }
  convertMeasurement(
    value: number,
    from: "CM" | "IN" | "KG" | "LB",
    to: "CM" | "IN" | "KG" | "LB",
  ) {
    if (!Number.isFinite(value) || value < 0)
      throw new BadRequestException("Invalid measurement");
    const dimensions: Record<string, "LENGTH" | "MASS"> = {
      CM: "LENGTH",
      IN: "LENGTH",
      KG: "MASS",
      LB: "MASS",
    };
    if (dimensions[from] !== dimensions[to])
      throw new ConflictException("Measurement type mismatch");
    const factors: Record<string, number> = {
      CM: 1,
      IN: 2.54,
      KG: 1,
      LB: 0.45359237,
    };
    return (
      Math.round(((value * factors[from]!) / factors[to]!) * 10000) / 10000
    );
  }
  assertFeature(policy: MarketPolicy, feature: string) {
    if (policy.featureFlags[feature] !== true)
      throw new ConflictException("Feature is unavailable in market");
  }
  assertPayment(policy: MarketPolicy, method: PaymentMethod, currency: string) {
    if (
      !policy.supportedPaymentMethods.includes(method) ||
      !policy.supportedCurrencies.includes(currency)
    )
      throw new ConflictException(
        "Payment capability is unavailable in market",
      );
  }
  assertBookingWindow(policy: MarketPolicy, startsAt: Date, now = new Date()) {
    const minutes = (startsAt.getTime() - now.getTime()) / 60000;
    if (
      minutes < policy.bookingPolicy.minimumLeadMinutes ||
      minutes > policy.bookingPolicy.maximumAdvanceDays * 1440
    )
      throw new ConflictException("Booking is outside market policy window");
  }
  measurementSystem(value: string): MeasurementSystem {
    if (value !== "METRIC" && value !== "IMPERIAL")
      throw new BadRequestException("Invalid measurement system");
    return value;
  }
  translate(
    key: string,
    requestedLocale: string,
    fallbackLocales: readonly string[],
    catalog: Readonly<Record<string, Readonly<Record<string, string>>>>,
  ) {
    this.validateLocale(requestedLocale);
    for (const locale of [requestedLocale, ...fallbackLocales]) {
      const value = catalog[locale]?.[key];
      if (value)
        return { value, locale, fallbackUsed: locale !== requestedLocale };
    }
    throw new NotFoundException("Translation key is unavailable");
  }
  calculateTax(net: Money, rateBasisPoints: bigint, inclusive: boolean) {
    if (rateBasisPoints < 0n || rateBasisPoints > 10000n)
      throw new BadRequestException("Invalid tax rate");
    const divisor = 10000n;
    const taxMinor = inclusive
      ? (net.amountMinor * rateBasisPoints + (divisor + rateBasisPoints) / 2n) /
        (divisor + rateBasisPoints)
      : (net.amountMinor * rateBasisPoints + divisor / 2n) / divisor;
    return {
      netMinor: inclusive ? net.amountMinor - taxMinor : net.amountMinor,
      taxMinor,
      grossMinor: inclusive ? net.amountMinor : net.amountMinor + taxMinor,
      currency: net.currency,
    };
  }
}
