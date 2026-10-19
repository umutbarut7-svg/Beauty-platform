/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { DateTime } from "luxon";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionsService } from "../auth/permissions.service.js";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import {
  normalizeEmail,
  normalizePhone,
} from "../customers/customers.service.js";
import type {
  CancelAppointmentDto,
  CreateAppointmentDto,
  CreateStaffTimeOffDto,
  ReplaceStaffWorkingHoursDto,
  UpdateAppointmentDto,
  UpdateStaffTimeOffDto,
} from "./appointment.dto.js";
import { AvailabilityService } from "./availability.service.js";
import { CategoryEngineService } from "../categories/category-engine.service.js";
import { GlobalizationService } from "../globalization/globalization.service.js";
import {
  canTransitionAppointment,
  type AppointmentStatus,
  timestampForStatus,
} from "./status-transitions.js";

@Injectable()
export class AppointmentsService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly availability: AvailabilityService,
    @Optional() private readonly categories?: CategoryEngineService,
    @Optional() private readonly globalization?: GlobalizationService,
  ) {}

  availabilityFor(
    businessId: string,
    serviceId: string,
    staffMemberId: string | undefined,
    date: string,
    locationId?: string,
  ) {
    return this.availability.calculate({
      businessId,
      serviceId,
      staffMemberId,
      date,
      locationId,
    });
  }

  async list(user: AuthenticatedUser, businessId: string) {
    const scope = await this.actorScope(user, businessId);
    return this.prisma.appointment.findMany({
      where: { businessId, ...scope },
      include: this.includes(),
      orderBy: { startsAt: "desc" },
      take: 200,
    });
  }
  async get(
    user: AuthenticatedUser,
    businessId: string,
    appointmentId: string,
  ) {
    const scope = await this.actorScope(user, businessId);
    const value = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, businessId, ...scope },
      include: this.includes(),
    });
    if (!value) throw new NotFoundException("Appointment not found");
    return value;
  }
  async create(
    user: AuthenticatedUser,
    businessId: string,
    dto: CreateAppointmentDto,
  ) {
    const actor = await this.actor(user, businessId);
    if (actor.membership?.role === "STAFF")
      throw new ForbiddenException("Staff cannot create customer appointments");
    const customerId = actor.manages ? dto.customerId : actor.customer?.id;
    if (!customerId) throw new BadRequestException("A customer is required");
    if (
      !actor.manages &&
      dto.customerId &&
      dto.customerId !== actor.customer?.id
    )
      throw new ForbiddenException("Customers can only book for themselves");
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException("Customer not found");
    const requestedStart = DateTime.fromISO(dto.startsAt, { setZone: true });
    if (!requestedStart.isValid || requestedStart.toUTC() <= DateTime.utc())
      throw new BadRequestException(
        "Appointment start must be a valid future instant",
      );

    try {
      return await this.prisma.$transaction(
        async (tx: PrismaService) => {
          await tx.$queryRawUnsafe(
            "SELECT pg_advisory_xact_lock(hashtext($1))::text",
            `${businessId}:${dto.staffMemberId}`,
          );
          const business = await tx.business.findUnique({
            where: { id: businessId },
            select: { timezone: true },
          });
          if (!business) throw new NotFoundException("Business not found");
          const globalizationContext =
            await this.globalization?.resolveForBookingIfConfigured(
              businessId,
              requestedStart.toUTC().toJSDate(),
              {
                timezone: dto.bookingTimezone ?? business.timezone,
              },
            );
          if (dto.customerTimezone && this.globalization)
            this.globalization.validateTimezone(dto.customerTimezone);
          const date = requestedStart
            .setZone(business.timezone)
            .toFormat("yyyy-MM-dd");
          const slots = await this.availability.calculate(
            {
              businessId,
              serviceId: dto.serviceId,
              staffMemberId: dto.staffMemberId,
              locationId: dto.locationId,
              date,
            },
            tx,
          );
          const slot = slots.find(
            (candidate) =>
              DateTime.fromISO(candidate.startsAt).toMillis() ===
              requestedStart.toUTC().toMillis(),
          );
          if (!slot)
            throw new ConflictException(
              "Requested appointment slot is unavailable",
            );
          if (!slot.staffId)
            throw new ConflictException("Staff is unavailable for booking");
          await this.categories?.validateBooking(
            businessId,
            dto.serviceId,
            slot.staffId,
            dto.categoryAttributes ?? {},
          );
          const staff = await tx.staff.findFirst({
            where: { id: slot.staffId, businessId },
            select: { id: true, userId: true },
          });
          if (!staff)
            throw new ConflictException("Staff is unavailable for booking");
          const member = staff.userId
            ? await tx.businessMember.findUnique({
                where: {
                  userId_businessId: { userId: staff.userId, businessId },
                },
                select: { id: true },
              })
            : null;
          const profileAssignment = await tx.staffProfileService.findFirst({
            where: {
              businessId,
              staffId: staff.id,
              serviceId: dto.serviceId,
              isActive: true,
            },
            include: { service: true },
          });
          const assignment =
            profileAssignment ??
            (member
              ? await tx.staffService.findFirst({
                  where: {
                    businessId,
                    businessMemberId: member.id,
                    serviceId: dto.serviceId,
                    isActive: true,
                  },
                  include: { service: true },
                })
              : null);
          if (!assignment)
            throw new ConflictException(
              "Staff service assignment is unavailable",
            );
          let businessCustomerId: string | undefined;
          if (dto.customerProfile) {
            if (dto.customerProfile.preferredStaffId) {
              const preferredStaff = await tx.staff.findFirst({
                where: {
                  id: dto.customerProfile.preferredStaffId,
                  businessId,
                },
                select: { id: true },
              });
              if (!preferredStaff)
                throw new NotFoundException("Preferred staff not found");
            }
            const phone = dto.customerProfile.phone
              ? normalizePhone(dto.customerProfile.phone)
              : undefined;
            const email = dto.customerProfile.email
              ? normalizeEmail(dto.customerProfile.email)
              : undefined;
            const existing =
              phone || email
                ? await tx.businessCustomer.findFirst({
                    where: {
                      businessId,
                      OR: [
                        ...(phone ? [{ phone }] : []),
                        ...(email ? [{ email }] : []),
                      ],
                    },
                  })
                : null;
            if (
              existing?.userCustomerId &&
              existing.userCustomerId !== customerId
            )
              throw new ConflictException(
                "Customer contact belongs to another customer",
              );
            const profile = existing
              ? await tx.businessCustomer.update({
                  where: { id: existing.id },
                  data: {
                    userCustomerId: existing.userCustomerId ?? customerId,
                    firstName: dto.customerProfile.firstName.trim(),
                    lastName: dto.customerProfile.lastName.trim(),
                    phone,
                    email,
                    preferredStaffId: dto.customerProfile.preferredStaffId,
                    marketingConsent: dto.customerProfile.marketingConsent,
                    smsConsent: dto.customerProfile.smsConsent,
                    emailConsent: dto.customerProfile.emailConsent,
                  },
                })
              : await tx.businessCustomer.create({
                  data: {
                    businessId,
                    userCustomerId: customerId,
                    firstName: dto.customerProfile.firstName.trim(),
                    lastName: dto.customerProfile.lastName.trim(),
                    phone,
                    email,
                    birthDate: dto.customerProfile.birthDate
                      ? new Date(
                          `${dto.customerProfile.birthDate}T00:00:00.000Z`,
                        )
                      : undefined,
                    gender: dto.customerProfile.gender?.trim(),
                    notes: dto.customerProfile.notes?.trim(),
                    source: dto.customerProfile.source?.trim() ?? "BOOKING",
                    preferredStaffId: dto.customerProfile.preferredStaffId,
                    marketingConsent:
                      dto.customerProfile.marketingConsent ?? false,
                    smsConsent: dto.customerProfile.smsConsent ?? false,
                    emailConsent: dto.customerProfile.emailConsent ?? false,
                  },
                });
            businessCustomerId = profile.id;
          }
          const created = await tx.appointment.create({
            data: {
              businessId,
              customerId,
              businessCustomerId,
              staffId: staff.id,
              staffMemberId: member?.id,
              serviceId: dto.serviceId,
              locationId: dto.locationId,
              startsAt: new Date(slot.startsAt),
              endsAt: new Date(slot.endsAt),
              status: "PENDING",
              customerNote: dto.customerNote,
              internalNote: actor.manages ? dto.internalNote : undefined,
              price: assignment.customPrice ?? assignment.service.price,
              currency: assignment.service.currency,
            },
            include: this.includes(),
          });
          if (globalizationContext)
            await tx.appointment.update({
              where: { id: created.id },
              data: {
                marketConfigurationId:
                  globalizationContext.marketConfigurationId,
                bookingTimezone: globalizationContext.timezone,
                customerTimezone: dto.customerTimezone ?? null,
              },
            });
          await tx.appointmentStatusHistory.create({
            data: {
              businessId,
              appointmentId: created.id,
              fromStatus: null,
              toStatus: "PENDING",
              changedById: user.id,
            },
          });
          return created;
        },
        { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 },
      );
    } catch (error) {
      if (this.isOverlapError(error))
        throw new ConflictException(
          "Requested appointment slot was booked concurrently",
        );
      throw error;
    }
  }
  async update(
    user: AuthenticatedUser,
    businessId: string,
    appointmentId: string,
    dto: UpdateAppointmentDto,
  ) {
    const reschedules = Boolean(
      dto.startsAt || dto.staffMemberId || dto.serviceId || dto.locationId,
    );
    if (dto.status) {
      if (reschedules || dto.customerNote || dto.internalNote)
        throw new BadRequestException(
          "Status transitions cannot be combined with appointment edits",
        );
      return this.changeStatus(user, businessId, appointmentId, dto.status);
    }
    const actor = await this.actor(user, businessId);
    if (!actor.manages && actor.membership?.role !== "STAFF")
      throw new ForbiddenException("Appointment management denied");
    const appointment = await this.scopedAppointment(businessId, appointmentId);
    if (!actor.manages && appointment.staffMemberId !== actor.membership?.id)
      throw new ForbiddenException(
        "Staff can only update their own appointments",
      );
    if (!reschedules)
      return this.prisma.appointment.update({
        where: { id: appointmentId },
        data: dto,
        include: this.includes(),
      });
    if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(appointment.status))
      throw new ConflictException(
        "Terminal appointments cannot be rescheduled",
      );

    const staffMemberId = dto.staffMemberId ?? appointment.staffMemberId;
    const serviceId = dto.serviceId ?? appointment.serviceId;
    const locationId = dto.locationId ?? appointment.locationId;
    if (!staffMemberId || !locationId)
      throw new BadRequestException("Staff member and location are required");
    const requestedStart = DateTime.fromISO(
      dto.startsAt ?? appointment.startsAt.toISOString(),
      { setZone: true },
    );
    if (!requestedStart.isValid || requestedStart.toUTC() <= DateTime.utc())
      throw new BadRequestException(
        "Appointment start must be a future instant",
      );

    try {
      return await this.prisma.$transaction(
        async (tx: PrismaService) => {
          await tx.$queryRawUnsafe(
            "SELECT pg_advisory_xact_lock(hashtext($1))::text",
            `${businessId}:appointment:${appointmentId}`,
          );
          const lockIds = [
            appointment.staffId ?? appointment.staffMemberId,
            staffMemberId,
          ]
            .filter((value): value is string => Boolean(value))
            .sort();
          for (const id of new Set(lockIds))
            await tx.$queryRawUnsafe(
              "SELECT pg_advisory_xact_lock(hashtext($1))::text",
              `${businessId}:${id}`,
            );
          const current = await tx.appointment.findFirst({
            where: { id: appointmentId, businessId },
          });
          if (!current) throw new NotFoundException("Appointment not found");
          if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(current.status))
            throw new ConflictException(
              "Terminal appointments cannot be rescheduled",
            );
          const business = await tx.business.findUnique({
            where: { id: businessId },
            select: { timezone: true },
          });
          if (!business) throw new NotFoundException("Business not found");
          const slots = await this.availability.calculate(
            {
              businessId,
              serviceId,
              staffMemberId,
              locationId,
              excludeAppointmentId: appointmentId,
              date: requestedStart
                .setZone(business.timezone)
                .toFormat("yyyy-MM-dd"),
            },
            tx,
          );
          const slot = slots.find(
            (candidate) =>
              DateTime.fromISO(candidate.startsAt).toMillis() ===
              requestedStart.toUTC().toMillis(),
          );
          if (!slot)
            throw new ConflictException(
              "Requested reschedule slot is unavailable",
            );
          const resolvedStaff = await tx.staff.findFirst({
            where: { id: slot.staffId, businessId },
            select: { id: true, userId: true },
          });
          if (!resolvedStaff)
            throw new ConflictException("Staff is unavailable for booking");
          const resolvedMember = resolvedStaff.userId
            ? await tx.businessMember.findUnique({
                where: {
                  userId_businessId: {
                    userId: resolvedStaff.userId,
                    businessId,
                  },
                },
                select: { id: true },
              })
            : null;
          const profileAssignment = await tx.staffProfileService.findFirst({
            where: {
              businessId,
              staffId: resolvedStaff.id,
              serviceId,
              isActive: true,
            },
            include: { service: true },
          });
          const assignment =
            profileAssignment ??
            (resolvedMember
              ? await tx.staffService.findFirst({
                  where: {
                    businessId,
                    businessMemberId: resolvedMember.id,
                    serviceId,
                    isActive: true,
                  },
                  include: { service: true },
                })
              : null);
          if (!assignment)
            throw new ConflictException(
              "Staff service assignment is unavailable",
            );
          return tx.appointment.update({
            where: { id: appointmentId },
            data: {
              staffId: resolvedStaff.id,
              staffMemberId: resolvedMember?.id,
              serviceId,
              locationId,
              startsAt: new Date(slot.startsAt),
              endsAt: new Date(slot.endsAt),
              price: assignment.customPrice ?? assignment.service.price,
              currency: assignment.service.currency,
              customerNote: dto.customerNote,
              internalNote: dto.internalNote,
            },
            include: this.includes(),
          });
        },
        { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 },
      );
    } catch (error) {
      if (this.isOverlapError(error))
        throw new ConflictException(
          "Requested reschedule slot was booked concurrently",
        );
      throw error;
    }
  }
  async cancel(
    user: AuthenticatedUser,
    businessId: string,
    appointmentId: string,
    dto: CancelAppointmentDto,
  ) {
    const actor = await this.actor(user, businessId);
    const appointment = await this.scopedAppointment(businessId, appointmentId);
    const owns = actor.customer?.id === appointment.customerId;
    const assigned =
      actor.membership?.role === "STAFF" &&
      actor.membership.id === appointment.staffMemberId;
    if (!actor.manages && !owns && !assigned)
      throw new ForbiddenException("Appointment cancellation denied");
    if (owns) {
      const settings = await this.prisma.businessSettings.findUnique({
        where: { businessId },
      });
      if (!settings?.cancellationEnabled)
        throw new ForbiddenException("Customer cancellation is disabled");
      if (
        appointment.startsAt.getTime() - Date.now() <
        settings.cancellationWindowMinutes * 60000
      )
        throw new ConflictException("Cancellation window has closed");
    }
    return this.transitionAppointment(
      user,
      businessId,
      appointmentId,
      "CANCELLED",
      dto.reason,
    );
  }

  async changeStatus(
    user: AuthenticatedUser,
    businessId: string,
    appointmentId: string,
    status: AppointmentStatus,
    reason?: string,
  ) {
    const actor = await this.actor(user, businessId);
    const appointment = await this.scopedAppointment(businessId, appointmentId);
    if (
      !actor.manages &&
      !(
        actor.membership?.role === "STAFF" &&
        actor.membership.id === appointment.staffMemberId
      )
    )
      throw new ForbiddenException("Appointment status management denied");
    return this.transitionAppointment(
      user,
      businessId,
      appointmentId,
      status,
      reason,
    );
  }

  async statusHistory(
    user: AuthenticatedUser,
    businessId: string,
    appointmentId: string,
  ) {
    await this.get(user, businessId, appointmentId);
    return this.prisma.appointmentStatusHistory.findMany({
      where: { businessId, appointmentId },
      orderBy: [{ changedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        fromStatus: true,
        toStatus: true,
        changedAt: true,
        changedById: true,
        reason: true,
      },
    });
  }

  async replaceStaffHours(
    user: AuthenticatedUser,
    businessId: string,
    memberId: string,
    dto: ReplaceStaffWorkingHoursDto,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "staff_schedule:manage",
    );
    const target = await this.scheduleTarget(businessId, memberId);
    for (const hour of dto.hours)
      if (hour.startTime >= hour.endTime)
        throw new BadRequestException(
          "Staff working-hour start must be before end",
        );
    const byDay = new Map<string, typeof dto.hours>();
    for (const hour of dto.hours)
      byDay.set(hour.dayOfWeek, [...(byDay.get(hour.dayOfWeek) ?? []), hour]);
    for (const ranges of byDay.values()) {
      const sorted = [...ranges].sort((left, right) =>
        left.startTime.localeCompare(right.startTime),
      );
      if (
        sorted.some(
          (range, index) =>
            index > 0 && range.startTime < sorted[index - 1]!.endTime,
        )
      )
        throw new BadRequestException(
          "Staff working-hour intervals cannot overlap",
        );
    }
    return this.prisma.$transaction(async (tx: PrismaService) => {
      await tx.staffWorkingHour.deleteMany({
        where: { businessId, ...target.where },
      });
      if (dto.hours.length)
        await tx.staffWorkingHour.createMany({
          data: dto.hours.map((hour) => ({
            ...hour,
            businessId,
            ...target.data,
          })),
        });
      return tx.staffWorkingHour.findMany({
        where: { businessId, ...target.where },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      });
    });
  }
  async getStaffHours(
    user: AuthenticatedUser,
    businessId: string,
    memberId: string,
  ) {
    await this.assertScheduleRead(user, businessId, memberId);
    const target = await this.scheduleTarget(businessId, memberId);
    return this.prisma.staffWorkingHour.findMany({
      where: { businessId, ...target.where },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
  }
  async addTimeOff(
    user: AuthenticatedUser,
    businessId: string,
    memberId: string,
    dto: CreateStaffTimeOffDto,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "staff_schedule:manage",
    );
    const target = await this.scheduleTarget(businessId, memberId);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (startsAt >= endsAt)
      throw new BadRequestException("Time-off start must be before end");
    const overlap = await this.prisma.staffTimeOff.findFirst({
      where: {
        businessId,
        ...target.where,
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { id: true },
    });
    if (overlap)
      throw new ConflictException("Staff time-off intervals cannot overlap");
    return this.prisma.staffTimeOff.create({
      data: {
        businessId,
        ...target.data,
        startsAt,
        endsAt,
        type: dto.type ?? "TIME_OFF",
        createdByUserId: user.id,
        reason: dto.reason,
      },
    });
  }
  async listTimeOff(
    user: AuthenticatedUser,
    businessId: string,
    memberId: string,
  ) {
    await this.assertScheduleRead(user, businessId, memberId);
    const target = await this.scheduleTarget(businessId, memberId);
    return this.prisma.staffTimeOff.findMany({
      where: { businessId, ...target.where },
      orderBy: { startsAt: "asc" },
    });
  }
  async deleteTimeOff(
    user: AuthenticatedUser,
    businessId: string,
    memberId: string,
    timeOffId: string,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "staff_schedule:manage",
    );
    const target = await this.scheduleTarget(businessId, memberId);
    const value = await this.prisma.staffTimeOff.findFirst({
      where: { id: timeOffId, businessId, ...target.where },
    });
    if (!value) throw new NotFoundException("Staff time-off not found");
    await this.prisma.staffTimeOff.delete({ where: { id: timeOffId } });
  }

  async updateTimeOff(
    user: AuthenticatedUser,
    businessId: string,
    memberId: string,
    timeOffId: string,
    dto: UpdateStaffTimeOffDto,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "staff_schedule:manage",
    );
    const target = await this.scheduleTarget(businessId, memberId);
    const current = await this.prisma.staffTimeOff.findFirst({
      where: { id: timeOffId, businessId, ...target.where },
    });
    if (!current) throw new NotFoundException("Staff time-off not found");
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : current.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : current.endsAt;
    if (startsAt >= endsAt)
      throw new BadRequestException("Time-off start must be before end");
    const overlap = await this.prisma.staffTimeOff.findFirst({
      where: {
        businessId,
        ...target.where,
        id: { not: timeOffId },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { id: true },
    });
    if (overlap)
      throw new ConflictException("Staff time-off intervals cannot overlap");
    return this.prisma.staffTimeOff.update({
      where: { id: timeOffId },
      data: {
        startsAt: dto.startsAt ? startsAt : undefined,
        endsAt: dto.endsAt ? endsAt : undefined,
        type: dto.type,
        reason: dto.reason,
      },
    });
  }

  private async transitionAppointment(
    user: AuthenticatedUser,
    businessId: string,
    appointmentId: string,
    toStatus: AppointmentStatus,
    reason?: string,
  ) {
    try {
      return await this.prisma.$transaction(
        async (tx: PrismaService) => {
          await tx.$queryRawUnsafe(
            "SELECT pg_advisory_xact_lock(hashtext($1))::text",
            `${businessId}:appointment:${appointmentId}`,
          );
          const current = await tx.appointment.findFirst({
            where: { id: appointmentId, businessId },
          });
          if (!current) throw new NotFoundException("Appointment not found");
          const fromStatus = current.status as AppointmentStatus;
          if (!canTransitionAppointment(fromStatus, toStatus))
            throw new ConflictException(
              `Invalid appointment transition: ${fromStatus} -> ${toStatus}`,
            );
          const changedAt = new Date();
          const updated = await tx.appointment.update({
            where: { id: appointmentId },
            data: {
              status: toStatus,
              ...timestampForStatus(toStatus, changedAt),
              ...(toStatus === "CANCELLED"
                ? {
                    cancelledById: user.id,
                    cancellationReason: reason,
                  }
                : {}),
            },
            include: this.includes(),
          });
          await tx.appointmentStatusHistory.create({
            data: {
              businessId,
              appointmentId,
              fromStatus,
              toStatus,
              changedAt,
              changedById: user.id,
              reason,
            },
          });
          return updated;
        },
        { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 },
      );
    } catch (error) {
      if (this.isOverlapError(error))
        throw new ConflictException("Appointment was updated concurrently");
      throw error;
    }
  }

  private async actorScope(user: AuthenticatedUser, businessId: string) {
    const value = await this.actor(user, businessId);
    if (value.manages) return {};
    if (value.membership?.role === "STAFF")
      return { staffMemberId: value.membership.id };
    if (value.customer) return { customerId: value.customer.id };
    throw new ForbiddenException("Appointment access denied");
  }
  private async actor(user: AuthenticatedUser, businessId: string) {
    const [membership, customer] = await Promise.all([
      this.prisma.businessMember.findUnique({
        where: { userId_businessId: { userId: user.id, businessId } },
        select: { id: true, role: true },
      }),
      this.prisma.customer.findUnique({
        where: { userId: user.id },
        select: { id: true },
      }),
    ]);
    const manages =
      user.role === "SUPER_ADMIN" ||
      ["BUSINESS_OWNER", "BUSINESS_ADMIN", "MANAGER"].includes(
        membership?.role,
      );
    return { membership, customer, manages };
  }
  private async assertScheduleRead(
    user: AuthenticatedUser,
    businessId: string,
    memberId: string,
  ) {
    const actor = await this.actor(user, businessId);
    if (actor.manages) return;
    const target = await this.scheduleTarget(businessId, memberId);
    const owns = target.staff
      ? target.staff.userId === user.id
      : actor.membership?.id === memberId;
    if (actor.membership?.role !== "STAFF" || !owns)
      throw new ForbiddenException("Staff schedule access denied");
  }
  private async scheduleTarget(businessId: string, id: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { id, businessId },
      select: { id: true, userId: true },
    });
    if (staff)
      return {
        staff,
        where: { staffId: staff.id },
        data: { staffId: staff.id, businessMemberId: null },
      };
    await this.scopedMember(businessId, id);
    return {
      staff: null,
      where: { businessMemberId: id },
      data: { businessMemberId: id, staffId: null },
    };
  }
  private async scopedAppointment(businessId: string, id: string) {
    const value = await this.prisma.appointment.findFirst({
      where: { id, businessId },
    });
    if (!value) throw new NotFoundException("Appointment not found");
    return value;
  }
  private async scopedMember(businessId: string, id: string) {
    const value = await this.prisma.businessMember.findFirst({
      where: { id, businessId },
    });
    if (!value) throw new NotFoundException("Business member not found");
    return value;
  }
  private includes() {
    return {
      service: true,
      location: true,
      staffMember: {
        select: { id: true, user: { select: { id: true, email: true } } },
      },
      customer: {
        select: { id: true, user: { select: { id: true, email: true } } },
      },
    };
  }
  private isOverlapError(error: unknown) {
    const detail = `${String(error)} ${JSON.stringify(error)}`;
    return (
      (typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2034") ||
      detail.includes("23P01") ||
      detail.includes("Appointment_no_staff_overlap")
    );
  }
}
