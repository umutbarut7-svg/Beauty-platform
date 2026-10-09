/* eslint-disable @typescript-eslint/consistent-type-imports, @typescript-eslint/no-explicit-any */
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthenticatedUser } from "../../auth/auth.types.js";
import { PermissionsService } from "../../auth/permissions.service.js";
import { PRISMA_SERVICE } from "../../database/database.tokens.js";
import type { PrismaService } from "../../database/prisma.service.js";
import { CustomerMetricsService } from "./customer-metrics.service.js";
import type {
  CreateSegmentDto,
  SegmentCustomersQueryDto,
  SegmentRuleDto,
  UpdateSegmentDto,
} from "./segment.dto.js";
import { matchesRules, validateRules } from "./segment-rules.js";
export const CRM_INSIGHT_THRESHOLDS = {
  newCustomerDays: 30,
  vipCompletedVisits: 5,
  vipSpend: 5000,
  atRiskDays: 60,
  lostDays: 180,
  noShowRiskCount: 2,
} as const;
@Injectable()
export class SegmentsService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly metrics: CustomerMetricsService,
  ) {}
  async list(user: AuthenticatedUser, businessId: string) {
    await this.read(user, businessId);
    return this.prisma.customerSegment.findMany({
      where: { businessId },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    });
  }
  async create(
    user: AuthenticatedUser,
    businessId: string,
    dto: CreateSegmentDto,
  ) {
    await this.manage(user, businessId);
    this.assertShape(dto.type, dto.rules);
    await this.validateReferences(businessId, dto.rules ?? []);
    try {
      return await this.prisma.customerSegment.create({
        data: {
          businessId,
          name: dto.name.trim(),
          description: dto.description?.trim(),
          type: dto.type,
          rules: dto.type === "DYNAMIC" ? dto.rules : undefined,
          isActive: dto.isActive,
        },
      });
    } catch (e) {
      this.unique(e);
    }
  }
  async get(user: AuthenticatedUser, businessId: string, id: string) {
    await this.read(user, businessId);
    return this.scopedSegment(businessId, id);
  }
  async update(
    user: AuthenticatedUser,
    businessId: string,
    id: string,
    dto: UpdateSegmentDto,
  ) {
    await this.manage(user, businessId);
    const segment = await this.scopedSegment(businessId, id);
    if (dto.rules) {
      this.assertShape(segment.type, dto.rules);
      await this.validateReferences(businessId, dto.rules);
    }
    try {
      return await this.prisma.customerSegment.update({
        where: { id },
        data: {
          ...dto,
          name: dto.name?.trim(),
          description: dto.description?.trim(),
        },
      });
    } catch (e) {
      this.unique(e);
    }
  }
  async delete(user: AuthenticatedUser, businessId: string, id: string) {
    await this.manage(user, businessId);
    await this.scopedSegment(businessId, id);
    await this.prisma.customerSegment.delete({ where: { id } });
  }
  async addCustomer(
    user: AuthenticatedUser,
    businessId: string,
    segmentId: string,
    customerId: string,
  ) {
    await this.manage(user, businessId);
    const [segment, customer] = await Promise.all([
      this.scopedSegment(businessId, segmentId),
      this.scopedCustomer(businessId, customerId),
    ]);
    if (segment.type !== "MANUAL")
      throw new BadRequestException(
        "Membership can only be edited for manual segments",
      );
    if (customer.archivedAt)
      throw new ConflictException(
        "Archived customers cannot join active segments",
      );
    try {
      return await this.prisma.customerSegmentMembership.create({
        data: { businessId, segmentId, customerId },
      });
    } catch (e) {
      this.unique(e, "Customer is already in this segment");
    }
  }
  async removeCustomer(
    user: AuthenticatedUser,
    businessId: string,
    segmentId: string,
    customerId: string,
  ) {
    await this.manage(user, businessId);
    const segment = await this.scopedSegment(businessId, segmentId);
    if (segment.type !== "MANUAL")
      throw new BadRequestException(
        "Membership can only be edited for manual segments",
      );
    const row = await this.prisma.customerSegmentMembership.findFirst({
      where: { businessId, segmentId, customerId },
    });
    if (!row) throw new NotFoundException("Segment membership not found");
    await this.prisma.customerSegmentMembership.delete({
      where: { segmentId_customerId: { segmentId, customerId } },
    });
  }
  async customers(
    user: AuthenticatedUser,
    businessId: string,
    segmentId: string,
    q: SegmentCustomersQueryDto,
  ) {
    await this.read(user, businessId);
    const segment = await this.scopedSegment(businessId, segmentId);
    const base = {
      businessId,
      archivedAt: null,
      ...(q.search
        ? {
            OR: [
              { firstName: { startsWith: q.search, mode: "insensitive" } },
              { lastName: { startsWith: q.search, mode: "insensitive" } },
              {
                email: {
                  startsWith: q.search.toLowerCase(),
                  mode: "insensitive",
                },
              },
            ],
          }
        : {}),
      ...(q.tagId ? { tags: { some: { tagId: q.tagId } } } : {}),
      ...(q.preferredStaffId ? { preferredStaffId: q.preferredStaffId } : {}),
    };
    if (segment.type === "MANUAL") {
      const where = { ...base, segmentMemberships: { some: { segmentId } } };
      const [items, total] = await Promise.all([
        this.prisma.businessCustomer.findMany({
          where,
          skip: (q.page - 1) * q.limit,
          take: q.limit,
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          include: { tags: { include: { tag: true } } },
        }),
        this.prisma.businessCustomer.count({ where }),
      ]);
      return { items, total, page: q.page, limit: q.limit };
    }
    return this.dynamicCustomers(
      businessId,
      base,
      segment.rules as SegmentRuleDto[],
      q,
    );
  }
  async customerMetrics(
    user: AuthenticatedUser,
    businessId: string,
    customerId: string,
  ) {
    await this.read(user, businessId);
    await this.scopedCustomer(businessId, customerId);
    return (await this.metrics.calculateMany(businessId, [customerId])).get(
      customerId,
    );
  }
  async insights(user: AuthenticatedUser, businessId: string) {
    await this.read(user, businessId);
    const customers = await this.prisma.businessCustomer.findMany({
      where: { businessId, archivedAt: null },
      select: { id: true, createdAt: true },
      take: 10000,
      orderBy: { id: "asc" },
    });
    const metrics = await this.metrics.calculateMany(
      businessId,
      customers.map((c: { id: string }) => c.id),
    );
    const now = Date.now(),
      t = CRM_INSIGHT_THRESHOLDS;
    const counts = {
      newCustomers: 0,
      returningCustomers: 0,
      vipCustomers: 0,
      atRiskCustomers: 0,
      lostCustomers: 0,
      upcomingCustomers: 0,
      noShowRiskGroup: 0,
    };
    for (const c of customers) {
      const m = metrics.get(c.id)!;
      if (now - c.createdAt.getTime() <= t.newCustomerDays * 86400000)
        counts.newCustomers++;
      if (m.completedAppointments >= 2) counts.returningCustomers++;
      if (
        m.completedAppointments >= t.vipCompletedVisits ||
        m.totalSpend >= t.vipSpend
      )
        counts.vipCustomers++;
      if (
        m.daysSinceLastVisit !== null &&
        m.daysSinceLastVisit >= t.atRiskDays &&
        m.daysSinceLastVisit < t.lostDays
      )
        counts.atRiskCustomers++;
      if (m.daysSinceLastVisit !== null && m.daysSinceLastVisit >= t.lostDays)
        counts.lostCustomers++;
      if (m.upcomingAppointments > 0) counts.upcomingCustomers++;
      if (m.noShowAppointments + m.cancelledAppointments >= t.noShowRiskCount)
        counts.noShowRiskGroup++;
    }
    return { thresholds: t, counts, evaluatedCustomers: customers.length };
  }
  private async dynamicCustomers(
    businessId: string,
    base: object,
    rules: SegmentRuleDto[],
    q: SegmentCustomersQueryDto,
  ) {
    validateRules(rules);
    const wantedEnd = q.page * q.limit,
      matched: any[] = [];
    let cursor: string | undefined;
    do {
      const batch = await this.prisma.businessCustomer.findMany({
        where: base,
        take: 500,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: "asc" },
        include: { tags: { select: { tagId: true } } },
      });
      if (!batch.length) break;
      cursor = batch.at(-1)!.id;
      const mm = await this.metrics.calculateMany(
        businessId,
        batch.map((c: { id: string }) => c.id),
      );
      for (const c of batch) {
        const m = mm.get(c.id)!;
        if (
          matchesRules(
            {
              ...m,
              preferredStaffId: c.preferredStaffId,
              gender: c.gender,
              marketingConsent: c.marketingConsent,
              smsConsent: c.smsConsent,
              emailConsent: c.emailConsent,
              tags: c.tags.map((x: any) => x.tagId),
            },
            rules,
          )
        )
          matched.push(c);
      }
      if (batch.length < 500) break;
    } while (matched.length < wantedEnd);
    return {
      items: matched.slice((q.page - 1) * q.limit, wantedEnd),
      total: matched.length,
      page: q.page,
      limit: q.limit,
      totalIsLowerBound: matched.length >= wantedEnd,
    };
  }
  private assertShape(type: string, rules?: SegmentRuleDto[]) {
    if (type === "DYNAMIC" && !rules?.length)
      throw new BadRequestException("Dynamic segments require rules");
    if (type === "MANUAL" && rules?.length)
      throw new BadRequestException("Manual segments cannot define rules");
    if (rules) validateRules(rules);
  }
  private async validateReferences(
    businessId: string,
    rules: SegmentRuleDto[],
  ) {
    for (const r of rules) {
      const values = Array.isArray(r.value) ? r.value : [r.value];
      if (r.field === "preferredStaffId") {
        const count = await this.prisma.staff.count({
          where: { businessId, id: { in: values } },
        });
        if (count !== values.length)
          throw new NotFoundException(
            "Rule references staff outside this business",
          );
      }
      if (r.field === "tags") {
        const count = await this.prisma.customerTag.count({
          where: { businessId, id: { in: values } },
        });
        if (count !== values.length)
          throw new NotFoundException(
            "Rule references tags outside this business",
          );
      }
    }
  }
  private async scopedSegment(b: string, id: string) {
    const v = await this.prisma.customerSegment.findFirst({
      where: { id, businessId: b },
    });
    if (!v) throw new NotFoundException("Customer segment not found");
    return v;
  }
  private async scopedCustomer(b: string, id: string) {
    const v = await this.prisma.businessCustomer.findFirst({
      where: { id, businessId: b },
    });
    if (!v) throw new NotFoundException("Customer not found");
    return v;
  }
  private read(u: AuthenticatedUser, b: string) {
    return this.permissions.assertBusinessAccess(u, b, "customer:read");
  }
  private manage(u: AuthenticatedUser, b: string) {
    return this.permissions.assertBusinessAccess(u, b, "customer:manage");
  }
  private unique(
    e: unknown,
    message = "A segment with this name already exists",
  ): never {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      e.code === "P2002"
    )
      throw new ConflictException(message);
    throw e;
  }
}
