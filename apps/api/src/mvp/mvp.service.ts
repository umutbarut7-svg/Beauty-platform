/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionsService } from "../auth/permissions.service.js";
import { AppointmentsService } from "../appointments/appointments.service.js";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import { requestContext } from "../infrastructure/request-context.js";
import type { ResultDto, SatisfactionDto } from "./mvp.dto.js";

export const resultSelect = {
  id: true,
  businessId: true,
  appointmentId: true,
  summary: true,
  createdAt: true,
  satisfaction: { select: { outcome: true, createdAt: true } },
} as const;

@Injectable()
export class MvpService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly appointments: AppointmentsService,
    private readonly permissions: PermissionsService,
  ) {}

  capabilities() {
    return {
      version: "v1",
      enabled: process.env.STAGE33_MVP_ENABLED === "true",
      privatePhotos: {
        available: false,
        reason: "PRIVATE_STORAGE_AND_REVIEWED_OWNER_CONSENT_REQUIRED",
      },
      visualAnalysis: {
        available: false,
        reason: "REVIEWED_POLICY_AND_PROVIDER_REQUIRED",
      },
      matching: { provider: "DATABASE", semanticVectorAvailable: false },
      verification: {
        automatic: false,
        reason: "REVIEWED_BUSINESS_VERIFICATION_POLICY_REQUIRED",
      },
    };
  }
  private enabled() {
    if (process.env.STAGE33_MVP_ENABLED !== "true")
      throw new ServiceUnavailableException("MVP_FEATURE_DISABLED");
  }
  async catalog(businessId: string) {
    this.enabled();
    const business = await this.db.business.findFirst({
      where: { id: businessId, status: "ACTIVE", isPublic: true },
      select: {
        id: true,
        name: true,
        isVerified: true,
        services: {
          where: { isActive: true, isBookable: true },
          select: {
            id: true,
            name: true,
            price: true,
            currency: true,
            durationMinutes: true,
          },
          take: 100,
        },
        locations: {
          where: { isActive: true },
          select: { id: true, name: true },
          take: 50,
        },
        staff: {
          where: { isActive: true, acceptsBookings: true },
          select: {
            id: true,
            displayName: true,
            services: {
              where: { isActive: true },
              select: { serviceId: true },
            },
          },
          take: 100,
        },
      },
    });
    if (!business) throw new NotFoundException("Public business not found");
    return business;
  }
  async bookings(user: AuthenticatedUser) {
    this.enabled();
    return {
      version: "v1",
      items: await this.db.appointment.findMany({
        where: { customer: { userId: user.id } },
        select: {
          id: true,
          businessId: true,
          status: true,
          startsAt: true,
          endsAt: true,
          price: true,
          currency: true,
          service: { select: { name: true } },
          location: { select: { name: true } },
        },
        orderBy: [{ startsAt: "desc" }, { id: "desc" }],
        take: 100,
      }),
    };
  }
  async getResult(
    user: AuthenticatedUser,
    businessId: string,
    appointmentId: string,
  ) {
    this.enabled();
    await this.appointments.get(user, businessId, appointmentId);
    const result = await this.db.beautyJobResult.findUnique({
      where: { businessId_appointmentId: { businessId, appointmentId } },
      select: resultSelect,
    });
    return {
      version: "v1",
      status: result ? "AVAILABLE" : "NOT_RECORDED",
      result,
    };
  }
  async recordResult(
    user: AuthenticatedUser,
    businessId: string,
    appointmentId: string,
    input: ResultDto,
  ) {
    this.enabled();
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "appointment:read",
    );
    // Existing appointment actorScope restricts STAFF to the assigned member.
    await this.appointments.get(user, businessId, appointmentId);
    return this.db.$transaction(async (tx: PrismaService) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))::text",
        `mvp-result:${businessId}:${appointmentId}`,
      );
      const appointment = await tx.appointment.findFirst({
        where: { id: appointmentId, businessId },
        select: { status: true },
      });
      if (!appointment) throw new NotFoundException("Appointment not found");
      if (appointment.status !== "COMPLETED")
        throw new ConflictException("A completed beauty job is required");
      const prior = await tx.beautyJobResult.findFirst({
        where: {
          businessId,
          OR: [{ appointmentId }, { idempotencyKey: input.idempotencyKey }],
        },
      });
      if (prior) {
        if (
          prior.appointmentId !== appointmentId ||
          prior.idempotencyKey !== input.idempotencyKey ||
          prior.summary !== input.summary ||
          prior.recordedById !== user.id
        )
          throw new ConflictException(
            "Immutable result or conflicting idempotency key",
          );
        return tx.beautyJobResult.findUnique({
          where: { id: prior.id },
          select: resultSelect,
        });
      }
      const result = await tx.beautyJobResult.create({
        data: {
          businessId,
          appointmentId,
          summary: input.summary,
          recordedById: user.id,
          idempotencyKey: input.idempotencyKey,
        },
        select: resultSelect,
      });
      await this.audit(
        tx,
        user,
        businessId,
        "mvp.result.recorded",
        result.id,
        input.idempotencyKey,
      );
      return result;
    });
  }
  async satisfy(
    user: AuthenticatedUser,
    businessId: string,
    appointmentId: string,
    input: SatisfactionDto,
  ) {
    this.enabled();
    // Super-admin and business permissions never confer the customer's voice.
    const owned = await this.db.appointment.findFirst({
      where: { id: appointmentId, businessId, customer: { userId: user.id } },
      select: { id: true, status: true },
    });
    if (!owned)
      throw new ForbiddenException(
        "Only the booking customer can record satisfaction",
      );
    if (owned.status !== "COMPLETED")
      throw new ConflictException("A completed beauty job is required");
    return this.db.$transaction(async (tx: PrismaService) => {
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))::text",
        `mvp-result:${businessId}:${appointmentId}`,
      );
      const result = await tx.beautyJobResult.findUnique({
        where: { businessId_appointmentId: { businessId, appointmentId } },
      });
      if (!result) throw new ConflictException("A recorded result is required");
      const prior = await tx.beautyJobSatisfaction.findFirst({
        where: {
          businessId,
          OR: [
            { resultId: result.id },
            { idempotencyKey: input.idempotencyKey },
          ],
        },
      });
      if (prior) {
        if (
          prior.resultId !== result.id ||
          prior.outcome !== input.outcome ||
          prior.idempotencyKey !== input.idempotencyKey ||
          prior.customerUserId !== user.id
        )
          throw new ConflictException(
            "Immutable satisfaction or conflicting idempotency key",
          );
        return { outcome: prior.outcome, createdAt: prior.createdAt };
      }
      const entry = await tx.beautyJobSatisfaction.create({
        data: {
          businessId,
          resultId: result.id,
          customerUserId: user.id,
          ...input,
        },
        select: { id: true, outcome: true, createdAt: true },
      });
      await this.audit(
        tx,
        user,
        businessId,
        "mvp.satisfaction.recorded",
        entry.id,
        input.idempotencyKey,
      );
      await tx.backgroundJob.upsert({
        where: {
          businessId_type_idempotencyKey: {
            businessId,
            type: "MVP_PASSPORT_PUBLISH_V1",
            idempotencyKey: result.id,
          },
        },
        create: {
          businessId,
          type: "MVP_PASSPORT_PUBLISH_V1",
          idempotencyKey: result.id,
          payload: { resultId: result.id },
          actorId: user.id,
          correlationId: requestContext.get()?.requestId ?? randomUUID(),
        },
        update: {},
      });
      return { outcome: entry.outcome, createdAt: entry.createdAt };
    });
  }
  async passport(user: AuthenticatedUser) {
    this.enabled();
    const items = await this.db.beautyJobResult.findMany({
      where: {
        passportPublishedAt: { not: null },
        appointment: { customer: { userId: user.id }, status: "COMPLETED" },
      },
      select: {
        ...resultSelect,
        appointment: {
          select: {
            startsAt: true,
            completedAt: true,
            service: { select: { name: true } },
            business: { select: { name: true } },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    });
    return {
      version: "v1",
      status: items.length ? "AVAILABLE" : "NO_RECORDED_RESULTS",
      items,
    };
  }
  private audit(
    tx: PrismaService,
    user: AuthenticatedUser,
    businessId: string,
    action: string,
    resourceId: string,
    key: string,
  ) {
    return tx.auditLog.create({
      data: {
        businessId,
        actorId: user.id,
        actorType: user.role,
        action,
        resourceType: "BeautyJobResult",
        resourceId,
        correlationId: requestContext.get()?.requestId ?? randomUUID(),
        metadata: { idempotencyKey: key, version: "v1" },
        result: "SUCCEEDED",
      },
    });
  }
}
