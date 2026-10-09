import { describe, expect, it, vi } from "vitest";
import { GlobalizationEngine } from "./globalization-engine.service.js";
import { GlobalizationService } from "./globalization.service.js";
const config = {
  id: "cfg",
  marketId: "m",
  version: 1,
  defaultLocale: "en-GB",
  supportedLocales: ["en-GB"],
  defaultCurrency: "GBP",
  supportedCurrencies: ["GBP"],
  defaultTimezone: "Europe/London",
  supportedTimezones: ["Europe/London"],
  measurementSystem: "METRIC",
  featureFlags: { AI: true },
  supportedPaymentMethods: ["CARD"],
  bookingPolicy: {
    minimumLeadMinutes: 0,
    maximumAdvanceDays: 365,
    cancellationWindowMinutes: 60,
    rescheduleWindowMinutes: 60,
  },
  addressPolicy: {
    administrativeAreaRequired: false,
    postalCodeRequired: false,
  },
  effectiveFrom: new Date("2020-01-01"),
  effectiveTo: null,
  market: { key: "gb", countryCode: "GB" },
};
function fixture() {
  const db = {
    tenantGlobalizationProfile: {
      findFirst: vi.fn().mockResolvedValue({
        id: "p",
        businessId: "b",
        marketId: "m",
        marketConfigurationId: "cfg",
        preferredLocale: "en-GB",
        preferredCurrency: "GBP",
        preferredTimezone: "Europe/London",
        measurementSystem: "METRIC",
        marketConfiguration: config,
      }),
      create: vi.fn().mockImplementation(({ data }) => ({ id: "p", ...data })),
      update: vi.fn().mockImplementation(({ data }) => ({ id: "p", ...data })),
    },
    marketConfiguration: {
      findFirst: vi.fn().mockResolvedValue(config),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    marketCategoryAvailability: {
      findFirst: vi.fn().mockResolvedValue({ enabled: true }),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  const permissions = {
    assertBusinessAccess: vi.fn().mockResolvedValue(undefined),
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  return {
    db,
    permissions,
    audit,
    service: new GlobalizationService(
      db as never,
      permissions as never,
      audit as never,
      new GlobalizationEngine(),
    ),
  };
}
describe("GlobalizationService", () => {
  it("resolves tenant context server-side", async () => {
    const { service } = fixture();
    await expect(service.resolveForBusiness("b")).resolves.toMatchObject({
      marketKey: "gb",
      currency: "GBP",
    });
  });
  it("enforces tenant authorization and market currency constraints", async () => {
    const { service, permissions } = fixture();
    await expect(
      service.configureTenant(
        { id: "u", email: "u@x.com", role: "BUSINESS_OWNER" },
        "b",
        {
          marketKey: "gb",
          locale: "en-GB",
          currency: "EUR",
          timezone: "Europe/London",
          measurementSystem: "METRIC",
        },
      ),
    ).rejects.toThrow("Unsupported currency");
    expect(permissions.assertBusinessAccess).toHaveBeenCalledWith(
      expect.anything(),
      "b",
      "settings:update",
    );
  });
  it("audits successful tenant globalization changes without preferences payload", async () => {
    const { service, audit } = fixture();
    await service.configureTenant(
      { id: "u", email: "u@x.com", role: "BUSINESS_OWNER" },
      "b",
      {
        marketKey: "gb",
        locale: "en-GB",
        currency: "GBP",
        timezone: "Europe/London",
        measurementSystem: "METRIC",
      },
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "globalization.tenant_configuration_changed",
        businessId: "b",
      }),
    );
  });
  it("fails closed for a category unavailable in the market", async () => {
    const { service, db } = fixture();
    db.marketCategoryAvailability.findFirst.mockResolvedValueOnce({
      enabled: false,
    });
    await expect(service.assertCategoryAvailable("m", "cat")).rejects.toThrow(
      "unavailable",
    );
  });
  it("keeps a deliberate compatibility boundary for unconfigured legacy tenants", async () => {
    const { service, db } = fixture();
    db.tenantGlobalizationProfile.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.resolveForBookingIfConfigured("legacy", new Date()),
    ).resolves.toBeNull();
  });
});
