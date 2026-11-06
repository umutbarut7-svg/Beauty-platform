/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionsService } from "../auth/permissions.service.js";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import { GlobalizationEngine } from "../globalization/globalization-engine.service.js";
import { AuditService } from "../infrastructure/audit.service.js";
import { requestContext } from "../infrastructure/request-context.js";
import { MonetizationEngine } from "./monetization-engine.service.js";
import type { SubscriptionStatus } from "./monetization.types.js";
@Injectable()
export class MonetizationService {
  private readonly logger = new Logger(MonetizationService.name);
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly audit: AuditService,
    private readonly engine: MonetizationEngine,
    private readonly globalization: GlobalizationEngine,
  ) {}
  async plans(user: AuthenticatedUser, businessId: string) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "financial:read",
    );
    const profile = await this.db.tenantGlobalizationProfile.findFirst({
      where: { businessId },
      select: { marketId: true },
    });
    if (!profile)
      throw new NotFoundException("Tenant market is not configured");
    return this.db.monetizationPlan.findMany({
      where: { marketId: profile.marketId, status: "ACTIVE" },
      include: {
        versions: {
          where: { status: "ACTIVE" },
          orderBy: { version: "desc" },
          take: 1,
          include: { entitlements: true, prices: true },
        },
      },
    });
  }
  async subscription(user: AuthenticatedUser, businessId: string) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "financial:read",
    );
    return this.db.monetizationSubscription.findFirst({
      where: { businessId },
      include: { planVersion: { include: { entitlements: true } } },
    });
  }
  async transitionSubscription(
    user: AuthenticatedUser,
    businessId: string,
    subscriptionId: string,
    next: SubscriptionStatus,
    reason: string,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "financial:manage",
    );
    return this.db.$transaction(async (tx: PrismaService) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        `subscription:${businessId}:${subscriptionId}`,
      );
      const current = await tx.monetizationSubscription.findFirst({
        where: { id: subscriptionId, businessId },
      });
      if (!current) throw new NotFoundException("Subscription not found");
      this.engine.transition(current.status, next);
      const updated = await tx.monetizationSubscription.update({
        where: { id: current.id },
        data: {
          status: next,
          version: { increment: 1 },
          ...(next === "CANCELLED" ? { cancelledAt: new Date() } : {}),
        },
      });
      await tx.subscriptionChange.create({
        data: {
          businessId,
          subscriptionId,
          fromStatus: current.status,
          toStatus: next,
          reason,
          actorId: user.id,
        },
      });
      await this.audit.record({
        businessId,
        actorId: user.id,
        actorType: user.role,
        action: "financial.subscription_transition",
        resourceType: "MonetizationSubscription",
        resourceId: subscriptionId,
        result: "SUCCEEDED",
        metadata: { fromStatus: current.status, toStatus: next, reason },
      });
      return updated;
    });
  }
  async assertEntitlement(businessId: string, key: string, requested = 1n) {
    const subscription = await this.db.monetizationSubscription.findFirst({
      where: { businessId, status: { in: ["TRIAL", "ACTIVE"] } },
      include: {
        planVersion: { include: { entitlements: { where: { key } } } },
      },
    });
    const entitlement = subscription?.planVersion.entitlements[0];
    if (!entitlement) throw new ConflictException("Entitlement is unavailable");
    if (
      entitlement.limitValue !== null &&
      BigInt(entitlement.limitValue) < requested
    )
      throw new ConflictException("Entitlement limit exceeded");
    return entitlement;
  }
  async ingestUsage(
    user: AuthenticatedUser,
    businessId: string,
    input: {
      marketId: string;
      metric: string;
      quantity: bigint;
      source: string;
      idempotencyKey: string;
      occurredAt: Date;
    },
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "financial:manage",
    );
    if (input.quantity <= 0n)
      throw new BadRequestException("Usage quantity must be positive");
    return this.db.$transaction(async (tx: PrismaService) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        `usage:${businessId}:${input.idempotencyKey}`,
      );
      const prior = await tx.monetizationUsageRecord.findFirst({
        where: { businessId, idempotencyKey: input.idempotencyKey },
      });
      if (prior) {
        this.logger.log({
          event: "financial_idempotent_replay",
          businessId,
          operation: "usage",
          correlationId: requestContext.get()?.requestId,
        });
        return prior;
      }
      return tx.monetizationUsageRecord.create({
        data: {
          businessId,
          ...input,
          correlationId: requestContext.get()?.requestId,
        },
      });
    });
  }
  async createLedgerEntry(
    user: AuthenticatedUser,
    businessId: string,
    input: {
      type: string;
      amountMinor: bigint;
      currency: string;
      revenueStream?: string;
      sourceType: string;
      sourceId: string;
      idempotencyKey: string;
      reason: string;
      reversalOfId?: string;
    },
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "financial:manage",
    );
    this.globalization.money(input.amountMinor, input.currency);
    if (input.amountMinor <= 0n)
      throw new BadRequestException("Ledger amount must be positive");
    return this.db.$transaction(async (tx: PrismaService) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        `ledger:${businessId}:${input.idempotencyKey}`,
      );
      const prior = await tx.financialLedgerEntry.findFirst({
        where: { businessId, idempotencyKey: input.idempotencyKey },
      });
      if (prior) return prior;
      const entry = await tx.financialLedgerEntry.create({
        data: {
          businessId,
          ...input,
          actorId: user.id,
          correlationId: requestContext.get()?.requestId,
        },
      });
      await this.audit.record({
        businessId,
        actorId: user.id,
        actorType: user.role,
        action: "financial.ledger_entry_created",
        resourceType: "FinancialLedgerEntry",
        resourceId: entry.id,
        result: "SUCCEEDED",
        metadata: {
          type: input.type,
          reason: input.reason,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
        },
      });
      return entry;
    });
  }
  async refund(
    user: AuthenticatedUser,
    businessId: string,
    input: {
      originalEntryId: string;
      amountMinor: bigint;
      idempotencyKey: string;
      reason: string;
    },
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "financial:manage",
    );
    return this.db.$transaction(async (tx: PrismaService) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        `refund:${businessId}:${input.originalEntryId}`,
      );
      const prior = await tx.refundRecord.findFirst({
        where: { businessId, idempotencyKey: input.idempotencyKey },
      });
      if (prior) return prior;
      const original = await tx.financialLedgerEntry.findFirst({
        where: { id: input.originalEntryId, businessId, type: "CHARGE" },
      });
      if (!original) throw new NotFoundException("Charge not found");
      const refunded = await tx.refundRecord.aggregate({
        where: { businessId, originalEntryId: original.id },
        _sum: { amountMinor: true },
      });
      if (
        input.amountMinor <= 0n ||
        BigInt(refunded._sum.amountMinor ?? 0) + input.amountMinor >
          BigInt(original.amountMinor)
      )
        throw new ConflictException("Refund exceeds refundable amount");
      const reversal = await tx.financialLedgerEntry.create({
        data: {
          businessId,
          type: "REFUND",
          amountMinor: input.amountMinor,
          currency: original.currency,
          sourceType: "REFUND",
          sourceId: original.id,
          idempotencyKey: `ledger:${input.idempotencyKey}`,
          reason: input.reason,
          actorId: user.id,
          reversalOfId: original.id,
        },
      });
      const record = await tx.refundRecord.create({
        data: {
          businessId,
          originalEntryId: original.id,
          ledgerEntryId: reversal.id,
          amountMinor: input.amountMinor,
          currency: original.currency,
          idempotencyKey: input.idempotencyKey,
          reason: input.reason,
          actorId: user.id,
        },
      });
      await this.audit.record({
        businessId,
        actorId: user.id,
        actorType: user.role,
        action: "financial.refund_created",
        resourceType: "RefundRecord",
        resourceId: record.id,
        result: "SUCCEEDED",
        metadata: { originalEntryId: original.id, reason: input.reason },
      });
      return record;
    });
  }
  async summary(user: AuthenticatedUser, businessId: string) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "financial:read",
    );
    const rows = await this.db.financialLedgerEntry.findMany({
      where: { businessId },
      select: { type: true, amountMinor: true, currency: true },
    });
    const currencies = new Set(
      rows.map((x: { currency: string }) => x.currency),
    );
    if (currencies.size > 1)
      return {
        status: "MULTI_CURRENCY_REQUIRES_FX",
        currencies: [...currencies],
      };
    const currency = [...currencies][0] ?? null;
    const amount = (types: string[]) =>
      rows
        .filter((x: { type: string }) => types.includes(x.type))
        .reduce(
          (sum: bigint, x: { amountMinor: bigint }) =>
            sum + BigInt(x.amountMinor),
          0n,
        );
    return {
      status: rows.length ? "AVAILABLE" : "INSUFFICIENT_DATA",
      currency,
      grossRevenueMinor: amount(["CHARGE"]).toString(),
      refundsMinor: amount(["REFUND"]).toString(),
      platformRevenueMinor: amount(["COMMISSION", "PLATFORM_FEE"]).toString(),
      netRevenueMinor: (
        amount(["CHARGE"]) - amount(["REFUND", "COMMISSION", "PLATFORM_FEE"])
      ).toString(),
    };
  }
  forecast(
    user: AuthenticatedUser,
    businessId: string,
    periods: Array<{
      amountMinor: bigint;
      currency: string;
      evidenceId: string;
    }>,
    horizonDays: number,
  ) {
    return this.permissions
      .assertBusinessAccess(user, businessId, "financial:read")
      .then(() =>
        this.engine.forecast(
          periods.map((x) => ({
            amount: this.globalization.money(x.amountMinor, x.currency),
            evidenceId: x.evidenceId,
          })),
          horizonDays,
        ),
      );
  }
  async settlements(user: AuthenticatedUser, businessId: string) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "financial:read",
    );
    return this.db.financialSettlement.findMany({
      where: { businessId },
      orderBy: { periodEnd: "desc" },
      take: 100,
    });
  }
  async credits(user: AuthenticatedUser, businessId: string) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "financial:read",
    );
    return this.db.financialCreditGrant.findMany({
      where: { businessId },
      include: { consumptions: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
  async processPaymentWebhook(
    provider: PaymentProvider,
    rawBody: Buffer,
    signature: string,
  ) {
    const event = await provider.verifyAndParseWebhook(rawBody, signature);
    if (!event.eventId || !event.tenantReference || !event.resourceReference)
      throw new BadRequestException("Invalid payment webhook event");
    return this.db.$transaction(async (tx: PrismaService) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        `payment-webhook:${event.eventId}`,
      );
      const existing = await tx.paymentWebhookEvent.findFirst({
        where: { eventId: event.eventId },
      });
      if (existing) return existing;
      const business = await tx.business.findUnique({
        where: { id: event.tenantReference },
        select: { id: true },
      });
      if (!business) throw new NotFoundException("Webhook tenant not found");
      return tx.paymentWebhookEvent.create({
        data: {
          businessId: business.id,
          eventId: event.eventId,
          eventType: event.type,
          resourceReference: event.resourceReference,
          payloadHash: "verified-by-provider",
        },
      });
    });
  }
}
export interface PaymentProvider {
  createPayment(input: {
    amountMinor: bigint;
    currency: string;
    providerCustomerRef: string;
  }): Promise<{ providerPaymentRef: string; status: string }>;
  refundPayment(input: {
    providerPaymentRef: string;
    amountMinor: bigint;
    idempotencyKey: string;
  }): Promise<{ providerRefundRef: string }>;
  createCustomer(input: {
    externalReference: string;
  }): Promise<{ providerCustomerRef: string }>;
  createSubscription(input: {
    providerCustomerRef: string;
    priceReference: string;
  }): Promise<{ providerSubscriptionRef: string }>;
  cancelSubscription(providerSubscriptionRef: string): Promise<void>;
  retrievePayment(providerPaymentRef: string): Promise<{ status: string }>;
  verifyAndParseWebhook(
    rawBody: Buffer,
    signature: string,
  ): Promise<{
    eventId: string;
    type: string;
    tenantReference: string;
    resourceReference: string;
  }>;
}
