/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { BusinessRole } from "@beauty-platform/types";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionsService } from "../auth/permissions.service.js";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import type {
  AddMemberDto,
  CreateBranchDto,
  UpdateBranchDto,
  UpdateMemberDto,
  UpdateSettingsDto,
  UpdateWorkingHoursDto,
} from "./salon-core.dto.js";
import { normalizeSlug } from "./slug.js";

@Injectable()
export class SalonCoreService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async listMembers(user: AuthenticatedUser, businessId: string) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "member:read",
    );
    return this.prisma.businessMember.findMany({
      where: { businessId },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }
  async myMembership(user: AuthenticatedUser, businessId: string) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "business:read",
    );
    if (user.role === "SUPER_ADMIN")
      return { businessId, userId: user.id, role: "SUPER_ADMIN" };
    return this.requiredMembership(user.id, businessId);
  }
  async addMember(
    actor: AuthenticatedUser,
    businessId: string,
    dto: AddMemberDto,
  ) {
    await this.permissions.assertBusinessAccess(
      actor,
      businessId,
      "member:manage",
    );
    await this.assertOwnerAuthority(actor, businessId, dto.role);
    const target = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      select: { id: true, email: true },
    });
    if (!target) throw new NotFoundException("User not found");
    try {
      return await this.prisma.businessMember.create({
        data: { businessId, userId: target.id, role: dto.role },
        select: {
          id: true,
          role: true,
          createdAt: true,
          user: { select: { id: true, email: true } },
        },
      });
    } catch (error) {
      if (this.isUnique(error))
        throw new ConflictException("User is already a business member");
      throw error;
    }
  }
  async updateMember(
    actor: AuthenticatedUser,
    businessId: string,
    memberId: string,
    dto: UpdateMemberDto,
  ) {
    await this.permissions.assertBusinessAccess(
      actor,
      businessId,
      "member:manage",
    );
    const member = await this.scopedMember(businessId, memberId);
    if (member.role === "BUSINESS_OWNER" || dto.role === "BUSINESS_OWNER")
      await this.assertOwnerAuthority(actor, businessId, "BUSINESS_OWNER");
    if (member.role === "BUSINESS_OWNER" && dto.role !== "BUSINESS_OWNER")
      return this.prisma.$transaction(
        async (tx: PrismaService) => {
          await this.assertNotLastOwner(businessId, tx);
          return tx.businessMember.update({
            where: { id: memberId },
            data: { role: dto.role },
            select: {
              id: true,
              role: true,
              createdAt: true,
              user: { select: { id: true, email: true } },
            },
          });
        },
        { isolationLevel: "Serializable" },
      );
    return this.prisma.businessMember.update({
      where: { id: memberId },
      data: { role: dto.role },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, email: true } },
      },
    });
  }
  async removeMember(
    actor: AuthenticatedUser,
    businessId: string,
    memberId: string,
  ) {
    await this.permissions.assertBusinessAccess(
      actor,
      businessId,
      "member:manage",
    );
    const member = await this.scopedMember(businessId, memberId);
    if (member.role === "BUSINESS_OWNER") {
      await this.assertOwnerAuthority(actor, businessId, "BUSINESS_OWNER");
      await this.prisma.$transaction(
        async (tx: PrismaService) => {
          await this.assertNotLastOwner(businessId, tx);
          await tx.businessMember.delete({ where: { id: memberId } });
        },
        { isolationLevel: "Serializable" },
      );
      return;
    }
    await this.prisma.businessMember.delete({ where: { id: memberId } });
  }

  async createBranch(
    user: AuthenticatedUser,
    businessId: string,
    dto: CreateBranchDto,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "branch:create",
    );
    const { slug: requested, ...data } = dto;
    const base = normalizeSlug(requested ?? dto.name);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug = attempt ? `${base}-${attempt + 1}` : base;
      try {
        return await this.prisma.branch.create({
          data: { ...data, businessId, slug },
        });
      } catch (error) {
        if (!this.isUnique(error)) throw error;
        if (attempt === 4)
          throw new ConflictException(
            "Unable to allocate a unique branch slug",
          );
      }
    }
    throw new ConflictException("Unable to allocate a unique branch slug");
  }
  async listBranches(user: AuthenticatedUser, businessId: string) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "branch:read",
    );
    return this.prisma.branch.findMany({
      where: { businessId },
      orderBy: { createdAt: "asc" },
    });
  }
  async getBranch(
    user: AuthenticatedUser,
    businessId: string,
    branchId: string,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "branch:read",
    );
    return this.scopedBranch(businessId, branchId);
  }
  async updateBranch(
    user: AuthenticatedUser,
    businessId: string,
    branchId: string,
    dto: UpdateBranchDto,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "branch:update",
    );
    await this.scopedBranch(businessId, branchId);
    const data = {
      ...dto,
      ...(dto.slug ? { slug: normalizeSlug(dto.slug) } : {}),
    };
    try {
      return await this.prisma.branch.update({ where: { id: branchId }, data });
    } catch (error) {
      if (this.isUnique(error))
        throw new ConflictException("Branch slug already exists");
      throw error;
    }
  }

  async getSettings(user: AuthenticatedUser, businessId: string) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "settings:read",
    );
    return this.prisma.businessSettings.findUniqueOrThrow({
      where: { businessId },
    });
  }
  async updateSettings(
    user: AuthenticatedUser,
    businessId: string,
    dto: UpdateSettingsDto,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "settings:update",
    );
    return this.prisma.businessSettings.update({
      where: { businessId },
      data: dto,
    });
  }

  async getWorkingHours(
    user: AuthenticatedUser,
    businessId: string,
    branchId?: string,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "working_hours:read",
    );
    if (branchId) await this.scopedBranch(businessId, branchId);
    return this.prisma.workingHour.findMany({
      where: { businessId, branchId: branchId ?? null },
      orderBy: { dayOfWeek: "asc" },
    });
  }
  async updateWorkingHours(
    user: AuthenticatedUser,
    businessId: string,
    dto: UpdateWorkingHoursDto,
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "working_hours:update",
    );
    if (dto.branchId) await this.scopedBranch(businessId, dto.branchId);
    for (const hour of dto.hours) {
      if (
        hour.isOpen &&
        (!hour.openTime || !hour.closeTime || hour.openTime >= hour.closeTime)
      )
        throw new BadRequestException(
          "Open time must be earlier than close time",
        );
    }
    return this.prisma.$transaction(async (tx: PrismaService) => {
      await tx.workingHour.deleteMany({
        where: { businessId, branchId: dto.branchId ?? null },
      });
      if (dto.hours.length)
        await tx.workingHour.createMany({
          data: dto.hours.map((hour) => ({
            ...hour,
            openTime: hour.isOpen ? hour.openTime : null,
            closeTime: hour.isOpen ? hour.closeTime : null,
            businessId,
            branchId: dto.branchId ?? null,
          })),
        });
      return tx.workingHour.findMany({
        where: { businessId, branchId: dto.branchId ?? null },
        orderBy: { dayOfWeek: "asc" },
      });
    });
  }

  private async assertOwnerAuthority(
    actor: AuthenticatedUser,
    businessId: string,
    targetRole: BusinessRole,
  ) {
    if (targetRole !== "BUSINESS_OWNER" || actor.role === "SUPER_ADMIN") return;
    const membership = await this.requiredMembership(actor.id, businessId);
    if (membership.role !== "BUSINESS_OWNER")
      throw new ForbiddenException("Only an owner can manage owners");
  }
  private async assertNotLastOwner(
    businessId: string,
    database: PrismaService = this.prisma,
  ) {
    const count = await database.businessMember.count({
      where: { businessId, role: "BUSINESS_OWNER" },
    });
    if (count <= 1)
      throw new ConflictException(
        "The last business owner cannot be removed or demoted",
      );
  }
  private async requiredMembership(userId: string, businessId: string) {
    const value = await this.prisma.businessMember.findUnique({
      where: { userId_businessId: { userId, businessId } },
      select: { id: true, userId: true, businessId: true, role: true },
    });
    if (!value) throw new ForbiddenException("Business access denied");
    return value;
  }
  private async scopedMember(businessId: string, id: string) {
    const value = await this.prisma.businessMember.findFirst({
      where: { id, businessId },
    });
    if (!value) throw new NotFoundException("Business member not found");
    return value;
  }
  private async scopedBranch(businessId: string, id: string) {
    const value = await this.prisma.branch.findFirst({
      where: { id, businessId },
    });
    if (!value) throw new NotFoundException("Branch not found");
    return value;
  }
  private isUnique(error: unknown) {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    );
  }
}
