/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { expect, it } from "vitest";
import {
  AutomationsService,
  MAX_AUTOMATION_DEPTH,
} from "./automations.service.js";
const user: any = { id: "u", role: "BUSINESS_OWNER", email: "u@x.invalid" };
function fixture() {
  const automations: any[] = [
      {
        id: "a",
        businessId: "b",
        name: "Welcome",
        status: "ACTIVE",
        archivedAt: null,
        triggerType: "CUSTOMER_CREATED",
        triggerConfig: {},
        conditions: [],
        actions: [{ type: "ADD_CUSTOMER_TAG", config: { id: "tag" } }],
        createdAt: new Date(),
      },
    ],
    execs: any[] = [],
    assignments: any[] = [];
  const db: any = {
    automation: {
      findFirst: async ({ where }: any) =>
        automations.find(
          (x) => x.id === where.id && x.businessId === where.businessId,
        ) || null,
      findMany: async ({ where }: any) =>
        automations.filter(
          (x) =>
            x.businessId === where.businessId &&
            (!where.status || x.status === where.status) &&
            (!where.triggerType || x.triggerType === where.triggerType),
        ),
      count: async () => automations.length,
      create: async ({ data }: any) => ({ id: "new", ...data }),
      update: async ({ where, data }: any) =>
        Object.assign(
          automations.find((x) => x.id === where.id),
          data,
        ),
    },
    automationEvent: { upsert: async ({ create }: any) => create },
    automationExecution: {
      findFirst: async ({ where }: any) =>
        execs.find((x) => x.executionKey === where.executionKey) || null,
      create: async ({ data }: any) => {
        const x = { id: `e${execs.length}`, ...data };
        execs.push(x);
        return x;
      },
      update: async ({ where, data }: any) =>
        Object.assign(
          execs.find((x) => x.id === where.id),
          data,
        ),
      findMany: async () => execs,
    },
    businessCustomer: {
      findFirst: async ({ where }: any) =>
        where.businessId === "b"
          ? {
              id: "c",
              businessId: "b",
              createdAt: new Date(),
              tags: [],
              segmentMemberships: [],
            }
          : null,
    },
    appointment: { findFirst: async () => null },
    customerTag: {
      findFirst: async ({ where }: any) =>
        where.businessId === "b" && where.id === "tag" ? { id: "tag" } : null,
    },
    customerTagAssignment: {
      upsert: async ({ create }: any) => {
        if (!assignments.length) assignments.push(create);
      },
      deleteMany: async () => ({ count: 1 }),
    },
    customerSegment: { findFirst: async () => null, count: async () => 0 },
    customerSegmentMembership: {
      upsert: async () => ({}),
      deleteMany: async () => ({ count: 1 }),
    },
    customerNote: { create: async () => ({}) },
    staff: { count: async () => 0 },
    service: { count: async () => 0 },
  };
  const permissions: any = {
    assertBusinessAccess: async (_: any, b: string) => {
      if (b !== "b") throw new Error("denied");
    },
  };
  const metrics: any = {
    calculateMany: async () =>
      new Map([
        [
          "c",
          {
            totalAppointments: 2,
            completedAppointments: 2,
            cancelledAppointments: 0,
            noShowAppointments: 0,
            totalSpend: 100,
            averageSpend: 50,
          },
        ],
      ]),
  };
  return {
    service: new AutomationsService(db, permissions, metrics, {
      createTrusted: async () => ({ id: "n" }),
    } as any),
    db,
    automations,
    execs,
    assignments,
  };
}
it("creates, updates, pauses and archives tenant-scoped automations", async () => {
  const f = fixture();
  expect(
    (
      await f.service.create(user, "b", {
        name: "X",
        triggerType: "CUSTOMER_CREATED",
        triggerConfig: {},
        conditions: [],
        actions: [{ type: "ADD_CUSTOMER_TAG", config: { id: "tag" } }],
      } as any)
    ).status,
  ).toBe("DRAFT");
  expect((await f.service.pause(user, "b", "a")).status).toBe("PAUSED");
  expect((await f.service.archive(user, "b", "a")).status).toBe("ARCHIVED");
});
it("rejects cross tenant and malformed references", async () => {
  const f = fixture();
  await expect(f.service.get(user, "other", "a")).rejects.toThrow();
  await expect(
    f.service.create(user, "b", {
      name: "X",
      triggerType: "NOPE",
      actions: [],
    } as any),
  ).rejects.toBeInstanceOf(BadRequestException);
});
it("executes a matching internal action once per event", async () => {
  const f = fixture();
  const event: any = {
    eventId: "evt",
    eventType: "CUSTOMER_CREATED",
    customerId: "c",
    depth: 0,
  };
  expect((await f.service.processTrusted("b", event))[0].status).toBe(
    "SUCCEEDED",
  );
  await f.service.processTrusted("b", event);
  expect(f.assignments).toHaveLength(1);
  expect(f.execs).toHaveLength(1);
});
it("skips false conditions and fails unsupported providers", async () => {
  const f = fixture();
  f.automations[0].conditions = [
    { field: "completedVisits", operator: "gt", value: 10 },
  ];
  expect(
    (
      await f.service.processTrusted("b", {
        eventId: "x",
        eventType: "CUSTOMER_CREATED",
        customerId: "c",
        depth: 0,
      } as any)
    )[0].status,
  ).toBe("SKIPPED");
  f.automations[0].conditions = [];
  f.automations[0].actions = [{ type: "SEND_SMS", config: {} }];
  expect(
    (
      await f.service.processTrusted("b", {
        eventId: "y",
        eventType: "CUSTOMER_CREATED",
        customerId: "c",
        depth: 0,
      } as any)
    )[0].status,
  ).toBe("FAILED");
});
it("protects tenant entities and recursion depth", async () => {
  const f = fixture();
  await expect(
    f.service.processTrusted("x", {
      eventId: "x",
      eventType: "CUSTOMER_CREATED",
      customerId: "c",
      depth: 0,
    } as any),
  ).rejects.toBeInstanceOf(NotFoundException);
  await expect(
    f.service.processTrusted("b", {
      eventId: "x",
      eventType: "CUSTOMER_CREATED",
      depth: MAX_AUTOMATION_DEPTH + 1,
    } as any),
  ).rejects.toBeInstanceOf(BadRequestException);
});
it("creates a correlated notification from SEND_NOTIFICATION", async () => {
  const f = fixture();
  f.automations[0].actions = [
    {
      type: "SEND_NOTIFICATION",
      config: { channel: "IN_APP", templateId: "t", recipient: "c" },
    },
  ];
  const result = await f.service.processTrusted("b", {
    eventId: "notify-event",
    eventType: "CUSTOMER_CREATED",
    customerId: "c",
    correlationId: "journey",
    depth: 0,
  } as any);
  expect(result[0].status).toBe("SUCCEEDED");
  expect(result[0].result.actions[0]).toMatchObject({
    type: "SEND_NOTIFICATION",
    notificationId: "n",
  });
});
