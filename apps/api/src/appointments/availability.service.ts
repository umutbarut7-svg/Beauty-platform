import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DateTime } from "luxon";
import type { PrismaService } from "../database/prisma.service.js";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import { BLOCKING_APPOINTMENT_STATUSES } from "./status-transitions.js";
const DAY_NAMES = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

export interface AvailabilityRequest {
  businessId: string;
  serviceId: string;
  staffMemberId?: string;
  date: string;
  locationId?: string;
  excludeAppointmentId?: string;
}
export interface AvailabilitySlot {
  startsAt: string;
  endsAt: string;
  staffId?: string;
}

@Injectable()
export class AvailabilityService {
  constructor(@Inject(PRISMA_SERVICE) private readonly prisma: PrismaService) {}

  async calculate(
    input: AvailabilityRequest,
    database: PrismaService = this.prisma,
    now: DateTime<boolean> = DateTime.utc(),
  ): Promise<AvailabilitySlot[]> {
    const business = await database.business.findUnique({
      where: { id: input.businessId },
      select: {
        timezone: true,
        status: true,
        settings: {
          select: { bookingEnabled: true, appointmentIntervalMinutes: true },
        },
      },
    });
    if (
      !business ||
      business.status !== "ACTIVE" ||
      !business.settings?.bookingEnabled
    )
      throw new NotFoundException("Business is not available for booking");
    const zone = business.timezone;
    const day = DateTime.fromISO(input.date, { zone });
    if (!day.isValid || day.toFormat("yyyy-MM-dd") !== input.date)
      throw new BadRequestException("Invalid availability date");
    const service = await database.service.findFirst({
      where: {
        id: input.serviceId,
        businessId: input.businessId,
        isActive: true,
        isBookable: true,
      },
      select: {
        id: true,
        durationMinutes: true,
        bufferBeforeMinutes: true,
        bufferAfterMinutes: true,
      },
    });
    if (!service) throw new NotFoundException("Bookable service not found");
    if (!input.staffMemberId) {
      const staff = await database.staff.findMany({
        where: {
          businessId: input.businessId,
          isActive: true,
          acceptsBookings: true,
          services: {
            some: { serviceId: input.serviceId, isActive: true },
          },
          ...(input.locationId
            ? { locations: { some: { locationId: input.locationId } } }
            : {}),
        },
        select: { id: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      });
      const slots = await Promise.all(
        staff.map((item: { id: string }) =>
          this.calculate({ ...input, staffMemberId: item.id }, database, now),
        ),
      );
      return [
        ...new Map(
          slots
            .flat()
            .map((slot) => [`${slot.startsAt}:${slot.staffId}`, slot]),
        ).values(),
      ].sort((left, right) => left.startsAt.localeCompare(right.startsAt));
    }
    if (input.locationId) {
      const location = await database.location.findFirst({
        where: {
          id: input.locationId,
          businessId: input.businessId,
          isActive: true,
        },
        select: { id: true },
      });
      if (!location) throw new NotFoundException("Active location not found");
    }
    let profile = await database.staff.findFirst({
      where: {
        id: input.staffMemberId,
        businessId: input.businessId,
        isActive: true,
        acceptsBookings: true,
      },
      select: { id: true, userId: true },
    });
    const member = profile
      ? null
      : await database.businessMember.findFirst({
          where: { id: input.staffMemberId, businessId: input.businessId },
          select: { id: true, userId: true },
        });
    if (!profile && member)
      profile = await database.staff.findFirst({
        where: {
          businessId: input.businessId,
          userId: member.userId,
          isActive: true,
          acceptsBookings: true,
        },
        select: { id: true, userId: true },
      });
    if (!profile)
      throw new NotFoundException("Active bookable staff member not found");
    const profileAssignment = await database.staffProfileService.findFirst({
      where: {
        businessId: input.businessId,
        staffId: profile.id,
        serviceId: input.serviceId,
        isActive: true,
      },
      select: { customDurationMinutes: true },
    });
    const memberAssignment = member
      ? await database.staffService.findFirst({
          where: {
            businessId: input.businessId,
            businessMemberId: member.id,
            serviceId: input.serviceId,
            isActive: true,
          },
          select: { customDurationMinutes: true },
        })
      : null;
    const assignment = profileAssignment ?? memberAssignment;
    if (!assignment)
      throw new NotFoundException(
        "Staff member is not assigned to this service",
      );
    if (input.locationId) {
      const atLocation = await database.staff.findFirst({
        where: {
          id: profile.id,
          businessId: input.businessId,
          isActive: true,
          acceptsBookings: true,
          locations: {
            some: {
              locationId: input.locationId,
              businessId: input.businessId,
            },
          },
        },
        select: { id: true },
      });
      if (!atLocation)
        throw new NotFoundException(
          "Active staff member is not assigned to this location",
        );
    }

    const dayOfWeek = DAY_NAMES[day.weekday - 1];
    const [businessHours, staffHours] = await Promise.all([
      database.workingHour.findMany({
        where: {
          businessId: input.businessId,
          branchId: null,
          dayOfWeek,
          isOpen: true,
        },
      }),
      database.staffWorkingHour.findMany({
        where: {
          businessId: input.businessId,
          OR: [
            { staffId: profile.id },
            ...(member ? [{ businessMemberId: member.id }] : []),
          ],
          dayOfWeek,
          isActive: true,
        },
        orderBy: { startTime: "asc" },
      }),
    ]);
    if (!businessHours.length || !staffHours.length) return [];
    const dayStartUtc = day.startOf("day").toUTC().toJSDate();
    const dayEndUtc = day.plus({ days: 1 }).startOf("day").toUTC().toJSDate();
    const [timeOff, appointments] = await Promise.all([
      database.staffTimeOff.findMany({
        where: {
          businessId: input.businessId,
          OR: [
            { staffId: profile.id },
            ...(member ? [{ businessMemberId: member.id }] : []),
          ],
          startsAt: { lt: new Date(dayEndUtc.getTime() + 172800000) },
          endsAt: { gt: new Date(dayStartUtc.getTime() - 172800000) },
        },
      }),
      database.appointment.findMany({
        where: {
          businessId: input.businessId,
          OR: [
            { staffId: profile.id },
            ...(member ? [{ staffMemberId: member.id }] : []),
          ],
          status: { in: BLOCKING_APPOINTMENT_STATUSES },
          id: input.excludeAppointmentId
            ? { not: input.excludeAppointmentId }
            : undefined,
          startsAt: { lt: dayEndUtc },
          endsAt: { gt: dayStartUtc },
        },
        include: {
          service: {
            select: { bufferBeforeMinutes: true, bufferAfterMinutes: true },
          },
        },
      }),
    ]);

    const duration =
      assignment.customDurationMinutes ?? service.durationMinutes;
    const interval = business.settings.appointmentIntervalMinutes;
    const slots: AvailabilitySlot[] = [];
    const businessRanges = businessHours.flatMap(
      (hour: { openTime?: string | null; closeTime?: string | null }) =>
        this.range(input.date, hour.openTime, hour.closeTime, zone),
    );
    for (const staffHour of staffHours) {
      const ranges = this.range(
        input.date,
        staffHour.startTime,
        staffHour.endTime,
        zone,
      );
      for (const staffRange of ranges) {
        for (
          let cursor = staffRange.start;
          cursor.plus({ minutes: duration }).toMillis() <=
          staffRange.end.toMillis();
          cursor = cursor.plus({ minutes: interval })
        ) {
          const actualEnd = cursor.plus({ minutes: duration });
          const occupiedStart = cursor.minus({
            minutes: service.bufferBeforeMinutes,
          });
          const occupiedEnd = actualEnd.plus({
            minutes: service.bufferAfterMinutes,
          });
          if (
            cursor.toUTC() < now ||
            occupiedStart < staffRange.start ||
            occupiedEnd > staffRange.end ||
            !businessRanges.some(
              (range: { start: DateTime; end: DateTime }) =>
                occupiedStart >= range.start && occupiedEnd <= range.end,
            )
          )
            continue;
          if (
            timeOff.some((off: { startsAt: Date; endsAt: Date }) =>
              overlaps(
                occupiedStart.toMillis(),
                occupiedEnd.toMillis(),
                off.startsAt.getTime(),
                off.endsAt.getTime(),
              ),
            )
          )
            continue;
          if (
            appointments.some(
              (appointment: {
                startsAt: Date;
                endsAt: Date;
                service: {
                  bufferBeforeMinutes: number;
                  bufferAfterMinutes: number;
                };
              }) =>
                overlaps(
                  occupiedStart.toMillis(),
                  occupiedEnd.toMillis(),
                  appointment.startsAt.getTime() -
                    appointment.service.bufferBeforeMinutes * 60000,
                  appointment.endsAt.getTime() +
                    appointment.service.bufferAfterMinutes * 60000,
                ),
            )
          )
            continue;
          slots.push({
            startsAt: cursor.toUTC().toISO()!,
            endsAt: actualEnd.toUTC().toISO()!,
            staffId: profile.id,
          });
        }
      }
    }
    return [
      ...new Map(slots.map((slot) => [slot.startsAt, slot])).values(),
    ].sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  }

  private range(
    date: string,
    start: string | null | undefined,
    end: string | null | undefined,
    zone: string,
  ) {
    if (!start || !end || start >= end) return [];
    const from = DateTime.fromISO(`${date}T${start}`, { zone });
    const to = DateTime.fromISO(`${date}T${end}`, { zone });
    if (
      !from.isValid ||
      !to.isValid ||
      from.toFormat("yyyy-MM-dd HH:mm") !== `${date} ${start}` ||
      to.toFormat("yyyy-MM-dd HH:mm") !== `${date} ${end}`
    )
      return [];
    return [{ start: from, end: to }];
  }
}

export function overlaps(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA < endB && endA > startB;
}
