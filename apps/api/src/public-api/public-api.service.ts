/* eslint-disable @typescript-eslint/consistent-type-imports, @typescript-eslint/no-explicit-any */
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import { AppointmentsService } from "../appointments/appointments.service.js";
import { DiscoveryService } from "../discovery/discovery.service.js";
import { IdempotencyService } from "../infrastructure/idempotency.service.js";
import { requestContext } from "../infrastructure/request-context.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import type { ApiPrincipal, ApiScope } from "./public-api.types.js";
import { ApiCredentialService } from "./api-credential.service.js";
import type {
  PublicBookingDto,
  PublicDiscoveryQueryDto,
} from "./public-api.dto.js";
@Injectable()
export class PublicApiService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly credentials: ApiCredentialService,
    private readonly appointments: AppointmentsService,
    private readonly discoveryService: DiscoveryService,
    private readonly idempotency: IdempotencyService,
  ) {}
  async business(p: ApiPrincipal) {
    this.scope(p, "business.read");
    const row = await this.db.business.findFirst({
      where: { id: p.businessId, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        slug: true,
        city: true,
        district: true,
        timezone: true,
        isVerified: true,
      },
    });
    if (!row) throw new NotFoundException("Business not found");
    return {
      data: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        city: row.city,
        district: row.district,
        timezone: row.timezone,
        verified: row.isVerified,
      },
      meta: this.meta(),
    };
  }
  async services(p: ApiPrincipal) {
    this.scope(p, "services.read");
    const rows = await this.db.service.findMany({
      where: { businessId: p.businessId, isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        durationMinutes: true,
        price: true,
        currency: true,
        categoryId: true,
      },
      orderBy: { name: "asc" },
      take: 100,
    });
    return { data: rows, meta: this.meta() };
  }
  async professionals(p: ApiPrincipal) {
    this.scope(p, "professionals.read");
    const rows = await this.db.staff.findMany({
      where: { businessId: p.businessId, isActive: true },
      select: { id: true, displayName: true, title: true },
      orderBy: { displayName: "asc" },
      take: 100,
    });
    return { data: rows, meta: this.meta() };
  }
  async availability(
    p: ApiPrincipal,
    q: {
      serviceId: string;
      professionalId: string;
      locationId: string;
      date: string;
    },
  ) {
    this.scope(p, "availability.read");
    const slots = await this.appointments.availabilityFor(
      p.businessId,
      q.serviceId,
      q.professionalId,
      q.date,
      q.locationId,
    );
    return {
      data: slots.map((x) => ({
        startsAt: x.startsAt,
        endsAt: x.endsAt,
        professionalId: x.staffId,
      })),
      meta: this.meta(),
    };
  }
  async getBooking(p: ApiPrincipal, id: string) {
    this.scope(p, "booking.read");
    const row = await this.appointments.get(this.actor(p), p.businessId, id);
    return { data: this.booking(row), meta: this.meta() };
  }
  async createBooking(p: ApiPrincipal, dto: PublicBookingDto, key: string) {
    this.scope(p, "booking.write");
    if (!key) throw new BadRequestException("Idempotency-Key is required");
    const fingerprint = JSON.stringify([
      dto.serviceId,
      dto.professionalId,
      dto.locationId,
      dto.customerId,
      dto.startsAt,
    ]);
    const reservation = await this.idempotency.reserve(
      {
        businessId: p.businessId,
        actorId: p.clientId,
        operation: "public.booking.create",
      },
      key,
      fingerprint,
    );
    if (reservation.response) return reservation.response;
    const row = await this.appointments.create(this.actor(p), p.businessId, {
      serviceId: dto.serviceId,
      staffMemberId: dto.professionalId,
      locationId: dto.locationId,
      customerId: dto.customerId,
      startsAt: dto.startsAt,
    } as never);
    const response = { data: this.booking(row), meta: this.meta() };
    await this.idempotency.complete(reservation.id, 201, response);
    return response;
  }
  async cancelBooking(p: ApiPrincipal, id: string, key: string) {
    this.scope(p, "booking.write");
    if (!key) throw new BadRequestException("Idempotency-Key is required");
    const reservation = await this.idempotency.reserve(
      {
        businessId: p.businessId,
        actorId: p.clientId,
        operation: `public.booking.cancel:${id}`,
      },
      key,
      id,
    );
    if (reservation.response) return reservation.response;
    const row = await this.appointments.cancel(
      this.actor(p),
      p.businessId,
      id,
      { reason: "Cancelled by API client" },
    );
    const response = { data: this.booking(row), meta: this.meta() };
    await this.idempotency.complete(reservation.id, 200, response);
    return response;
  }
  async discovery(p: ApiPrincipal, q: PublicDiscoveryQueryDto) {
    this.scope(p, "discovery.read");
    const result = await this.discoveryService.search({
      ...q,
      businessId: p.businessId,
    } as never);
    return {
      data: result.items.map((x: any) => ({
        businessId: x.businessId,
        name: x.name,
        slug: x.slug,
        city: x.city,
        district: x.district,
        services: x.services,
        professionals: x.professionals,
        verified: x.verified,
        nextAvailabilityAt: x.nextAvailabilityAt,
        sponsored: false,
        sponsorshipLabel: null,
      })),
      page: {
        nextCursor: result.nextCursor,
        hasMore: result.nextCursor !== null,
      },
      meta: this.meta(),
    };
  }
  result(p: ApiPrincipal, id: string) {
    this.scope(p, "result.read");
    void id;
    return {
      data: null,
      status: "NOT_AVAILABLE",
      meta: {
        ...this.meta(),
        reason: "Result domain is not exposed in public API v1",
      },
    };
  }
  requireScope(p: ApiPrincipal, scope: ApiScope) {
    this.scope(p, scope);
  }
  async recordUsage(
    p: ApiPrincipal,
    operation: string,
    status: number,
    latencyMs: number,
  ) {
    await this.db.apiUsageRecord.create({
      data: {
        applicationId: p.applicationId,
        clientId: p.clientId,
        businessId: p.businessId,
        operation,
        statusCode: status,
        latencyMs,
        requestId: requestContext.get()?.requestId ?? "unknown",
      },
    });
  }
  private scope(p: ApiPrincipal, s: ApiScope) {
    this.credentials.assertScope(p, s);
  }
  private actor(p: ApiPrincipal): AuthenticatedUser {
    return {
      id: p.userId,
      email: `api-${p.applicationId}@internal.invalid`,
      role: "BUSINESS_OWNER",
    };
  }
  private booking(x: any) {
    return {
      id: x.id,
      status: x.status,
      serviceId: x.serviceId,
      professionalId: x.staffMemberId,
      locationId: x.locationId,
      startsAt: x.startsAt,
      endsAt: x.endsAt,
      currency: x.currency,
      price: x.price,
    };
  }
  private meta() {
    return {
      apiVersion: "v1",
      requestId: requestContext.get()?.requestId ?? "unknown",
      deprecated: false,
      sunsetAt: null,
      replacement: null,
    };
  }
}
