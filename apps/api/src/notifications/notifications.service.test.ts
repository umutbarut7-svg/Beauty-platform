/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  NotificationsService,
  MAX_DELIVERY_ATTEMPTS,
  retryDelayMs,
} from "./notifications.service.js";
import { TemplateRendererService } from "./template-renderer.service.js";
const user: any = { id: "u", role: "BUSINESS_OWNER" };
function fixture() {
  const ns: any[] = [];
  const ds: any[] = [];
  const prefs: any[] = [];
  const db: any = {
    notificationTemplate: {
      findFirst: async ({ where }: any) =>
        where.businessId === "a"
          ? {
              id: "t",
              businessId: "a",
              channel: "IN_APP",
              status: "ACTIVE",
              body: "Hi {{customer.firstName}}",
              subject: null,
              variables: ["customer.firstName"],
            }
          : null,
      create: async ({ data }: any) => ({ id: "t", ...data }),
      findMany: async () => [],
      count: async () => 0,
      update: async () => ({}),
    },
    notification: {
      create: async ({ data }: any) => {
        if (ns.some((x) => x.idempotencyKey === data.idempotencyKey))
          throw { code: "P2002" };
        const n = { id: `n${ns.length}`, ...data };
        ns.push(n);
        return n;
      },
      findFirst: async ({ where }: any) =>
        ns.find(
          (x) =>
            x.id === where.id &&
            x.businessId === where.businessId &&
            !x.archivedAt,
        ) || null,
      findMany: async () => ns,
      count: async ({ where }: any) =>
        ns.filter((x) =>
          Object.entries(where).every(([key, value]) =>
            value === null
              ? x[key] == null
              : typeof value === "object"
                ? true
                : x[key] === value,
          ),
        ).length,
      update: async ({ where, data }: any) =>
        Object.assign(
          ns.find((x) => x.id === where.id),
          data,
        ),
      updateMany: async ({ where, data }: any) => {
        const matching = ns.filter((x) =>
          Object.entries(where).every(([key, value]: [string, any]) => {
            if (value?.in) return value.in.includes(x[key]);
            return value === null ? x[key] == null : x[key] === value;
          }),
        );
        matching.forEach((x) => Object.assign(x, data));
        return { count: matching.length };
      },
    },
    notificationDelivery: {
      count: async ({ where }: any) =>
        ds.filter((x) => x.notificationId === where.notificationId).length,
      create: async ({ data }: any) => {
        const d = { id: `d${ds.length}`, ...data };
        ds.push(d);
        return d;
      },
      update: async ({ where, data }: any) =>
        Object.assign(
          ds.find((x) => x.id === where.id),
          data,
        ),
    },
    notificationPreference: {
      findUnique: async ({ where }: any) =>
        prefs.find(
          (x) =>
            x.scopeKey === where.businessId_scopeKey_channel_category.scopeKey,
        ) || null,
      findMany: async () => prefs,
      upsert: async ({ create, update }: any) => {
        const p = prefs[0] ?? create;
        Object.assign(p, update);
        if (!prefs.length) prefs.push(p);
        return p;
      },
    },
    businessCustomer: {
      findFirst: async ({ where }: any) =>
        where.businessId === "a" ? { id: where.id } : null,
    },
    appointment: { findFirst: async () => null },
    automationExecution: { findFirst: async () => null },
    automationEvent: { upsert: async () => ({}) },
  };
  const perms: any = {
    assertBusinessAccess: async (_: any, b: string) => {
      if (b !== "a") throw new Error("denied");
    },
  };
  return {
    s: new NotificationsService(db, perms, new TemplateRendererService()),
    ns,
    ds,
    prefs,
  };
}
const dto: any = {
  channel: "IN_APP",
  recipient: "u",
  body: "hello",
  kind: "TRANSACTIONAL",
  idempotencyKey: "k",
  metadata: {},
};
describe("NotificationsService", () => {
  it("creates and delivers once with audit", async () => {
    const f = fixture();
    const n = await f.s.create(user, "a", dto);
    expect((await f.s.send(user, "a", n.id)).status).toBe("DELIVERED");
    expect((await f.s.send(user, "a", n.id)).status).toBe("DELIVERED");
    expect(f.ds).toHaveLength(1);
  });
  it("schedules and rejects early send", async () => {
    const f = fixture();
    const n = await f.s.create(user, "a", {
      ...dto,
      idempotencyKey: "s",
      scheduledAt: new Date(Date.now() + 60000).toISOString(),
    });
    expect(n.status).toBe("SCHEDULED");
    await expect(f.s.send(user, "a", n.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
  it("skips opted-out marketing while transactional remains allowed", async () => {
    const f = fixture();
    f.prefs.push({
      scopeKey: "customer:c",
      marketingEnabled: false,
      transactionalEnabled: true,
    });
    const n = await f.s.create(user, "a", {
      ...dto,
      customerId: "c",
      kind: "MARKETING",
      category: "MARKETING",
    });
    expect((await f.s.send(user, "a", n.id)).status).toBe("SKIPPED");
  });
  it("fails external provider without fake success", async () => {
    const f = fixture();
    const n = await f.s.create(user, "a", { ...dto, channel: "SMS" });
    expect((await f.s.send(user, "a", n.id)).status).toBe("FAILED");
    expect(f.ds[0].errorCode).toBe("NOT_CONFIGURED");
  });
  it("enforces tenant scope and retry policy constants", async () => {
    const f = fixture();
    await expect(f.s.get(user, "b", "n")).rejects.toThrow();
    await expect(f.s.get(user, "a", "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(MAX_DELIVERY_ATTEMPTS).toBe(3);
    expect(retryDelayMs(3)).toBe(4000);
  });
});
it("tracks in-app read state and protects another user's notification", async () => {
  const f = fixture();
  const n = await f.s.create(user, "a", {
    ...dto,
    userId: "u",
    idempotencyKey: "read",
  });
  expect((await f.s.markRead(user, "a", n.id)).readAt).toBeInstanceOf(Date);
});
it("counts unread notifications and marks all of the user's inbox read", async () => {
  const f = fixture();
  await f.s.create(user, "a", {
    ...dto,
    userId: "u",
    idempotencyKey: "unread-1",
  });
  await f.s.create(user, "a", {
    ...dto,
    userId: "u",
    idempotencyKey: "unread-2",
  });
  expect(await f.s.unreadCount(user, "a")).toEqual({ count: 2 });
  expect((await f.s.markAllRead(user, "a")).count).toBe(2);
  expect(await f.s.unreadCount(user, "a")).toEqual({ count: 0 });
});
it("does not suppress security-critical notifications", async () => {
  const f = fixture();
  f.prefs.push({
    scopeKey: "user:u",
    marketingEnabled: false,
    transactionalEnabled: false,
  });
  const n = await f.s.create(user, "a", {
    ...dto,
    userId: "u",
    category: "SECURITY",
    idempotencyKey: "security",
  });
  expect((await f.s.send(user, "a", n.id)).status).toBe("DELIVERED");
});
