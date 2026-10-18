/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionsService } from "../auth/permissions.service.js";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import { AuditService } from "../infrastructure/audit.service.js";
import { GlobalizationEngine } from "./globalization-engine.service.js";
import type {
  GlobalizationPreferences,
  MarketPolicy,
  PaymentMethod,
  ResolvedGlobalizationContext,
} from "./globalization.types.js";

type MarketConfigRow = {
  id: string;
  marketId: string;
  version: number;
  defaultLocale: string;
  supportedLocales: string[];
  defaultCurrency: string;
  supportedCurrencies: string[];
  defaultTimezone: string;
  supportedTimezones: string[];
  measurementSystem: string;
  featureFlags: unknown;
  supportedPaymentMethods: string[];
  bookingPolicy: unknown;
  addressPolicy: unknown;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  market: { key: string; countryCode: string };
};
type TenantProfileRow = {
  id: string;
  businessId: string;
  marketId: string;
  marketConfigurationId: string;
  preferredLocale: string;
  preferredCurrency: string;
  preferredTimezone: string;
  measurementSystem: string;
  marketConfiguration: MarketConfigRow;
};
type Delegate<T> = {
  findFirst(args: unknown): Promise<T | null>;
  findMany(args: unknown): Promise<T[]>;
  create(args: unknown): Promise<T>;
  update(args: unknown): Promise<T>;
};
type GlobalizationDb = PrismaService & {
  marketConfiguration: Delegate<MarketConfigRow>;
  tenantGlobalizationProfile: Delegate<TenantProfileRow>;
  marketCategoryAvailability: Delegate<{ enabled: boolean }>;
};
@Injectable()
export class GlobalizationService {
  private readonly logger = new Logger(GlobalizationService.name);
  private readonly cache = new Map<
    string,
    { expiresAt: number; policy: MarketPolicy }
  >();
  private readonly dbx: GlobalizationDb;
  constructor(
    @Inject(PRISMA_SERVICE) db: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly audit: AuditService,
    private readonly engine: GlobalizationEngine,
  ) {
    this.dbx = db as GlobalizationDb;
  }

