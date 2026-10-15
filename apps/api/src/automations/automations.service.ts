/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-imports */
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionsService } from "../auth/permissions.service.js";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { CustomerMetricsService } from "../customers/segments/customer-metrics.service.js";
import {
  ACTIONS,
  CONDITION_FIELDS,
  CONDITION_OPERATORS,
  TIME_TRIGGERS,
  TRIGGERS,
  type AutomationActionDto,
  type AutomationConditionDto,
  type AutomationListQueryDto,
  type CreateAutomationDto,
  type ProcessEventDto,
  type UpdateAutomationDto,
} from "./automation.dto.js";
export const MAX_AUTOMATION_DEPTH = 5;
const PROVIDER_ACTIONS = new Set([
  "SEND_SMS",
  "SEND_EMAIL",
  "SEND_PUSH_NOTIFICATION",
]);
@Injectable()
export class AutomationsService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly metrics: CustomerMetricsService,
    private readonly notifications: NotificationsService,
  ) {}
  async list(u: AuthenticatedUser, b: string, q: AutomationListQueryDto) {
    await this.read(u, b);
    const where: any = {
      businessId: b,
      archivedAt: null,
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? { name: { contains: q.search, mode: "insensitive" } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.automation.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.db.automation.count({ where }),
    ]);
    return { items, total, page: q.page, limit: q.limit };
  }
  async create(u: AuthenticatedUser, b: string, d: CreateAutomationDto) {
    await this.manage(u, b);
    await this.validate(b, d);
    try {
      return await this.db.automation.create({
        data: {
          businessId: b,
          createdById: u.id,
          name: d.name.trim(),
          description: d.description?.trim(),
          status: "DRAFT",
          triggerType: d.triggerType,
          triggerConfig: d.triggerConfig,
          conditions: d.conditions,
          actions: d.actions,
        },
      });
    } catch (e) {
      this.unique(e);
    }
  }
  async get(u: AuthenticatedUser, b: string, id: string) {
    await this.read(u, b);
    return this.scoped(b, id);
  }
  async update(
    u: AuthenticatedUser,
    b: string,
    id: string,
    d: UpdateAutomationDto,
  ) {
    await this.manage(u, b);
    const old = await this.scoped(b, id);
    if (old.status === "ARCHIVED")
      throw new ConflictException("Archived automation cannot be updated");
    const merged = {
      name: d.name ?? old.name,
      triggerType: d.triggerType ?? old.triggerType,
      triggerConfig: d.triggerConfig ?? old.triggerConfig,
      conditions: d.conditions ?? old.conditions,
      actions: d.actions ?? old.actions,
    };
    await this.validate(b, merged);
    try {
      return await this.db.automation.update({
        where: { id },
        data: { ...d, name: d.name?.trim() },
      });
    } catch (e) {
      this.unique(e);
    }
  }
  async archive(u: AuthenticatedUser, b: string, id: string) {
    await this.manage(u, b);
    await this.scoped(b, id);
    return this.db.automation.update({
      where: { id },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
  }
  async activate(u: AuthenticatedUser, b: string, id: string) {
    await this.manage(u, b);
    const a = await this.scoped(b, id);
    await this.validate(b, a);
    return this.db.automation.update({
      where: { id },
      data: { status: "ACTIVE", archivedAt: null },
    });
  }
  async pause(u: AuthenticatedUser, b: string, id: string) {
    await this.manage(u, b);
    const a = await this.scoped(b, id);
    if (a.status === "ARCHIVED")
      throw new ConflictException("Archived automation cannot be paused");
    return this.db.automation.update({
      where: { id },
      data: { status: "PAUSED" },
    });
  }
  async executions(
    u: AuthenticatedUser,
    b: string,
    id: string,
    q: AutomationListQueryDto,
  ) {
    await this.read(u, b);
    await this.scoped(b, id);
    return this.db.automationExecution.findMany({
      where: { businessId: b, automationId: id },
      orderBy: [{ startedAt: "desc" }, { id: "asc" }],
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    });
  }
  async process(u: AuthenticatedUser, b: string, event: ProcessEventDto) {
    await this.manage(u, b);
    return this.processTrusted(b, event);
  }
  async processTrusted(b: string, event: ProcessEventDto) {
    if (event.depth > MAX_AUTOMATION_DEPTH)
      throw new BadRequestException(
        "Maximum automation execution depth exceeded",
      );
    const customer = event.customerId
      ? await this.db.businessCustomer.findFirst({
          where: { id: event.customerId, businessId: b, archivedAt: null },
          include: {
            tags: { select: { tagId: true } },
            segmentMemberships: { select: { segmentId: true } },
          },
        })
      : null;
    if (event.customerId && !customer)
      throw new NotFoundException("Customer not found");
    const appointment = event.appointmentId
      ? await this.db.appointment.findFirst({
          where: { id: event.appointmentId, businessId: b },
        })
      : null;
    if (event.appointmentId && !appointment)
      throw new NotFoundException("Appointment not found");
    if (
      appointment &&
      event.customerId &&
      appointment.businessCustomerId !== event.customerId
    )
      throw new BadRequestException("Event entities do not belong together");
    await this.db.automationEvent.upsert({
      where: { id: event.eventId },
      create: {
        id: event.eventId,
        businessId: b,
        eventType: event.eventType,
        occurredAt: new Date(),
        customerId: event.customerId,
        appointmentId: event.appointmentId,
        metadata: event.metadata ?? {},
        correlationId: event.correlationId ?? event.eventId,
        causationId: event.causationId,
        depth: event.depth,
      },
      update: {},
    });
    const autos = await this.db.automation.findMany({
      where: {
        businessId: b,
        status: "ACTIVE",
        archivedAt: null,
        triggerType: event.eventType,
      },
    });
    const out = [];
    for (const a of autos)
      out.push(await this.run(b, a, event, customer, appointment));
    return out;
  }
  async evaluateTimeBased(
    b: string,
    trigger: string,
    customerId: string,
    eventId: string,
  ) {
    if (!TIME_TRIGGERS.includes(trigger as any))
      throw new BadRequestException("Not a time-based trigger");
    const autos = await this.db.automation.findMany({
      where: {
        businessId: b,
        status: "ACTIVE",
        archivedAt: null,
        triggerType: trigger,
      },
    });
    return {
      eventId,
      eligibleAutomationIds: autos.map((a: any) => a.id),
      customerId,
    };
  }
  private async run(
    b: string,
    a: any,
    e: ProcessEventDto,
    c: any,
    appointment: any,
  ) {
    const key = `${a.id}:${e.eventId}`;
    const prior = await this.db.automationExecution.findFirst({
      where: { businessId: b, executionKey: key },
    });
    if (prior) return prior;
    let ex;
    try {
      ex = await this.db.automationExecution.create({
        data: {
          businessId: b,
          automationId: a.id,
          eventId: e.eventId,
          customerId: e.customerId,
          appointmentId: e.appointmentId,
          status: "RUNNING",
          executionKey: key,
        },
      });
    } catch (err) {
      if ((err as any)?.code === "P2002")
        return this.db.automationExecution.findFirst({
          where: { businessId: b, executionKey: key },
        });
      throw err;
    }
    try {
      const values: Record<string, any> = await this.values(b, c, appointment);
      if (
        !(a.conditions as AutomationConditionDto[]).every((x) =>
          this.compare(values[x.field], x.operator, x.value),
        )
      )
        return this.finish(ex.id, "SKIPPED", { reason: "conditions_not_met" });
      const results = [];
      for (const action of a.actions as AutomationActionDto[])
        results.push(
          await this.action(b, c?.id, action, a.createdById, ex.id, e),
        );
      return this.finish(ex.id, "SUCCEEDED", { actions: results });
    } catch (err) {
      return this.finish(
        ex.id,
        "FAILED",
        undefined,
        err instanceof Error ? err.message : "Action failed",
      );
    }
  }
  private finish(
    id: string,
    status: string,
    result?: unknown,
    failureReason?: string,
  ) {
    return this.db.automationExecution.update({
      where: { id },
      data: { status, completedAt: new Date(), result, failureReason },
    });
  }
  private async action(
    b: string,
    c: string | undefined,
    a: AutomationActionDto,
    automationActorId: string,
    executionId: string,
    event: ProcessEventDto,
  ) {
    if (a.type === "SEND_NOTIFICATION") {
      const cfg = a.config as Record<string, any>;
      const created = await this.notifications.createTrusted(b, {
        templateId: String(cfg.templateId ?? ""),
        channel: String(cfg.channel ?? ""),
        recipient: String(cfg.recipient ?? ""),
        customerId: c,
        automationExecutionId: executionId,
        variables: (cfg.variables ?? {}) as Record<string, unknown>,
        kind: cfg.kind === "MARKETING" ? "MARKETING" : "TRANSACTIONAL",
        scheduledAt: cfg.scheduledAt as string | undefined,
        idempotencyKey: `automation:${executionId}:${String(cfg.templateId)}`,
        correlationId: event.correlationId ?? event.eventId,
        causationId: event.eventId,
        metadata: { automationExecutionId: executionId },
      } as any);
      return { type: a.type, status: "created", notificationId: created.id };
    }
    if (PROVIDER_ACTIONS.has(a.type))
      throw new Error(`${a.type} provider is not configured`);
    if (!c) throw new Error("Action requires a customer");
    const id = String(a.config.id ?? "");
    if (["ADD_CUSTOMER_TAG", "REMOVE_CUSTOMER_TAG"].includes(a.type)) {
      await this.ref(this.db.customerTag, b, id, "Tag");
      if (a.type === "ADD_CUSTOMER_TAG")
        await this.db.customerTagAssignment.upsert({
          where: { customerId_tagId: { customerId: c, tagId: id } },
          create: { businessId: b, customerId: c, tagId: id },
          update: {},
        });
      else
        await this.db.customerTagAssignment.deleteMany({
          where: { businessId: b, customerId: c, tagId: id },
        });
    } else if (["ADD_TO_SEGMENT", "REMOVE_FROM_SEGMENT"].includes(a.type)) {
      const s = await this.ref(this.db.customerSegment, b, id, "Segment");
      if (s.type !== "MANUAL")
        throw new Error("Only manual segments can be mutated");
      if (a.type === "ADD_TO_SEGMENT")
        await this.db.customerSegmentMembership.upsert({
          where: { segmentId_customerId: { segmentId: id, customerId: c } },
          create: { businessId: b, segmentId: id, customerId: c },
          update: {},
        });
      else
        await this.db.customerSegmentMembership.deleteMany({
          where: { businessId: b, segmentId: id, customerId: c },
        });
    } else if (a.type === "CREATE_INTERNAL_NOTE") {
      const content = String(a.config.content ?? "").trim();
      if (!content) throw new Error("Note content is required");
      const authorUserId = automationActorId;
      await this.db.customerNote.create({
        data: { businessId: b, customerId: c, authorUserId, content },
      });
    }
    return { type: a.type, status: "applied" };
  }
  private async values(b: string, c: any, a: any) {
    const m = c
      ? (await this.metrics.calculateMany(b, [c.id])).get(c.id)
      : undefined;
    return {
      totalVisits: m?.totalAppointments ?? 0,
      completedVisits: m?.completedAppointments ?? 0,
      cancelledVisits: m?.cancelledAppointments ?? 0,
      noShowCount: m?.noShowAppointments ?? 0,
      totalSpend: m?.totalSpend ?? 0,
      averageSpend: m?.averageSpend ?? 0,
      lastVisitAt: m?.lastVisitAt,
      nextAppointmentAt: m?.nextAppointmentAt,
      createdAt: c?.createdAt,
      tags: c?.tags?.map((x: any) => x.tagId) ?? [],
      preferredStaffId: c?.preferredStaffId,
      segmentIds: c?.segmentMemberships?.map((x: any) => x.segmentId) ?? [],
      "appointment.status": a?.status,
      "appointment.staffId": a?.staffId ?? a?.staffMemberId,
      "appointment.serviceId": a?.serviceId,
      "appointment.startAt": a?.startsAt,
    };
  }
  private compare(actual: any, op: string, expected: any) {
    const av = actual instanceof Date ? actual.getTime() : actual,
      ev =
        actual instanceof Date && typeof expected === "string"
          ? Date.parse(expected)
          : expected;
    if (op === "eq") return av === ev;
    if (op === "neq") return av !== ev;
    if (op === "gt" || op === "after") return Number(av) > Number(ev);
    if (op === "gte") return Number(av) >= Number(ev);
    if (op === "lt" || op === "before") return Number(av) < Number(ev);
    if (op === "lte") return Number(av) <= Number(ev);
    if (op === "in") return expected.includes(av);
    if (op === "notIn") return !expected.includes(av);
    if (op === "contains") return Array.isArray(av) && av.includes(ev);
    return false;
  }
  private async validate(b: string, d: any) {
    if (!TRIGGERS.includes(d.triggerType))
      throw new BadRequestException("Invalid trigger");
    if (!Array.isArray(d.actions) || !d.actions.length)
      throw new BadRequestException("At least one action is required");
    for (const x of d.conditions ?? []) {
      if (
        !CONDITION_FIELDS.includes(x.field) ||
        !CONDITION_OPERATORS.includes(x.operator)
      )
        throw new BadRequestException("Invalid automation condition");
      if (x.value === undefined)
        throw new BadRequestException("Condition value is required");
      await this.conditionRef(b, x);
    }
    for (const a of d.actions) {
      if (
        !ACTIONS.includes(a.type) ||
        !a.config ||
        typeof a.config !== "object"
      )
        throw new BadRequestException("Invalid automation action");
      if (a.type.includes("TAG"))
        await this.ref(
          this.db.customerTag,
          b,
          String(a.config.id ?? ""),
          "Tag",
        );
      if (a.type.includes("SEGMENT"))
        await this.ref(
          this.db.customerSegment,
          b,
          String(a.config.id ?? ""),
          "Segment",
        );
    }
  }
  private async conditionRef(b: string, x: any) {
    const vals = Array.isArray(x.value) ? x.value : [x.value];
    if (
      x.field === "preferredStaffId" &&
      (await this.db.staff.count({
        where: { businessId: b, id: { in: vals } },
      })) !== vals.length
    )
      throw new BadRequestException(
        "Condition references staff outside this business",
      );
    if (
      x.field === "appointment.serviceId" &&
      (await this.db.service.count({
        where: { businessId: b, id: { in: vals } },
      })) !== vals.length
    )
      throw new BadRequestException(
        "Condition references services outside this business",
      );
    if (
      x.field === "segmentIds" &&
      (await this.db.customerSegment.count({
        where: { businessId: b, id: { in: vals } },
      })) !== vals.length
    )
      throw new BadRequestException(
        "Condition references segments outside this business",
      );
  }
  private async ref(repo: any, b: string, id: string, label: string) {
    const v = await repo.findFirst({ where: { businessId: b, id } });
    if (!v)
      throw new BadRequestException(
        `${label} does not belong to this business`,
      );
    return v;
  }
  private async scoped(b: string, id: string) {
    const x = await this.db.automation.findFirst({
      where: { businessId: b, id },
    });
    if (!x) throw new NotFoundException("Automation not found");
    return x;
  }
  private read(u: AuthenticatedUser, b: string) {
    return this.permissions.assertBusinessAccess(u, b, "automation:read");
  }
  private manage(u: AuthenticatedUser, b: string) {
    return this.permissions.assertBusinessAccess(u, b, "automation:manage");
  }
  private unique(e: unknown): never {
    if ((e as any)?.code === "P2002")
      throw new ConflictException("Automation name already exists");
    throw e;
  }
}
