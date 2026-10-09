/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionsService } from "../auth/permissions.service.js";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import type {
  AssignStaffServiceDto,
  CreateCatalogServiceDto,
  CreateServiceCategoryDto,
  UpdateCatalogServiceDto,
  UpdateServiceCategoryDto,
  UpdateStaffServiceDto,
} from "./catalog.dto.js";
import { normalizeSlug } from "./slug.js";

@Injectable()
export class CatalogService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async createCategory(
    user: AuthenticatedUser,
    businessId: string,
    dto: CreateServiceCategoryDto,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "service_category:create",
    );
    const { slug: requested, ...data } = dto;
    return this.createWithSlug(
      "category",
      businessId,
      normalizeSlug(requested ?? dto.name),
      (slug) =>
        this.prisma.serviceCategory.create({
          data: { ...data, businessId, slug },
        }),
    );
  }
  async listCategories(user: AuthenticatedUser, businessId: string) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "service_category:read",
    );
    const staff = await this.isStaff(user, businessId);
    return this.prisma.serviceCategory.findMany({
      where: { businessId, ...(staff ? { isActive: true } : {}) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  }
  async getCategory(
    user: AuthenticatedUser,
    businessId: string,
    categoryId: string,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "service_category:read",
    );
    return this.scopedCategory(
      businessId,
      categoryId,
      await this.isStaff(user, businessId),
    );
  }
  async updateCategory(
    user: AuthenticatedUser,
    businessId: string,
    categoryId: string,
    dto: UpdateServiceCategoryDto,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "service_category:update",
    );
    await this.scopedCategory(businessId, categoryId);
    try {
      return await this.prisma.serviceCategory.update({
        where: { id: categoryId },
        data: {
          ...dto,
          ...(dto.slug ? { slug: normalizeSlug(dto.slug) } : {}),
        },
      });
    } catch (error) {
      this.rethrowConstraint(error, "Category slug already exists");
    }
  }
  async deleteCategory(
    user: AuthenticatedUser,
    businessId: string,
    categoryId: string,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "service_category:delete",
    );
    await this.scopedCategory(businessId, categoryId);
    try {
      await this.prisma.serviceCategory.delete({ where: { id: categoryId } });
    } catch (error) {
      this.rethrowConstraint(error, "Category with services cannot be deleted");
    }
  }

  async createService(
    user: AuthenticatedUser,
    businessId: string,
    dto: CreateCatalogServiceDto,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "service:create",
    );
    await this.scopedCategory(businessId, dto.categoryId);
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { currency: true },
    });
    if (!business) throw new NotFoundException("Business not found");
    const { slug: requested, ...data } = dto;
    return this.createWithSlug(
      "service",
      businessId,
      normalizeSlug(requested ?? dto.name),
      (slug) =>
        this.prisma.service.create({
          data: {
            ...data,
            businessId,
            slug,
            currency: dto.currency ?? business.currency,
          },
          include: { category: true },
        }),
    );
  }
  async listServices(user: AuthenticatedUser, businessId: string) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "service:read",
    );
    const staff = await this.isStaff(user, businessId);
    return this.prisma.service.findMany({
      where: {
        businessId,
        ...(staff ? { isActive: true, isBookable: true } : {}),
      },
      include: { category: true },
      orderBy: { name: "asc" },
    });
  }
  async getService(
    user: AuthenticatedUser,
    businessId: string,
    serviceId: string,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "service:read",
    );
    return this.scopedService(
      businessId,
      serviceId,
      await this.isStaff(user, businessId),
    );
  }
  async updateService(
    user: AuthenticatedUser,
    businessId: string,
    serviceId: string,
    dto: UpdateCatalogServiceDto,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "service:update",
    );
    await this.scopedService(businessId, serviceId);
    if (dto.categoryId) await this.scopedCategory(businessId, dto.categoryId);
    try {
      return await this.prisma.service.update({
        where: { id: serviceId },
        data: {
          ...dto,
          ...(dto.slug ? { slug: normalizeSlug(dto.slug) } : {}),
        },
        include: { category: true },
      });
    } catch (error) {
      this.rethrowConstraint(error, "Service slug already exists");
    }
  }
  async deleteService(
    user: AuthenticatedUser,
    businessId: string,
    serviceId: string,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "service:delete",
    );
    await this.scopedService(businessId, serviceId);
    try {
      await this.prisma.service.delete({ where: { id: serviceId } });
    } catch (error) {
      this.rethrowConstraint(
        error,
        "Service with appointments cannot be deleted",
      );
    }
  }

  async assignService(
    user: AuthenticatedUser,
    businessId: string,
    memberId: string,
    dto: AssignStaffServiceDto,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "staff_service:manage",
    );
    const [target] = await Promise.all([
      this.staffTarget(businessId, memberId),
      this.scopedService(businessId, dto.serviceId),
    ]);
    try {
      if (target.staff)
        return await this.prisma.staffProfileService.create({
          data: { businessId, staffId: target.staff.id, ...dto },
          include: { service: true },
        });
      return await this.prisma.staffService.create({
        data: { businessId, businessMemberId: memberId, ...dto },
        include: { service: true },
      });
    } catch (error) {
      this.rethrowConstraint(error, "Staff service assignment already exists");
    }
  }
  async listStaffServices(
    user: AuthenticatedUser,
    businessId: string,
    memberId: string,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "service:read",
    );
    const target = await this.staffTarget(businessId, memberId);
    if (target.staff) {
      if (user.role === "STAFF" && target.staff.userId !== user.id)
        throw new ForbiddenException(
          "Staff can only access their own services",
        );
      return this.prisma.staffProfileService.findMany({
        where: { businessId, staffId: target.staff.id },
        include: { service: { include: { category: true } } },
        orderBy: { createdAt: "asc" },
      });
    }
    await this.assertStaffSelf(user, businessId, memberId);
    return this.prisma.staffService.findMany({
      where: { businessId, businessMemberId: memberId },
      include: { service: { include: { category: true } } },
      orderBy: { createdAt: "asc" },
    });
  }
  async updateStaffService(
    user: AuthenticatedUser,
    businessId: string,
    memberId: string,
    serviceId: string,
    dto: UpdateStaffServiceDto,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "staff_service:manage",
    );
    const target = await this.staffTarget(businessId, memberId);
    if (target.staff) {
      await this.scopedProfileAssignment(
        businessId,
        target.staff.id,
        serviceId,
      );
      return this.prisma.staffProfileService.update({
        where: { staffId_serviceId: { staffId: target.staff.id, serviceId } },
        data: dto,
        include: { service: true },
      });
    }
    await this.scopedAssignment(businessId, memberId, serviceId);
    return this.prisma.staffService.update({
      where: {
        businessMemberId_serviceId: { businessMemberId: memberId, serviceId },
      },
      data: dto,
      include: { service: true },
    });
  }
  async deleteStaffService(
    user: AuthenticatedUser,
    businessId: string,
    memberId: string,
    serviceId: string,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "staff_service:manage",
    );
    const target = await this.staffTarget(businessId, memberId);
    if (target.staff) {
      await this.scopedProfileAssignment(
        businessId,
        target.staff.id,
        serviceId,
      );
      await this.prisma.staffProfileService.delete({
        where: { staffId_serviceId: { staffId: target.staff.id, serviceId } },
      });
      return;
    }
    await this.scopedAssignment(businessId, memberId, serviceId);
    await this.prisma.staffService.delete({
      where: {
        businessMemberId_serviceId: { businessMemberId: memberId, serviceId },
      },
    });
  }

  private async scopedCategory(
    businessId: string,
    id: string,
    activeOnly = false,
  ) {
    const value = await this.prisma.serviceCategory.findFirst({
      where: { id, businessId, ...(activeOnly ? { isActive: true } : {}) },
    });
    if (!value) throw new NotFoundException("Service category not found");
    return value;
  }
  private async scopedService(
    businessId: string,
    id: string,
    bookableOnly = false,
  ) {
    const value = await this.prisma.service.findFirst({
      where: {
        id,
        businessId,
        ...(bookableOnly ? { isActive: true, isBookable: true } : {}),
      },
      include: { category: true },
    });
    if (!value) throw new NotFoundException("Service not found");
    return value;
  }
  private async scopedMember(businessId: string, id: string) {
    const value = await this.prisma.businessMember.findFirst({
      where: { id, businessId },
    });
    if (!value) throw new NotFoundException("Business member not found");
    return value;
  }
  private async staffTarget(businessId: string, id: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { id, businessId },
      select: { id: true, userId: true },
    });
    if (staff) return { staff, member: null };
    return { staff: null, member: await this.scopedMember(businessId, id) };
  }
  private async scopedProfileAssignment(
    businessId: string,
    staffId: string,
    serviceId: string,
  ) {
    const value = await this.prisma.staffProfileService.findFirst({
      where: { businessId, staffId, serviceId },
    });
    if (!value)
      throw new NotFoundException("Staff service assignment not found");
    return value;
  }
  private async scopedAssignment(
    businessId: string,
    businessMemberId: string,
    serviceId: string,
  ) {
    const value = await this.prisma.staffService.findFirst({
      where: { businessId, businessMemberId, serviceId },
    });
    if (!value)
      throw new NotFoundException("Staff service assignment not found");
    return value;
  }
  private async isStaff(user: AuthenticatedUser, businessId: string) {
    if (user.role === "SUPER_ADMIN") return false;
    const membership = await this.prisma.businessMember.findUnique({
      where: { userId_businessId: { userId: user.id, businessId } },
      select: { role: true },
    });
    return membership?.role === "STAFF";
  }
  private async assertStaffSelf(
    user: AuthenticatedUser,
    businessId: string,
    memberId: string,
  ) {
    if (!(await this.isStaff(user, businessId))) return;
    const membership = await this.prisma.businessMember.findUnique({
      where: { userId_businessId: { userId: user.id, businessId } },
      select: { id: true },
    });
    if (membership?.id !== memberId)
      throw new ForbiddenException("Staff can only access their own services");
  }
  private async createWithSlug<T>(
    label: string,
    businessId: string,
    base: string,
    create: (slug: string) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug = attempt ? `${base}-${attempt + 1}` : base;
      try {
        return await create(slug);
      } catch (error) {
        if (!this.isCode(error, "P2002")) throw error;
        if (attempt === 4)
          throw new ConflictException(
            `Unable to allocate a unique ${label} slug`,
          );
      }
    }
    throw new ConflictException(
      `Unable to allocate a unique ${label} slug for ${businessId}`,
    );
  }
  private rethrowConstraint(error: unknown, message: string): never {
    if (this.isCode(error, "P2002") || this.isCode(error, "P2003"))
      throw new ConflictException(message);
    throw error;
  }
  private isCode(error: unknown, code: string) {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === code
    );
  }
}
