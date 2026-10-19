/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { CommunicationOutboxService } from "./communication-outbox.service.js";
describe("CommunicationOutboxService", () => {
  it("deduplicates events and creates one notification", async () => {
    const rows: any[] = [];
    const db: any = {
      appointment: { findFirst: async () => ({ id: "a" }) },
      communicationOutbox: {
        create: async ({ data }: any) => {
          if (rows.length) throw { code: "P2002" };
          const x = {
            id: "o",
            status: "PENDING",
            createdAt: new Date(),
            availableAt: new Date(),
            attempts: 0,
            ...data,
          };
          rows.push(x);
          return x;
        },
        findFirst: async () => rows[0],
        findMany: async () =>
          rows.filter(
            (x) =>
              ["PENDING", "FAILED", "PROCESSING"].includes(x.status) &&
              x.attempts < 3 &&
              x.availableAt <= new Date(),
          ),
        updateMany: async ({ where, data }: any) => {
          const x = rows.find(
            (y) =>
              y.id === where.id &&
              where.status.in.includes(y.status) &&
              y.attempts < 3 &&
              y.availableAt <= new Date(),
          );
          if (!x) return { count: 0 };
          Object.assign(x, data, {
            attempts: x.attempts + (data.attempts?.increment ?? 0),
          });
          return { count: 1 };
        },
        update: async ({ where, data }: any) =>
          Object.assign(
            rows.find((x) => x.id === where.id),
            data,
          ),
      },
    };
    const made: any[] = [];
    const s = new CommunicationOutboxService(db, {
      createTrusted: async (_: string, d: any) => {
        made.push(d);
        return { id: "n" };
      },
    } as any);
    await s.enqueue("b", {
      id: "e",
      type: "APPOINTMENT_CREATED",
      appointmentId: "a",
      payload: { channel: "IN_APP", recipient: "u", body: "booked" },
    });
    await s.enqueue("b", {
      id: "e",
      type: "APPOINTMENT_CREATED",
      appointmentId: "a",
      payload: {},
    });
    await Promise.all([s.processDue(), s.processDue()]);
    expect(made).toHaveLength(1);
    expect(made[0].idempotencyKey).toBe("outbox:event:e");
    expect(rows[0].status).toBe("PROCESSED");
  });
  it("stops retrying a failed event after the bounded attempt limit", async () => {
    const row: any = {
      id: "o",
      businessId: "b",
      eventType: "SECURITY_EVENT",
      idempotencyKey: "event:e",
      payload: {},
      status: "PENDING",
      attempts: 2,
      availableAt: new Date(0),
      createdAt: new Date(0),
    };
    const db: any = {
      communicationOutbox: {
        findMany: async () => [row],
        updateMany: async ({ data }: any) => {
          Object.assign(row, data, { attempts: row.attempts + 1 });
          return { count: 1 };
        },
        update: async ({ data }: any) => Object.assign(row, data),
      },
    };
    const service = new CommunicationOutboxService(db, {
      createTrusted: async () => {
        throw new Error("provider unavailable");
      },
    } as any);
    await service.processDue();
    expect(row).toMatchObject({
      status: "FAILED",
      attempts: 3,
      failureReason: "provider unavailable",
    });
  });
});
