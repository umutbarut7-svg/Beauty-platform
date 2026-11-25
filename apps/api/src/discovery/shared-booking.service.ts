/* eslint-disable @typescript-eslint/consistent-type-imports */
import { sharedBookingEnabled } from "@beauty-platform/types";
import { createHash } from "node:crypto";
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AppointmentsService } from "../appointments/appointments.service.js";
import { AvailabilityService } from "../appointments/availability.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import { SharedServiceService } from "./shared-service.service.js";
import type {
  SharedAvailabilityQueryDto,
  SharedCreateBookingDto,
} from "./shared-booking.dto.js";
import type {
  OrzellShareTarget,
  PublishedShareService,
} from "@beauty-platform/types";

const receiptSelect = {
  id: true,
  businessId: true,
  serviceId: true,
  staffId: true,
  locationId: true,
  startsAt: true,
  endsAt: true,
  price: true,
  currency: true,
  status: true,
};
interface BookingRow {
  id: string;
  businessId: string;
  serviceId: string;
  staffId: string | null;
  locationId: string;
  startsAt: Date;
  endsAt: Date;
  price: unknown;
  currency: string;
  status: string;
}
function receipt(row: BookingRow) {
  return {
    id: row.id,
    businessId: row.businessId,
    serviceId: row.serviceId,
    professionalId: row.staffId,
    locationId: row.locationId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    price: String(row.price),
    currency: row.currency,
    status: row.status,
  };
}
const minor = (value: string) => {
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(value))
    throw new ConflictException("Quote changed");
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
};
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
interface ReplayRecord {
  requestHash: string;
  statusCode: number | null;
  response: unknown;
  expiresAt: Date;
}
function replayId(
  record: ReplayRecord | null,
  requestHash: string,
): string | null {
  if (!record) return null;
  if (
    record.requestHash !== requestHash ||
    record.expiresAt.getTime() <= Date.now() ||
    record.statusCode !== 201 ||
    !record.response ||
    typeof record.response !== "object" ||
    !("appointmentId" in record.response) ||
    typeof record.response.appointmentId !== "string" ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(record.response.appointmentId)
  )
    throw new ConflictException(
      "Booking request changed or expired; inspect your bookings",
    );
  return record.response.appointmentId;
}

@Injectable()
export class SharedBookingService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly published: SharedServiceService,
    private readonly availability: AvailabilityService,
    private readonly appointments: AppointmentsService,
  ) {}

  private enabled(target: Pick<OrzellShareTarget, "businessId" | "serviceId">) {
    if (
      process.env.ORZELL_EVERYWHERE_ENABLED !== "true" ||
      !sharedBookingEnabled(
        process.env.ORZELL_EVERYWHERE_WEB_BOOKING_ENABLED,
        target,
      )
    )
      throw new NotFoundException("Shared booking is unavailable");
  }
  private atLocation(published: PublishedShareService, locationId: string) {
    if (!published.locations.some((location) => location.id === locationId))
      throw new NotFoundException("Shared booking is unavailable");
  }
  async quote(query: SharedAvailabilityQueryDto) {
    this.enabled(query);
    const published = await this.published.resolve(query);
    this.atLocation(published, query.locationId);
    const slots = await this.availability.calculate({
      businessId: query.businessId,
      serviceId: query.serviceId,
      staffMemberId: query.professionalId,
      locationId: query.locationId,
      date: query.date,
    });
    return { published, slots };
  }
  async book(user: AuthenticatedUser, input: SharedCreateBookingDto) {
    this.enabled(input);
    const scope = {
      businessId: input.businessId,
      actorId: user.id,
      operation: "ORZELL_SHARED_BOOKING_V1",
      keyHash: digest(input.idempotencyKey),
    };
    const where = { businessId_actorId_operation_keyHash: scope };
    const requestHash = digest(
      JSON.stringify([
        input.serviceId,
        input.professionalId,
        input.locationId,
        new Date(input.startsAt).toISOString(),
        minor(input.expectedPrice).toString(),
        input.expectedCurrency,
        input.expectedDurationMinutes,
      ]),
    );
    let reservationId: string | undefined;
    try {
      const row = await this.appointments.create(
        user,
        input.businessId,
        {
          serviceId: input.serviceId,
          staffMemberId: input.professionalId,
          locationId: input.locationId,
          startsAt: input.startsAt,
          bookForSelf: true,
        },
        {
          prepare: async (tx) => {
            this.enabled(input);
            await tx.$queryRawUnsafe(
              "SELECT pg_advisory_xact_lock(hashtext($1))::text",
              `shared-booking:${input.businessId}:${user.id}:${scope.keyHash}`,
            );
            const existing = replayId(
              await tx.idempotencyRecord.findUnique({ where }),
              requestHash,
            );
            if (existing) return existing;
            const reservation = await tx.idempotencyRecord.create({
              data: {
                ...scope,
                requestHash,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
              },
              select: { id: true },
            });
            reservationId = reservation.id;
            const current = await this.published.resolve(input, tx);
            this.atLocation(current, input.locationId);
            const staff = current.professionals.find(
              (item) => item.id === input.professionalId,
            );
            if (
              !staff ||
              minor(staff.price) !== minor(input.expectedPrice) ||
              current.service.currency !== input.expectedCurrency ||
              staff.durationMinutes !== input.expectedDurationMinutes
            )
              throw new ConflictException(
                "Quote changed; refresh availability before booking",
              );
            return null;
          },
          complete: async (tx, appointmentId) => {
            if (!reservationId)
              throw new ConflictException("Booking request is unbound");
            await tx.idempotencyRecord.update({
              where: { id: reservationId },
              data: { statusCode: 201, response: { appointmentId } },
            });
          },
        },
      );
      return receipt(row);
    } catch (error) {
      // A concurrently committed identical request can invalidate a serializable
      // snapshot. Read its own result on a fresh snapshot; never retry the write.
      const existingId = replayId(
        await this.db.idempotencyRecord.findUnique({ where }),
        requestHash,
      );
      if (existingId) {
        const own: BookingRow | null = await this.db.appointment.findFirst({
          where: {
            id: existingId,
            businessId: input.businessId,
            serviceId: input.serviceId,
            staffId: input.professionalId,
            locationId: input.locationId,
            customer: { userId: user.id },
          },
          select: receiptSelect,
        });
        if (own) return receipt(own);
      }
      throw error;
    }
  }
  async mine(user: AuthenticatedUser, target: OrzellShareTarget) {
    this.enabled(target);
    const rows: BookingRow[] = await this.db.appointment.findMany({
      where: {
        businessId: target.businessId,
        serviceId: target.serviceId,
        ...(target.professionalId ? { staffId: target.professionalId } : {}),
        customer: { userId: user.id },
      },
      select: receiptSelect,
      orderBy: [{ startsAt: "desc" }, { id: "desc" }],
      take: 50,
    });
    return { items: rows.map(receipt) };
  }
  async cancel(
    user: AuthenticatedUser,
    businessId: string,
    appointmentId: string,
  ) {
    const own = await this.db.appointment.findFirst({
      where: { id: appointmentId, businessId, customer: { userId: user.id } },
      select: { id: true, serviceId: true },
    });
    if (!own) throw new NotFoundException("Booking is unavailable");
    this.enabled({ businessId, serviceId: own.serviceId });
    return receipt(
      await this.appointments.cancel(user, businessId, appointmentId, {}),
    );
  }
}
