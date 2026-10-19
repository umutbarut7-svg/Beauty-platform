/* eslint-disable @typescript-eslint/consistent-type-imports, @typescript-eslint/no-explicit-any */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionsService } from "../auth/permissions.service.js";
import type {
  CategoryAttributeValue,
  CategoryCapability,
  CategoryContext,
} from "./category.types.js";

@Injectable()
export class CategoryEngineService {
  private readonly logger = new Logger(CategoryEngineService.name);
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  private get categoryDb(): any {
    return this.db as any;
  }

  async registry() {
    return this.categoryDb.platformCategory.findMany({
      where: { isActive: true },
      select: {
        id: true,
        key: true,
        name: true,
        version: true,
        capabilities: { select: { capability: true } },
        subcategories: {
          where: { isActive: true },
          select: { id: true, key: true, name: true },
        },
        serviceTypes: {
          where: { isActive: true },
          select: { id: true, subcategoryId: true, key: true, name: true },
        },
      },
      orderBy: { name: "asc" },
    });
  }

  async tenantRegistry(user: AuthenticatedUser, businessId: string) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "service_category:read",
    );
    return this.categoryDb.tenantCategoryConfiguration.findMany({
      where: { businessId },
      include: { category: true, subcategory: true, serviceType: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async configure(
    user: AuthenticatedUser,
    businessId: string,
    input: {
      categoryId: string;
      subcategoryId?: string;
      serviceTypeId?: string;
      enabled: boolean;
      settings?: Record<string, string | number | boolean>;
    },
  ) {
    await this.permissions.assertBusinessAccess(
      user,
      businessId,
      "service_category:update",
    );
    const category = await this.categoryDb.platformCategory.findUnique({
      where: { id: input.categoryId },
      select: { id: true },
    });
    if (!category) throw new NotFoundException("Category not found");
    if (input.subcategoryId) {
      const sub = await this.categoryDb.platformSubcategory.findFirst({
        where: { id: input.subcategoryId, categoryId: input.categoryId },
        select: { id: true },
      });
      if (!sub)
        throw new BadRequestException("Subcategory is outside the category");
    }
    if (input.serviceTypeId) {
      const type = await this.categoryDb.platformServiceType.findFirst({
        where: {
          id: input.serviceTypeId,
          categoryId: input.categoryId,
          ...(input.subcategoryId
            ? { subcategoryId: input.subcategoryId }
            : {}),
        },
        select: { id: true },
      });
      if (!type)
        throw new BadRequestException(
          "Service type is outside the category hierarchy",
        );
    }
    const existing =
      await this.categoryDb.tenantCategoryConfiguration.findFirst({
        where: {
          businessId,
          categoryId: input.categoryId,
          subcategoryId: input.subcategoryId ?? null,
          serviceTypeId: input.serviceTypeId ?? null,
        },
      });
    const data = {
      enabled: input.enabled,
      settings: input.settings ?? undefined,
    };
    return existing
      ? this.categoryDb.tenantCategoryConfiguration.update({
          where: { id: existing.id },
          data: { ...data, version: { increment: 1 } },
        })
      : this.categoryDb.tenantCategoryConfiguration.create({
          data: {
            businessId,
            categoryId: input.categoryId,
            subcategoryId: input.subcategoryId,
            serviceTypeId: input.serviceTypeId,
            ...data,
          },
        });
  }

  async contextForService(
    businessId: string,
    serviceId: string,
  ): Promise<CategoryContext | null> {
    const service = await this.db.service.findFirst({
      where: { id: serviceId, businessId },
      select: {
        platformCategory: {
          select: {
            id: true,
            key: true,
            name: true,
            version: true,
            capabilities: { select: { capability: true } },
          },
        },
        platformSubcategory: { select: { id: true, key: true, name: true } },
        platformServiceType: { select: { id: true, key: true, name: true } },
      },
    });
    if (!service) throw new NotFoundException("Service not found");
    if (!service.platformCategory) return null; // legacy services retain the locked booking behavior
    const definitions =
      await this.categoryDb.categoryAttributeDefinition.findMany({
        where: {
          categoryId: service.platformCategory.id,
          isActive: true,
          OR: [
            { serviceTypeId: null },
            { serviceTypeId: service.platformServiceType?.id },
          ],
        },
        include: {
          options: { select: { value: true }, orderBy: { sortOrder: "asc" } },
        },
      });
    return {
      category: {
        id: service.platformCategory.id,
        key: service.platformCategory.key,
        name: service.platformCategory.name,
        version: service.platformCategory.version,
      },
      subcategory: service.platformSubcategory,
      serviceType: service.platformServiceType,
      capabilities: service.platformCategory.capabilities
        .map(
          (entry: { capability: string }) =>
            entry.capability as CategoryCapability,
        )
        .sort(),
      requiredAttributes: definitions
        .filter((d: any) => d.required)
        .map((d: any) => ({
          key: d.key,
          type: d.type,
          allowedValues: d.options.map((o: { value: string }) => o.value),
        })),
    };
  }

  async validateBooking(
    businessId: string,
    serviceId: string,
    staffId: string,
    attributes: Record<string, CategoryAttributeValue> = {},
  ) {
    const context = await this.contextForService(businessId, serviceId);
    if (!context) return { legacy: true, attributes: {} };
    this.assertCapability(context, "BOOKING", businessId);
    const enabled = await this.categoryDb.tenantCategoryConfiguration.findFirst(
      {
        where: {
          businessId,
          categoryId: context.category.id,
          enabled: true,
          OR: [
            { serviceTypeId: context.serviceType?.id },
            { serviceTypeId: null },
          ],
        },
        select: { id: true },
      },
    );
    if (!enabled)
      throw new ForbiddenException("Category is not enabled for this business");
    const definitions =
      await this.categoryDb.categoryAttributeDefinition.findMany({
        where: {
          categoryId: context.category.id,
          isActive: true,
          OR: [
            { serviceTypeId: null },
            { serviceTypeId: context.serviceType?.id },
          ],
        },
        include: { options: true },
      });
    const known = new Set(definitions.map((d: any) => d.key));
    for (const key of Object.keys(attributes))
      if (!known.has(key))
        throw new BadRequestException(`Unknown category attribute: ${key}`);
    for (const definition of definitions as any[])
      this.validateAttribute(definition, attributes[definition.key]);
    if (context.capabilities.includes("PROFESSIONAL_MATCHING")) {
      const eligible =
        await this.categoryDb.professionalServiceTypeAssignment.findFirst({
          where: {
            businessId,
            staffId,
            serviceTypeId: context.serviceType?.id,
            isActive: true,
          },
          select: { staffId: true },
        });
      if (!eligible)
        throw new ConflictException(
          "Professional is not eligible for this service type",
        );
    }
    if (context.capabilities.includes("RESOURCE_REQUIRED"))
      await this.assertResources(businessId, serviceId);
    return { legacy: false, attributes };
  }

  assertCapability(
    context: CategoryContext,
    capability: CategoryCapability,
    tenantId?: string,
  ) {
    if (!context.capabilities.includes(capability)) {
      this.logger.warn({
        event: "category_capability_violation",
        tenantId,
        categoryId: context.category.id,
        capability,
      });
      throw new ConflictException(
        `Category capability ${capability} is not supported`,
      );
    }
  }

  private validateAttribute(
    definition: {
      key: string;
      type: string;
      required: boolean;
      minValue: unknown;
      maxValue: unknown;
      options: Array<{ value: string }>;
    },
    value: CategoryAttributeValue | undefined,
  ) {
    if (value === undefined) {
      if (definition.required)
        throw new BadRequestException(
          `Missing category attribute: ${definition.key}`,
        );
      return;
    }
    const allowed = new Set(definition.options.map((o) => o.value));
    const fail = () => {
      throw new BadRequestException(
        `Invalid category attribute: ${definition.key}`,
      );
    };
    if (definition.type === "STRING" && typeof value !== "string") fail();
    if (definition.type === "BOOLEAN" && typeof value !== "boolean") fail();
    if (["NUMBER", "DURATION"].includes(definition.type)) {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        (definition.type === "DURATION" &&
          (!Number.isInteger(value) || value <= 0))
      )
        fail();
      const min =
        definition.minValue == null ? null : Number(definition.minValue);
      const max =
        definition.maxValue == null ? null : Number(definition.maxValue);
      const numeric = value as number;
      if ((min !== null && numeric < min) || (max !== null && numeric > max))
        fail();
    }
    if (
      definition.type === "DATE" &&
      (typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        Number.isNaN(Date.parse(`${value}T00:00:00Z`)))
    )
      fail();
    if (
      definition.type === "ENUM" &&
      (typeof value !== "string" || !allowed.has(value))
    )
      fail();
    if (
      definition.type === "MULTI_ENUM" &&
      (!Array.isArray(value) ||
        value.length === 0 ||
        value.some((entry) => typeof entry !== "string" || !allowed.has(entry)))
    )
      fail();
  }

  private async assertResources(businessId: string, serviceId: string) {
    const requirements =
      await this.categoryDb.serviceResourceRequirement.findMany({
        where: { businessId, serviceId },
      });
    if (!requirements.length)
      throw new ConflictException(
        "Resource-required service has no configured requirement",
      );
    for (const requirement of requirements) {
      const available = await this.categoryDb.platformResource.aggregate({
        where: {
          businessId,
          resourceTypeId: requirement.resourceTypeId,
          isActive: true,
        },
        _sum: { capacity: true },
      });
      if ((available._sum.capacity ?? 0) < requirement.quantity)
        throw new ConflictException(
          "Required resource capacity is unavailable",
        );
    }
  }
}
