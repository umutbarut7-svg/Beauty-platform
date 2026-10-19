/* eslint-disable @typescript-eslint/consistent-type-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import { NotificationsService } from "./notifications.service.js";
export const NOTIFIABLE_EVENTS = [
  "APPOINTMENT_CREATED",
  "APPOINTMENT_CONFIRMED",
  "APPOINTMENT_CHANGED",
  "APPOINTMENT_CANCELLED",
  "MATCH_GENERATED",
  "BEAUTY_JOB_UPDATED",
  "RESULT_SUBMITTED",
  "PAYMENT_EVENT",
  "SECURITY_EVENT",
] as const;
export const MAX_OUTBOX_ATTEMPTS = 3;
@Injectable()
export class CommunicationOutboxService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}
  async enqueue(
    businessId: string,
    event: {
      id: string;
      type: string;
      appointmentId?: string;
      payload: Record<string, unknown>;
    },
  ) {
    if (
      event.appointmentId &&
      !(await this.db.appointment.findFirst({
        where: { id: event.appointmentId, businessId },
      }))
    )
      throw new NotFoundException("Appointment not found");
    try {
      return await this.db.communicationOutbox.create({
        data: {
          businessId,
          eventType: event.type,
          aggregateId:
            event.appointmentId ?? String(event.payload.customerId ?? event.id),
          idempotencyKey: `event:${event.id}`,
          payload: {
            ...event.payload,
            eventId: event.id,
            appointmentId: event.appointmentId,
          },
        },
      });
    } catch (e) {
      if ((e as any)?.code === "P2002")
        return this.db.communicationOutbox.findFirst({
          where: { businessId, idempotencyKey: `event:${event.id}` },
        });
      throw e;
    }
  }
  async processDue(limit = 50) {
    const rows = await this.db.communicationOutbox.findMany({
      where: {
        status: { in: ["PENDING", "FAILED", "PROCESSING"] },
        attempts: { lt: MAX_OUTBOX_ATTEMPTS },
        availableAt: { lte: new Date() },
      },
      orderBy: { createdAt: "asc" },
      take: Math.min(limit, 100),
    });
    const results = [];
    for (const row of rows) {
      const claimed = await this.db.communicationOutbox.updateMany({
        where: {
          id: row.id,
          status: { in: ["PENDING", "FAILED", "PROCESSING"] },
          availableAt: { lte: new Date() },
          attempts: { lt: MAX_OUTBOX_ATTEMPTS },
        },
        data: {
          status: "PROCESSING",
          attempts: { increment: 1 },
          availableAt: new Date(Date.now() + 5 * 60_000),
        },
      });
      if (!claimed.count) continue;
      try {
        const p = row.payload as any;
        const notification = await this.notifications.createTrusted(
          row.businessId,
          {
            ...p,
            idempotencyKey: `outbox:${row.idempotencyKey}`,
            correlationId: p.correlationId ?? p.eventId,
            causationId: p.eventId,
            metadata: { ...(p.metadata ?? {}), outboxId: row.id },
          },
        );
        results.push(notification);
        await this.db.communicationOutbox.update({
          where: { id: row.id },
          data: {
            status: "PROCESSED",
            processedAt: new Date(),
            failureReason: null,
          },
        });
      } catch (e) {
        await this.db.communicationOutbox.update({
          where: { id: row.id },
          data: {
            status:
              row.attempts + 1 >= MAX_OUTBOX_ATTEMPTS ? "FAILED" : "PENDING",
            failureReason: e instanceof Error ? e.message : "Processing failed",
            availableAt: new Date(Date.now() + 60_000),
          },
        });
      }
    }
    return results;
  }
}
