/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { CustomerMetricsService } from "./customer-metrics.service.js";
import { SegmentsService } from "./segments.service.js";
const user = {
  id: "u",
  email: "u@test.invalid",
  role: "BUSINESS_OWNER" as const,
};
function fixture() {
  const segments: any[] = [
    {
      id: "s",
      businessId: "a",
      name: "VIP",
      type: "MANUAL",
      rules: null,
      isActive: true,
    },
  ];
  const customers = [
    { id: "c", businessId: "a", archivedAt: null },
    { id: "cb", businessId: "b", archivedAt: null },
  ];
  const memberships: any[] = [];
  const db: any = {
    customerSegment: {
      findMany: async ({ where }: any) =>
        segments.filter((x) => x.businessId === where.businessId),
      findFirst: async ({ where }: any) =>
        segments.find(
          (x) => x.id === where.id && x.businessId === where.businessId,
        ) ?? null,
      create: async ({ data }: any) => ({ id: "new", ...data }),
      update: async ({ where, data }: any) => ({
        ...segments.find((x) => x.id === where.id),
        ...data,
      }),
      delete: async () => ({}),
    },
    businessCustomer: {
      findFirst: async ({ where }: any) =>
        customers.find(
          (x) => x.id === where.id && x.businessId === where.businessId,
        ) ?? null,
      findMany: async () => customers.filter((x) => x.businessId === "a"),
      count: async () => 1,
    },
    customerSegmentMembership: {
      create: async ({ data }: any) => {
        if (memberships.length) throw { code: "P2002" };
        memberships.push(data);
        return data;
      },
      findFirst: async ({ where }: any) =>
        memberships.find(
          (x) =>
            x.segmentId === where.segmentId &&
            x.customerId === where.customerId,
        ),
      delete: async () => ({}),
    },
    appointment: { findMany: async () => [] },
    staff: { count: async () => 0 },
    customerTag: { count: async () => 0 },
  };
  const permissions: any = {
    assertBusinessAccess: async (_u: any, b: string) => {
      if (b === "x") throw new Error("denied");
    },
  };
  return new SegmentsService(db, permissions, new CustomerMetricsService(db));
}
describe("SegmentsService", () => {
  it("creates, updates and deletes tenant segments", async () => {
    const s = fixture();
    await expect(
      s.create(user, "a", { name: "New", type: "MANUAL" }),
    ).resolves.toMatchObject({ businessId: "a" });
    await expect(
      s.update(user, "a", "s", { name: "Regular" }),
    ).resolves.toMatchObject({ name: "Regular" });
    await expect(s.delete(user, "a", "s")).resolves.toBeUndefined();
  });
  it("adds/removes manual membership and rejects duplicate", async () => {
    const s = fixture();
    await expect(s.addCustomer(user, "a", "s", "c")).resolves.toMatchObject({
      customerId: "c",
    });
    await expect(s.addCustomer(user, "a", "s", "c")).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(
      s.removeCustomer(user, "a", "s", "c"),
    ).resolves.toBeUndefined();
  });
  it("rejects cross-tenant customer and segment access", async () => {
    const s = fixture();
    await expect(s.addCustomer(user, "a", "s", "cb")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(s.get(user, "b", "s")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
  it("rejects cross-tenant rule references", async () => {
    await expect(
      fixture().create(user, "a", {
        name: "Dynamic",
        type: "DYNAMIC",
        rules: [{ field: "tags", operator: "contains", value: "foreign" }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
