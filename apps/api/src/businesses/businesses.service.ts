/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import {
  type Permission,
  PermissionsService,
} from "../auth/permissions.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { CreateBusinessDto, UpdateBusinessDto } from "./business.dto.js";
import type { CreateLocationDto, UpdateLocationDto } from "./location.dto.js";
import type { CreateStaffDto, UpdateStaffDto } from "./staff.dto.js";
import type { CreateServiceDto, UpdateServiceDto } from "./service.dto.js";
import { normalizeSlug } from "./slug.js";

const DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

@Injectable()
export class BusinessesService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async createBusiness(user: AuthenticatedUser, dto: CreateBusinessDto) {
    if (!this.permissions.has(user.role, "business:create"))
      throw new ForbiddenException("Insufficient permission");
    const { slug: requestedSlug, ...data } = dto;
    const baseSlug = normalizeSlug(requestedSlug ?? dto.name);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
      try {
        return await this.prisma.$transaction(async (tx: PrismaService) => {
          const business = await tx.business.create({
            data: { ...data, slug },
          });
          await tx.businessSettings.create({
            data: {
              businessId: business.id,
              defaultCurrency: dto.currency ?? "TRY",
              timezone: dto.timezone ?? "Europe/Istanbul",
            },
          });
          await tx.businessMember.create({
            data: {
              businessId: business.id,
              userId: user.id,
              role: "BUSINESS_OWNER",
            },
          });
          await tx.workingHour.createMany({
            data: DAYS.map((dayOfWeek, index) => ({
              businessId: business.id,
              dayOfWeek,
              isOpen: index < 6,
              openTime: index < 6 ? "09:00" : null,
              closeTime: index < 6 ? "18:00" : null,
            })),
          });
          return business;
        });
      } catch (error) {
        if (!this.isUniqueError(error) || attempt === 4)
          this.rethrowUnique(error, "Business slug already exists");
      }
    }
    throw new ConflictException("Business slug already exists");
  }

  listBusinesses(user: AuthenticatedUser) {
    return this.prisma.business.findMany({
      where:
        user.role === "SUPER_ADMIN"
          ? {}
          : { memberships: { some: { userId: user.id } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async getBusiness(user: AuthenticatedUser, businessId: string) {
    await this.authorize(user, businessId, "business:read");
    return this.required(
      this.prisma.business.findUnique({ where: { id: businessId } }),
      "Business",
    );
  }

  async updateBusiness(
    user: AuthenticatedUser,
    businessId: string,
    dto: UpdateBusinessDto,
  ) {
    await this.authorize(user, businessId, "business:update");
    await this.getScoped("business", businessId, businessId);
    try {
      return await this.prisma.business.update({
        where: { id: businessId },
        data: dto,
      });
    } catch (error) {
      this.rethrowUnique(error, "Business slug already exists");
    }
  }

  async createLocation(
    user: AuthenticatedUser,
    businessId: string,
    dto: CreateLocationDto,
  ) {
    await this.authorize(user, businessId, "location:create");
    return this.prisma.location.create({ data: { ...dto, businessId } });
  }
  async listLocations(user: AuthenticatedUser, businessId: string) {
    await this.authorize(user, businessId, "location:read");
    return this.prisma.location.findMany({
      where: { businessId },
      orderBy: { createdAt: "asc" },
    });
  }
  async getLocation(user: AuthenticatedUser, businessId: string, id: string) {
    await this.authorize(user, businessId, "location:read");
    return this.getScoped("location", businessId, id);
  }
  async updateLocation(
    user: AuthenticatedUser,
    businessId: string,
    id: string,
    dto: UpdateLocationDto,
  ) {
    await this.authorize(user, businessId, "location:update");
    await this.getScoped("location", businessId, id);
    return this.prisma.location.update({ where: { id }, data: dto });
  }
  async deleteLocation(
    user: AuthenticatedUser,
    businessId: string,
    id: string,
  ) {
    await this.authorize(user, businessId, "location:delete");
    await this.getScoped("location", businessId, id);
    await this.prisma.location.delete({ where: { id } });
  }

  async createStaff(
    user: AuthenticatedUser,
    businessId: string,
    dto: CreateStaffDto,
  ) {
    await this.authorize(user, businessId, "staff:create");
    const { locationIds = [], userId, ...data } = dto;
    await this.assertLocations(businessId, locationIds);
    if (userId) await this.assertStaffUser(businessId, userId);
    return this.prisma.staff.create({
      data: {
        ...data,
        userId,
        businessId,
        locations: {
          create: [...new Set(locationIds)].map((locationId) => ({
            businessId,
            locationId,
          })),
        },
      },
      include: { locations: true },
    });
  }
  async listStaff(user: AuthenticatedUser, businessId: string) {
    await this.authorize(user, businessId, "staff:read");
    return this.prisma.staff.findMany({
      where: {
        businessId,
        ...(user.role === "STAFF" ? { userId: user.id } : {}),
      },
      include: { locations: true, services: true },
      orderBy: { createdAt: "asc" },
    });
  }
  async getStaff(user: AuthenticatedUser, businessId: string, id: string) {
    await this.authorize(user, businessId, "staff:read");
    const staff = await this.getScoped("staff", businessId, id, {
      locations: true,
      services: true,
    });
    if (user.role === "STAFF" && staff.userId !== user.id)
      throw new ForbiddenException("Staff can only access their own profile");
    return staff;
  }
  async updateStaff(
    user: AuthenticatedUser,
    businessId: string,
    id: string,
    dto: UpdateStaffDto,
  ) {
    await this.authorize(user, businessId, "staff:update");
    await this.getScoped("staff", businessId, id);
    const { locationIds, userId, ...data } = dto;
    if (locationIds) await this.assertLocations(businessId, locationIds);
    if (userId) await this.assertStaffUser(businessId, userId);
    return this.prisma.$transaction(async (tx: PrismaService) => {
      if (locationIds) {
        await tx.staffLocation.deleteMany({
          where: { businessId, staffId: id },
        });
        await tx.staffLocation.createMany({
          data: [...new Set(locationIds)].map((locationId) => ({
            businessId,
            staffId: id,
            locationId,
          })),
        });
      }
      return tx.staff.update({
        where: { id },
        data: { ...data, ...(userId !== undefined ? { userId } : {}) },
        include: { locations: true },
      });
    });
  }
  async deleteStaff(user: AuthenticatedUser, businessId: string, id: string) {
    await this.authorize(user, businessId, "staff:delete");
    await this.getScoped("staff", businessId, id);
    await this.prisma.staff.delete({ where: { id } });
  }

  async createService(
    user: AuthenticatedUser,
    businessId: string,
    dto: CreateServiceDto,
  ) {
    await this.authorize(user, businessId, "service:create");
    return this.prisma.service.create({
      data: { ...dto, currency: dto.currency ?? "TRY", businessId },
    });
  }
  async listServices(user: AuthenticatedUser, businessId: string) {
    await this.authorize(user, businessId, "service:read");
    return this.prisma.service.findMany({
      where: { businessId },
      orderBy: { createdAt: "asc" },
    });
  }
  async getService(user: AuthenticatedUser, businessId: string, id: string) {
    await this.authorize(user, businessId, "service:read");
    return this.getScoped("service", businessId, id);
  }
  async updateService(
    user: AuthenticatedUser,
    businessId: string,
    id: string,
    dto: UpdateServiceDto,
  ) {
    await this.authorize(user, businessId, "service:update");
    await this.getScoped("service", businessId, id);
    return this.prisma.service.update({ where: { id }, data: dto });
  }
  async deleteService(user: AuthenticatedUser, businessId: string, id: string) {
    await this.authorize(user, businessId, "service:delete");
    await this.getScoped("service", businessId, id);
    await this.prisma.service.delete({ where: { id } });
  }

  async addStaffService(
    user: AuthenticatedUser,
    businessId: string,
    staffId: string,
    serviceId: string,
  ) {
    await this.authorize(user, businessId, "staff_service:manage");
    await Promise.all([
      this.getScoped("staff", businessId, staffId),
      this.getScoped("service", businessId, serviceId),
    ]);
    return this.prisma.staffProfileService.upsert({
      where: { staffId_serviceId: { staffId, serviceId } },
      update: {},
      create: { businessId, staffId, serviceId },
    });
  }
  async removeStaffService(
    user: AuthenticatedUser,
    businessId: string,
    staffId: string,
    serviceId: string,
  ) {
    await this.authorize(user, businessId, "staff_service:manage");
    const relation = await this.prisma.staffProfileService.findFirst({
      where: { businessId, staffId, serviceId },
    });
    if (!relation) throw new NotFoundException("Staff service not found");
    await this.prisma.staffProfileService.delete({
      where: { staffId_serviceId: { staffId, serviceId } },
    });
  }

  private authorize(
    user: AuthenticatedUser,
    businessId: string,
    permission: Permission,
  ) {
    return this.permissions.assertBusinessAccess(user, businessId, permission);
  }
  private async getScoped(
    model: "business" | "location" | "staff" | "service",
    businessId: string,
    id: string,
    include?: object,
  ) {
    const value = await this.prisma[model].findFirst({
      where: model === "business" ? { id: businessId } : { id, businessId },
      include,
    });
    if (!value) throw new NotFoundException(`${model} not found`);
    return value;
  }
  private async assertLocations(businessId: string, ids: string[]) {
    const unique = [...new Set(ids)];
    if (!unique.length) return;
    const count = await this.prisma.location.count({
      where: { businessId, id: { in: unique } },
    });
    if (count !== unique.length)
      throw new NotFoundException(
        "One or more locations were not found in this business",
      );
  }
  private async assertStaffUser(businessId: string, userId: string) {
    const membership = await this.prisma.businessMember.findUnique({
      where: { userId_businessId: { userId, businessId } },
      select: { role: true },
    });
    if (
      !membership ||
      !["STAFF", "BUSINESS_ADMIN", "BUSINESS_OWNER"].includes(membership.role)
    )
      throw new NotFoundException(
        "User is not an eligible member of this business",
      );
  }
  private async required<T>(
    promise: Promise<T | null>,
    name: string,
  ): Promise<T> {
    const value = await promise;
    if (!value) throw new NotFoundException(`${name} not found`);
    return value;
  }
  private rethrowUnique(error: unknown, message: string): never {
    if (this.isUniqueError(error)) throw new ConflictException(message);
    throw error;
  }
  private isUniqueError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    );
  }
}
