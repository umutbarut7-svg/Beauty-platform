/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionsService } from "../auth/permissions.service.js";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import { normalizeSlug } from "../businesses/slug.js";
import type {
  CreateBusinessCustomerDto,
  CreateCustomerNoteDto,
  CustomerListQueryDto,
  UpdateBusinessCustomerDto,
  UpdateCustomerNoteDto,
  CreateCustomerTagDto,
  UpdateCustomerTagDto,
} from "./customer.dto.js";

@Injectable()
export class CustomersService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async create(
    user: AuthenticatedUser,
    businessId: string,
    dto: CreateBusinessCustomerDto,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "customer:manage",
    );
    const data = this.normalized(dto);
    if (dto.preferredStaffId)
      await this.assertPreferredStaff(businessId, dto.preferredStaffId);
    await this.assertContactAvailable(businessId, data.phone, data.email);
    try {
      return await this.prisma.businessCustomer.create({
        data: { businessId, ...data },
      });
    } catch (error) {
      if (this.isUnique(error))
        throw new ConflictException(
          "A customer with this phone or email already exists",
        );
      throw error;
    }
  }

  async list(
    user: AuthenticatedUser,
    businessId: string,
    query: CustomerListQueryDto,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "customer:read",
    );
    const search = query.search?.trim();
    const normalizedPhone = search ? normalizePhone(search) : undefined;
    const where = {
      businessId,
      archivedAt: query.archived ? { not: null } : null,
      ...(query.preferredStaffId
        ? { preferredStaffId: query.preferredStaffId }
        : {}),
      ...(query.tagId ? { tags: { some: { tagId: query.tagId } } } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { startsWith: search, mode: "insensitive" } },
              { lastName: { startsWith: search, mode: "insensitive" } },
              {
                email: {
                  startsWith: normalizeEmail(search),
                  mode: "insensitive",
                },
              },
              ...(normalizedPhone
                ? [{ phone: { startsWith: normalizedPhone } }]
                : []),
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const orderBy =
      query.sort === "name"
        ? [
            { lastName: query.direction },
            { firstName: query.direction },
            { id: "asc" },
          ]
        : [{ createdAt: query.direction }, { id: "asc" }];
    const [items, total] = await Promise.all([
      this.prisma.businessCustomer.findMany({
        where,
        orderBy,
        skip,
        take: query.limit,
        include: { tags: { include: { tag: true } } },
      }),
      this.prisma.businessCustomer.count({ where }),
    ]);
    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    };
  }

  async detail(
    user: AuthenticatedUser,
    businessId: string,
    customerId: string,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "customer:read",
    );
    const customer = await this.scopedCustomer(businessId, customerId);
    const now = new Date();
    const [
      recentAppointments,
      upcomingCount,
      completedCount,
      cancelledCount,
      noShowCount,
      lastVisit,
      completedValue,
      totalCount,
      nextAppointment,
    ] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { businessId, businessCustomerId: customerId },
        orderBy: { startsAt: "desc" },
        take: 20,
        include: {
          service: true,
          location: true,
          staffMember: {
            select: { id: true, user: { select: { email: true } } },
          },
        },
      }),
      this.prisma.appointment.count({
        where: {
          businessId,
          businessCustomerId: customerId,
          startsAt: { gte: now },
          status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS"] },
        },
      }),
      this.prisma.appointment.count({
        where: {
          businessId,
          businessCustomerId: customerId,
          status: "COMPLETED",
        },
      }),
      this.prisma.appointment.count({
        where: {
          businessId,
          businessCustomerId: customerId,
          status: "CANCELLED",
        },
      }),
      this.prisma.appointment.count({
        where: {
          businessId,
          businessCustomerId: customerId,
          status: "NO_SHOW",
        },
      }),
      this.prisma.appointment.findFirst({
        where: {
          businessId,
          businessCustomerId: customerId,
          status: "COMPLETED",
        },
        orderBy: { completedAt: "desc" },
        select: { completedAt: true, startsAt: true },
      }),
      this.prisma.appointment.aggregate({
        where: {
          businessId,
          businessCustomerId: customerId,
          status: "COMPLETED",
        },
        _sum: { price: true },
        _avg: { price: true },
      }),
      this.prisma.appointment.count({
        where: { businessId, businessCustomerId: customerId },
      }),
      this.prisma.appointment.findFirst({
        where: {
          businessId,
          businessCustomerId: customerId,
          startsAt: { gte: now },
          status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS"] },
        },
        orderBy: { startsAt: "asc" },
        select: { startsAt: true },
      }),
    ]);
    return {
      customer,
      summary: {
        upcomingAppointments: upcomingCount,
        totalAppointments: totalCount,
        completedAppointments: completedCount,
        cancelledAppointments: cancelledCount,
        noShowAppointments: noShowCount,
        totalVisits: completedCount,
        lastVisitAt: lastVisit?.completedAt ?? lastVisit?.startsAt ?? null,
        completedAppointmentValue: completedValue._sum.price ?? null,
        totalSpend: completedValue._sum.price ?? null,
        averageSpend: completedValue._avg.price ?? null,
        nextAppointmentAt: nextAppointment?.startsAt ?? null,
      },
      recentAppointments,
    };
  }

  async update(
    user: AuthenticatedUser,
    businessId: string,
    customerId: string,
    dto: UpdateBusinessCustomerDto,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "customer:manage",
    );
    const current = await this.scopedCustomer(businessId, customerId);
    const data = this.normalized(dto);
    if (dto.preferredStaffId)
      await this.assertPreferredStaff(businessId, dto.preferredStaffId);
    await this.assertContactAvailable(
      businessId,
      data.phone,
      data.email,
      customerId,
    );
    try {
      return await this.prisma.businessCustomer.update({
        where: { id: current.id },
        data: {
          ...data,
          archivedAt:
            dto.archived === undefined
              ? undefined
              : dto.archived
                ? new Date()
                : null,
        },
      });
    } catch (error) {
      if (this.isUnique(error))
        throw new ConflictException(
          "A customer with this phone or email already exists",
        );
      throw error;
    }
  }

  async listNotes(
    user: AuthenticatedUser,
    businessId: string,
    customerId: string,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "customer:read",
    );
    await this.scopedCustomer(businessId, customerId);
    return this.prisma.customerNote.findMany({
      where: { businessId, customerId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { author: { select: { id: true, email: true } } },
    });
  }
  async addNote(
    user: AuthenticatedUser,
    businessId: string,
    customerId: string,
    dto: CreateCustomerNoteDto,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "customer:manage",
    );
    await this.scopedCustomer(businessId, customerId);
    return this.prisma.customerNote.create({
      data: {
        businessId,
        customerId,
        authorUserId: user.id,
        content: dto.content.trim(),
      },
    });
  }
  async updateNote(
    user: AuthenticatedUser,
    businessId: string,
    customerId: string,
    noteId: string,
    dto: UpdateCustomerNoteDto,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "customer:manage",
    );
    const note = await this.prisma.customerNote.findFirst({
      where: { id: noteId, businessId, customerId },
    });
    if (!note) throw new NotFoundException("Customer note not found");
    return this.prisma.customerNote.update({
      where: { id: noteId },
      data: { content: dto.content.trim() },
    });
  }

  async delete(
    user: AuthenticatedUser,
    businessId: string,
    customerId: string,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "customer:manage",
    );
    const customer = await this.scopedCustomer(businessId, customerId);
    return this.prisma.businessCustomer.update({
      where: { id: customer.id },
      data: { archivedAt: new Date() },
    });
  }
  async history(
    user: AuthenticatedUser,
    businessId: string,
    customerId: string,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "customer:read",
    );
    await this.scopedCustomer(businessId, customerId);
    return this.prisma.appointment.findMany({
      where: { businessId, businessCustomerId: customerId },
      orderBy: [{ startsAt: "desc" }, { id: "desc" }],
      take: 100,
      include: { service: true, staff: true, location: true },
    });
  }
  async summary(
    user: AuthenticatedUser,
    businessId: string,
    customerId: string,
  ) {
    const detail = await this.detail(user, businessId, customerId);
    return detail.summary;
  }
  async deleteNote(
    user: AuthenticatedUser,
    businessId: string,
    customerId: string,
    noteId: string,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "customer:manage",
    );
    const note = await this.prisma.customerNote.findFirst({
      where: { id: noteId, businessId, customerId },
    });
    if (!note) throw new NotFoundException("Customer note not found");
    await this.prisma.customerNote.delete({ where: { id: noteId } });
  }
  async listTags(user: AuthenticatedUser, businessId: string) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "customer:read",
    );
    return this.prisma.customerTag.findMany({
      where: { businessId },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }
  async createTag(
    user: AuthenticatedUser,
    businessId: string,
    dto: CreateCustomerTagDto,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "customer:manage",
    );
    try {
      return await this.prisma.customerTag.create({
        data: {
          businessId,
          name: dto.name.trim(),
          slug: dto.slug ?? normalizeSlug(dto.name),
          color: dto.color,
        },
      });
    } catch (error) {
      if (this.isUnique(error))
        throw new ConflictException("Customer tag already exists");
      throw error;
    }
  }
  async updateTag(
    user: AuthenticatedUser,
    businessId: string,
    tagId: string,
    dto: UpdateCustomerTagDto,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "customer:manage",
    );
    await this.scopedTag(businessId, tagId);
    return this.prisma.customerTag.update({
      where: { id: tagId },
      data: { ...dto, name: dto.name?.trim() },
    });
  }
  async deleteTag(user: AuthenticatedUser, businessId: string, tagId: string) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "customer:manage",
    );
    await this.scopedTag(businessId, tagId);
    await this.prisma.customerTag.delete({ where: { id: tagId } });
  }
  async assignTag(
    user: AuthenticatedUser,
    businessId: string,
    customerId: string,
    tagId: string,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "customer:manage",
    );
    await Promise.all([
      this.scopedCustomer(businessId, customerId),
      this.scopedTag(businessId, tagId),
    ]);
    try {
      return await this.prisma.customerTagAssignment.create({
        data: { businessId, customerId, tagId },
      });
    } catch (error) {
      if (this.isUnique(error))
        throw new ConflictException("Customer tag is already assigned");
      throw error;
    }
  }
  async removeTag(
    user: AuthenticatedUser,
    businessId: string,
    customerId: string,
    tagId: string,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "customer:manage",
    );
    const assignment = await this.prisma.customerTagAssignment.findFirst({
      where: { businessId, customerId, tagId },
    });
    if (!assignment)
      throw new NotFoundException("Customer tag assignment not found");
    await this.prisma.customerTagAssignment.delete({
      where: { customerId_tagId: { customerId, tagId } },
    });
  }

  private async scopedCustomer(businessId: string, id: string) {
    const value = await this.prisma.businessCustomer.findFirst({
      where: { id, businessId },
    });
    if (!value) throw new NotFoundException("Customer not found");
    return value;
  }
  private normalized(
    dto: CreateBusinessCustomerDto | UpdateBusinessCustomerDto,
  ) {
    return {
      ...(dto.firstName === undefined
        ? {}
        : { firstName: dto.firstName.trim() }),
      ...(dto.lastName === undefined ? {} : { lastName: dto.lastName.trim() }),
      ...(dto.phone === undefined ? {} : { phone: normalizePhone(dto.phone) }),
      ...(dto.email === undefined ? {} : { email: normalizeEmail(dto.email) }),
      ...(dto.birthDate === undefined
        ? {}
        : { birthDate: new Date(`${dto.birthDate}T00:00:00.000Z`) }),
      ...(dto.gender === undefined ? {} : { gender: dto.gender.trim() }),
      ...(dto.notes === undefined ? {} : { notes: dto.notes.trim() }),
      ...(dto.source === undefined ? {} : { source: dto.source.trim() }),
      ...(dto.preferredStaffId === undefined
        ? {}
        : { preferredStaffId: dto.preferredStaffId }),
      ...(dto.marketingConsent === undefined
        ? {}
        : { marketingConsent: dto.marketingConsent }),
      ...(dto.smsConsent === undefined ? {} : { smsConsent: dto.smsConsent }),
      ...(dto.emailConsent === undefined
        ? {}
        : { emailConsent: dto.emailConsent }),
    };
  }
  private async assertContactAvailable(
    businessId: string,
    phone?: string,
    email?: string,
    excludeId?: string,
  ) {
    if (!phone && !email) return;
    const duplicate = await this.prisma.businessCustomer.findFirst({
      where: {
        businessId,
        id: excludeId ? { not: excludeId } : undefined,
        OR: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])],
      },
      select: { id: true },
    });
    if (duplicate)
      throw new ConflictException(
        "A customer with this phone or email already exists",
      );
  }
  private isUnique(error: unknown) {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    );
  }
  private async scopedTag(businessId: string, id: string) {
    const tag = await this.prisma.customerTag.findFirst({
      where: { id, businessId },
    });
    if (!tag) throw new NotFoundException("Customer tag not found");
    return tag;
  }
  private async assertPreferredStaff(businessId: string, staffId: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, businessId },
      select: { id: true },
    });
    if (!staff) throw new NotFoundException("Preferred staff not found");
  }
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}
export function normalizePhone(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");
  return digits ? `${trimmed.startsWith("+") ? "+" : ""}${digits}` : "";
}
