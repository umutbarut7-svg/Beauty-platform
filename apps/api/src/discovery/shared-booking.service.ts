/* eslint-disable @typescript-eslint/consistent-type-imports */
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

@Injectable()
export class SharedBookingService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly published: SharedServiceService,
    private readonly availability: AvailabilityService,
    private readonly appointments: AppointmentsService,
  ) {}

  private enabled() {
    if (
      process.env.ORZELL_EVERYWHERE_ENABLED !== "true" ||
      process.env.ORZELL_EVERYWHERE_WEB_BOOKING_ENABLED !== "true"
    )
      throw new NotFoundException("Shared booking is unavailable");
  }
  private atLocation(published: PublishedShareService, locationId: string) {
    if (!published.locations.some((location) => location.id === locationId))
      throw new NotFoundException("Shared booking is unavailable");
  }
  async quote(query: SharedAvailabilityQueryDto) {
    this.enabled();
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
    this.enabled();
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
      async (tx) => {
        this.enabled();
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
      },
    );
    return receipt(row);
  }
  async mine(user: AuthenticatedUser, target: OrzellShareTarget) {
    this.enabled();
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
    this.enabled();
    const own = await this.db.appointment.findFirst({
      where: { id: appointmentId, businessId, customer: { userId: user.id } },
      select: { id: true },
    });
    if (!own) throw new NotFoundException("Booking is unavailable");
    return receipt(
      await this.appointments.cancel(user, businessId, appointmentId, {}),
    );
  }
}
