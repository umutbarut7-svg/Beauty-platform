/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/consistent-type-imports */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionsService } from "../auth/permissions.service.js";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import { MetricsService } from "../infrastructure/metrics.service.js";
import type {
  CreateNotificationDto,
  CreateTemplateDto,
  NotificationListQueryDto,
  PreferenceDto,
  ProviderConfigDto,
  TemplateListQueryDto,
  UpdateTemplateDto,
} from "./notification.dto.js";
import {
  InAppNotificationProvider,
  type NotificationProvider,
} from "./provider.js";
import { TemplateRendererService } from "./template-renderer.service.js";
export const MAX_DELIVERY_ATTEMPTS = 3;
export const retryDelayMs = (attempt: number) =>
  Math.min(60_000, 1000 * 2 ** Math.max(0, attempt - 1));
@Injectable()
export class NotificationsService {
  private readonly providers: NotificationProvider[] = [
    new InAppNotificationProvider(),
  ];
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly renderer: TemplateRendererService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}
  async createTemplate(u: AuthenticatedUser, b: string, d: CreateTemplateDto) {
    await this.allow(u, b, "notification:template:manage");
    try {
      return await this.db.notificationTemplate.create({
        data: {
          businessId: b,
          createdById: u.id,
          name: d.name.trim(),
          channel: d.channel,
          subject: d.subject,
          body: d.body,
          variables: d.variables,
          locale: d.locale,
          status: "DRAFT",
        },
      });
    } catch (e) {
      this.unique(e, "Template already exists");
    }
  }
  async listTemplates(
    u: AuthenticatedUser,
    b: string,
    q: TemplateListQueryDto,
  ) {
    await this.allow(u, b, "notification:read");
    const where: any = {
      businessId: b,
      ...(q.status ? { status: q.status } : { archivedAt: null }),
      ...(q.channel ? { channel: q.channel } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.notificationTemplate.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.db.notificationTemplate.count({ where }),
    ]);
    return { items, total, page: q.page, limit: q.limit };
  }
  async template(u: AuthenticatedUser, b: string, id: string) {
    await this.allow(u, b, "notification:read");
    return this.scopedTemplate(b, id);
  }
  async updateTemplate(
    u: AuthenticatedUser,
    b: string,
    id: string,
    d: UpdateTemplateDto,
  ) {
    await this.allow(u, b, "notification:template:manage");
    const t = await this.scopedTemplate(b, id);
    if (t.status === "ARCHIVED")
      throw new ConflictException("Archived template cannot be updated");
    return this.db.notificationTemplate.update({
      where: { id },
      data: { ...d, name: d.name?.trim() },
    });
  }
  async archiveTemplate(u: AuthenticatedUser, b: string, id: string) {
    await this.allow(u, b, "notification:template:manage");
    await this.scopedTemplate(b, id);
    return this.db.notificationTemplate.update({
      where: { id },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
  }
  async create(u: AuthenticatedUser, b: string, d: CreateNotificationDto) {
    await this.allow(u, b, "notification:manage");
    return this.createTrusted(b, d);
  }
  async createTrusted(b: string, d: CreateNotificationDto) {
    if (
      d.channel === "EMAIL" &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.recipient)
    )
      throw new BadRequestException("Invalid email recipient");
    if (JSON.stringify(d.metadata ?? {}).length > 16_384)
      throw new BadRequestException("Notification metadata is too large");
    await this.validateRelations(b, d);
    let subject = d.subject,
      body = d.body;
    if (d.templateId) {
      const t = await this.scopedTemplate(b, d.templateId);
      if (t.status !== "ACTIVE")
        throw new ConflictException("Template is not active");
      if (t.channel !== d.channel)
        throw new BadRequestException("Template channel mismatch");
      ({ subject, body } = this.renderer.render(t, d.variables ?? {}));
    }
    if (!body) throw new BadRequestException("Body or template is required");
    const scheduled = d.scheduledAt ? new Date(d.scheduledAt) : null;
    if (scheduled && scheduled.getTime() <= Date.now())
      throw new BadRequestException("scheduledAt must be in the future");
    try {
      const n = await this.db.notification.create({
        data: {
          businessId: b,
          customerId: d.customerId,
          userId: d.userId,
          appointmentId: d.appointmentId,
          automationExecutionId: d.automationExecutionId,
          templateId: d.templateId,
          channel: d.channel,
          kind: d.kind,
          category: d.category,
          recipient: d.recipient,
          subject,
          body,
          status: scheduled ? "SCHEDULED" : "PENDING",
          scheduledAt: scheduled,
          correlationId: d.correlationId,
          causationId: d.causationId,
          idempotencyKey: d.idempotencyKey,
          metadata: d.metadata ?? {},
        },
      });
      await this.audit(
        b,
        n,
        d.scheduledAt ? "NOTIFICATION_SCHEDULED" : "NOTIFICATION_CREATED",
      );
      return n;
    } catch (e) {
      this.unique(e, "Notification idempotency key already exists");
    }
  }
  async list(u: AuthenticatedUser, b: string, q: NotificationListQueryDto) {
    await this.allow(u, b, "notification:read");
    const manages = await this.canManage(u, b);
    const where: any = {
      businessId: b,
      ...(manages ? {} : { userId: u.id }),
      archivedAt: null,
      ...(q.status ? { status: q.status } : {}),
      ...(q.channel ? { channel: q.channel } : {}),
      ...(q.customerId ? { customerId: q.customerId } : {}),
      ...(q.appointmentId ? { appointmentId: q.appointmentId } : {}),
      ...(q.from || q.to
        ? {
            createdAt: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lte: new Date(q.to) } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.notification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.db.notification.count({ where }),
    ]);
    return { items, total, page: q.page, limit: q.limit };
  }
  async get(u: AuthenticatedUser, b: string, id: string) {
    await this.allow(u, b, "notification:read");
    const notification = await this.scoped(b, id);
    if (notification.userId !== u.id && !(await this.canManage(u, b)))
      throw new ForbiddenException("Notification access denied");
    return notification;
  }
  async unreadCount(u: AuthenticatedUser, b: string) {
    await this.allow(u, b, "notification:read");
    return {
      count: await this.db.notification.count({
        where: {
          businessId: b,
          userId: u.id,
          channel: "IN_APP",
          readAt: null,
          archivedAt: null,
        },
      }),
    };
  }
  async markRead(u: AuthenticatedUser, b: string, id: string) {
    await this.allow(u, b, "notification:read");
    const n = await this.scoped(b, id);
    if (n.userId !== u.id) await this.allow(u, b, "notification:manage");
    if (n.channel !== "IN_APP")
      throw new BadRequestException(
        "Only in-app notifications have read state",
      );
    return this.db.notification.update({
      where: { id },
      data: { readAt: n.readAt ?? new Date() },
    });
  }
  async markAllRead(u: AuthenticatedUser, b: string) {
    await this.allow(u, b, "notification:read");
    return this.db.notification.updateMany({
      where: { businessId: b, userId: u.id, channel: "IN_APP", readAt: null },
      data: { readAt: new Date() },
    });
  }
  async send(u: AuthenticatedUser, b: string, id: string) {
    await this.allow(u, b, "notification:send");
    return this.sendTrusted(b, id);
  }
  async sendTrusted(b: string, id: string) {
    const n = await this.scoped(b, id);
    if (n.status === "SCHEDULED" && n.scheduledAt && n.scheduledAt > new Date())
      throw new ConflictException("Notification is not due");
    if (["SENT", "DELIVERED", "CANCELLED", "SKIPPED"].includes(n.status))
      return n;
    if (await this.optedOut(b, n)) {
      const skipped = await this.db.notification.update({
        where: { id },
        data: { status: "SKIPPED" },
      });
      await this.audit(b, skipped, "NOTIFICATION_SKIPPED");
      return skipped;
    }
    const claimed = await this.db.notification.updateMany({
      where: {
        id,
        businessId: b,
        status: { in: ["PENDING", "SCHEDULED", "FAILED"] },
      },
      data: { status: "PROCESSING" },
    });
    if (claimed.count !== 1)
      throw new ConflictException("Notification is already processing");
    const attempts = await this.db.notificationDelivery.count({
      where: { businessId: b, notificationId: id },
    });
    if (attempts >= MAX_DELIVERY_ATTEMPTS) {
      await this.db.notification.update({
        where: { id },
        data: { status: "FAILED" },
      });
      throw new ConflictException("Delivery retry limit reached");
    }
    const provider = this.providers.find((p) => p.supports(n.channel));
    const attempt = attempts + 1;
    const delivery = await this.db.notificationDelivery.create({
      data: {
        businessId: b,
        notificationId: id,
        provider: provider?.name ?? "unconfigured",
        attempt,
        status: "PENDING",
        metadata: {},
      },
    });
    try {
      if (!provider)
        throw Object.assign(
          new Error(`No provider configured for ${n.channel}`),
          { retryable: false },
        );
      const result = await provider.send({
        notificationId: id,
        channel: n.channel,
        recipient: n.recipient,
        subject: n.subject ?? undefined,
        body: n.body,
      });
      await this.db.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: result.delivered ? "DELIVERED" : "SENT",
          providerMessageId: result.providerMessageId,
          deliveredAt: result.delivered ? new Date() : undefined,
        },
      });
      const sent = await this.db.notification.update({
        where: { id },
        data: {
          status: result.delivered ? "DELIVERED" : "SENT",
          sentAt: new Date(),
        },
      });
      await this.audit(
        b,
        sent,
        result.delivered ? "NOTIFICATION_DELIVERED" : "NOTIFICATION_SENT",
      );
      this.metrics?.notification(true);
      return sent;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Provider failed";
      await this.db.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "FAILED",
          errorCode:
            (e as any)?.retryable === false
              ? "NOT_CONFIGURED"
              : "PROVIDER_ERROR",
          errorMessage: msg,
          failedAt: new Date(),
          metadata: { retryAfterMs: retryDelayMs(attempt) },
        },
      });
      const failed = await this.db.notification.update({
        where: { id },
        data: { status: "FAILED" },
      });
      await this.audit(b, failed, "NOTIFICATION_FAILED");
      this.metrics?.notification(false);
      return failed;
    }
  }
  async cancel(u: AuthenticatedUser, b: string, id: string) {
    await this.allow(u, b, "notification:manage");
    const n = await this.scoped(b, id);
    if (["SENT", "DELIVERED", "CANCELLED"].includes(n.status))
      throw new ConflictException("Notification cannot be cancelled");
    const v = await this.db.notification.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    await this.audit(b, v, "NOTIFICATION_CANCELLED");
    return v;
  }
  async retry(u: AuthenticatedUser, b: string, id: string) {
    await this.allow(u, b, "notification:send");
    const n = await this.scoped(b, id);
    if (n.status !== "FAILED")
      throw new ConflictException("Only failed notifications can be retried");
    return this.sendTrusted(b, id);
  }
  async preferences(
    u: AuthenticatedUser,
    b: string,
    customerId?: string,
    userId?: string,
  ) {
    await this.allow(u, b, "notification:read");
    if (
      (customerId || (userId && userId !== u.id)) &&
      !(await this.canManage(u, b))
    )
      throw new ForbiddenException("Notification preference access denied");
    return this.db.notificationPreference.findMany({
      where: {
        businessId: b,
        ...(customerId ? { customerId } : {}),
        ...(userId ? { userId } : {}),
      },
      orderBy: { channel: "asc" },
    });
  }
  async setPreference(u: AuthenticatedUser, b: string, d: PreferenceDto) {
    await this.allow(u, b, "notification:manage");
    if ((d.customerId ? 1 : 0) + (d.userId ? 1 : 0) !== 1)
      throw new BadRequestException(
        "Exactly one preference subject is required",
      );
    if ((d.customerId || d.userId !== u.id) && !(await this.canManage(u, b)))
      throw new ForbiddenException("Notification preference access denied");
    await this.validateRelations(b, d as any);
    const scopeKey = d.customerId
      ? `customer:${d.customerId}`
      : `user:${d.userId}`;
    return this.db.notificationPreference.upsert({
      where: {
        businessId_scopeKey_channel_category: {
          businessId: b,
          scopeKey,
          channel: d.channel,
          category: d.category,
        },
      },
      create: {
        businessId: b,
        scopeKey,
        customerId: d.customerId,
        userId: d.userId,
        channel: d.channel,
        category: d.category,
        transactionalEnabled: d.transactionalEnabled,
        marketingEnabled: d.marketingEnabled,
      },
      update: {
        transactionalEnabled: d.transactionalEnabled,
        marketingEnabled: d.marketingEnabled,
      },
    });
  }
  async providerConfigs(u: AuthenticatedUser, b: string) {
    await this.allow(u, b, "notification:provider:manage");
    return this.db.notificationProviderConfig.findMany({
      where: { businessId: b },
      select: {
        id: true,
        channel: true,
        provider: true,
        enabled: true,
        config: true,
        secretReference: true,
        updatedAt: true,
      },
      orderBy: [{ channel: "asc" }, { provider: "asc" }],
    });
  }
  async setProviderConfig(
    u: AuthenticatedUser,
    b: string,
    d: ProviderConfigDto,
  ) {
    await this.allow(u, b, "notification:provider:manage");
    const serialized = JSON.stringify(d.config).toLowerCase();
    if (/password|secret|token|api[_-]?key|credential/.test(serialized))
      throw new BadRequestException(
        "Provider secrets must use secretReference",
      );
    return this.db.notificationProviderConfig.upsert({
      where: {
        businessId_channel_provider: {
          businessId: b,
          channel: d.channel,
          provider: d.provider,
        },
      },
      create: { businessId: b, ...d },
      update: {
        enabled: d.enabled,
        config: d.config,
        secretReference: d.secretReference,
      },
      select: {
        id: true,
        channel: true,
        provider: true,
        enabled: true,
        config: true,
        secretReference: true,
        updatedAt: true,
      },
    });
  }
  private async optedOut(b: string, n: any) {
    if (n.category === "SECURITY") return false;
    const scopeKey = n.customerId
      ? `customer:${n.customerId}`
      : n.userId
        ? `user:${n.userId}`
        : null;
    if (!scopeKey) return n.kind === "MARKETING";
    const p = await this.db.notificationPreference.findUnique({
      where: {
        businessId_scopeKey_channel_category: {
          businessId: b,
          scopeKey,
          channel: n.channel,
          category: n.category,
        },
      },
    });
    return n.kind === "MARKETING"
      ? !p?.marketingEnabled
      : p?.transactionalEnabled === false;
  }
  private async validateRelations(b: string, d: any) {
    for (const [key, repo, label] of [
      ["customerId", this.db.businessCustomer, "Customer"],
      ["appointmentId", this.db.appointment, "Appointment"],
      ["templateId", this.db.notificationTemplate, "Template"],
    ] as const)
      if (
        d[key] &&
        !(await repo.findFirst({ where: { id: d[key], businessId: b } }))
      )
        throw new NotFoundException(`${label} not found`);
    if (
      d.automationExecutionId &&
      !(await this.db.automationExecution.findFirst({
        where: { id: d.automationExecutionId, businessId: b },
      }))
    )
      throw new NotFoundException("Automation execution not found");
  }
  private async audit(b: string, n: any, type: string) {
    const id = `notification:${n.id}:${type}`;
    await this.db.automationEvent.upsert({
      where: { id },
      create: {
        id,
        businessId: b,
        eventType: type,
        occurredAt: new Date(),
        customerId: n.customerId,
        appointmentId: n.appointmentId,
        metadata: { notificationId: n.id, status: n.status },
        correlationId: n.correlationId ?? n.id,
        causationId: n.causationId,
        depth: 0,
      },
      update: {},
    });
  }
  private async scoped(b: string, id: string) {
    const n = await this.db.notification.findFirst({
      where: { id, businessId: b, archivedAt: null },
    });
    if (!n) throw new NotFoundException("Notification not found");
    return n;
  }
  private async scopedTemplate(b: string, id: string) {
    const t = await this.db.notificationTemplate.findFirst({
      where: { id, businessId: b },
    });
    if (!t) throw new NotFoundException("Notification template not found");
    return t;
  }
  private allow(u: AuthenticatedUser, b: string, p: any) {
    return this.permissions.assertBusinessAccess(u, b, p);
  }
  private async canManage(u: AuthenticatedUser, b: string) {
    try {
      await this.allow(u, b, "notification:manage");
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) return false;
      throw error;
    }
  }
  private unique(e: unknown, msg: string): never {
    if ((e as any)?.code === "P2002") throw new ConflictException(msg);
    throw e;
  }
}