  async resolveForBusiness(
    businessId: string,
    user: GlobalizationPreferences = {},
  ): Promise<ResolvedGlobalizationContext> {
    const profile = await this.dbx.tenantGlobalizationProfile.findFirst({
      where: { businessId },
      include: { marketConfiguration: { include: { market: true } } },
    });
    if (!profile) {
      this.logger.warn({
        event: "market_resolution_failure",
        tenantId: businessId,
      });
      throw new NotFoundException(
        "Tenant globalization profile is not configured",
      );
    }
    const policy = this.policy(profile.marketConfiguration);
    return this.engine.resolve(policy, user, {
      locale: profile.preferredLocale,
      currency: profile.preferredCurrency,
      timezone: profile.preferredTimezone,
      measurementSystem: this.engine.measurementSystem(
        profile.measurementSystem,
      ),
    });
  }
  async resolveForBookingIfConfigured(
    businessId: string,
    startsAt: Date,
    preferences: GlobalizationPreferences = {},
  ) {
    const profile = await this.dbx.tenantGlobalizationProfile.findFirst({
      where: { businessId },
      include: { marketConfiguration: { include: { market: true } } },
    });
    if (!profile) return null; // explicit compatibility boundary for tenants created before globalization
    const policy = this.policy(profile.marketConfiguration);
    const context = this.engine.resolve(policy, preferences, {
      locale: profile.preferredLocale,
      currency: profile.preferredCurrency,
      timezone: profile.preferredTimezone,
      measurementSystem: this.engine.measurementSystem(
        profile.measurementSystem,
      ),
    });
    this.engine.assertBookingWindow(policy, startsAt);
    return context;
  }
  async authorizedContext(
    user: AuthenticatedUser,
    businessId: string,
    preferences: GlobalizationPreferences = {},
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "settings:read",
    );
    return this.resolveForBusiness(businessId, preferences);
  }
  validateTimezone(timezone: string) {
    return this.engine.validateTimezone(timezone);
  }
  async configureTenant(
    user: AuthenticatedUser,
    businessId: string,
    input: {
      marketKey: string;
      locale: string;
      currency: string;
      timezone: string;
      measurementSystem: string;
    },
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "settings:update",
    );
    const row = await this.activeConfiguration(input.marketKey);
    const policy = this.policy(row);
    const resolved = this.engine.resolve(policy, {
      locale: input.locale,
      currency: input.currency,
      timezone: input.timezone,
      measurementSystem: this.engine.measurementSystem(input.measurementSystem),
    });
    const existing = await this.dbx.tenantGlobalizationProfile.findFirst({
      where: { businessId },
    });
    const data = {
      marketId: row.marketId,
      marketConfigurationId: row.id,
      preferredLocale: resolved.locale,
      preferredCurrency: resolved.currency,
      preferredTimezone: resolved.timezone,
      measurementSystem: resolved.measurementSystem,
    };
    const saved = existing
      ? await this.dbx.tenantGlobalizationProfile.update({
          where: { id: existing.id },
          data,
        })
      : await this.dbx.tenantGlobalizationProfile.create({
          data: { businessId, ...data },
        });
    await this.audit.record({
      businessId,
      actorId: user.id,
      actorType: user.role,
      action: "globalization.tenant_configuration_changed",
      resourceType: "TenantGlobalizationProfile",
      resourceId: saved.id,
      result: "SUCCEEDED",
      metadata: {
        marketId: row.marketId,
        marketConfigurationId: row.id,
        marketConfigurationVersion: row.version,
      },
    });
    return saved;
  }
  async activeConfiguration(marketKey: string) {
    const now = new Date();
    const cacheKey = marketKey.toLowerCase();
    const cached = this.cache.get(cacheKey);
    if (
      cached &&
      cached.expiresAt > Date.now() &&
      cached.policy.effectiveFrom <= now &&
      (!cached.policy.effectiveTo || cached.policy.effectiveTo > now)
    )
      return this.rowFromPolicy(cached.policy);
    const row = await this.dbx.marketConfiguration.findFirst({
      where: {
        market: { key: cacheKey, status: "ACTIVE" },
        status: "ACTIVE",
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      include: { market: true },
      orderBy: { version: "desc" },
    });
    if (!row) {
      this.logger.warn({
        event: "market_resolution_failure",
        marketKey: cacheKey,
      });
      throw new NotFoundException("Unsupported market");
    }
    this.cache.set(cacheKey, {
      expiresAt: Date.now() + 60_000,
      policy: this.policy(row),
    });
    return row;
  }
  async assertCategoryAvailable(
    marketId: string,
    categoryId: string,
    serviceTypeId?: string,
  ) {
    const availability = await this.dbx.marketCategoryAvailability.findFirst({
      where: { marketId, categoryId, serviceTypeId: serviceTypeId ?? null },
    });
    if (availability?.enabled !== true)
      throw new ForbiddenException("Category is unavailable in market");
  }
  private policy(row: MarketConfigRow): MarketPolicy {
    const cached = this.cache.get(row.market.key);
    if (cached?.policy.id === row.id) return cached.policy;
    const featureFlags = this.recordOfBoolean(
      row.featureFlags,
      "feature flags",
    );
    const bookingPolicy = row.bookingPolicy as MarketPolicy["bookingPolicy"];
    const addressPolicy = row.addressPolicy as MarketPolicy["addressPolicy"];
    if (
      !bookingPolicy ||
      !Number.isInteger(bookingPolicy.minimumLeadMinutes) ||
      !addressPolicy
    )
      throw new BadRequestException("Invalid market policy configuration");
    return {
      id: row.id,
      marketId: row.marketId,
      marketKey: row.market.key,
      countryCode: row.market.countryCode,
      version: row.version,
      defaultLocale: row.defaultLocale,
      supportedLocales: row.supportedLocales,
      defaultCurrency: row.defaultCurrency,
      supportedCurrencies: row.supportedCurrencies,
      defaultTimezone: row.defaultTimezone,
      supportedTimezones: row.supportedTimezones,
      measurementSystem: this.engine.measurementSystem(row.measurementSystem),
      featureFlags,
      supportedPaymentMethods: row.supportedPaymentMethods as PaymentMethod[],
      bookingPolicy,
      addressPolicy,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
    };
  }
  private recordOfBoolean(
    value: unknown,
    label: string,
  ): Record<string, boolean> {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.values(value).some((v) => typeof v !== "boolean")
    )
      throw new BadRequestException(`Invalid ${label}`);
    return value as Record<string, boolean>;
  }
  private rowFromPolicy(policy: MarketPolicy): MarketConfigRow {
    return {
      id: policy.id,
      marketId: policy.marketId,
      version: policy.version,
      defaultLocale: policy.defaultLocale,
      supportedLocales: [...policy.supportedLocales],
      defaultCurrency: policy.defaultCurrency,
      supportedCurrencies: [...policy.supportedCurrencies],
      defaultTimezone: policy.defaultTimezone,
      supportedTimezones: [...policy.supportedTimezones],
      measurementSystem: policy.measurementSystem,
      featureFlags: policy.featureFlags,
      supportedPaymentMethods: [...policy.supportedPaymentMethods],
      bookingPolicy: policy.bookingPolicy,
      addressPolicy: policy.addressPolicy,
      effectiveFrom: policy.effectiveFrom,
      effectiveTo: policy.effectiveTo,
      market: { key: policy.marketKey, countryCode: policy.countryCode },
    };
  }
}
