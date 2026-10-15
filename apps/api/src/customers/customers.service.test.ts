/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { CustomersService } from "./customers.service.js";

const owner = {
  id: "owner",
  email: "owner@test.invalid",
  role: "BUSINESS_OWNER" as const,
};
function fixture() {
  const customers = [
    {
      id: "customer-a",
      businessId: "a",
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "+905551112233",
      email: "ada@example.test",
      createdAt: new Date(),
      archivedAt: null,
    },
    {
      id: "customer-b",
      businessId: "b",
      firstName: "Other",
      lastName: "Tenant",
      phone: "+905559999999",
      email: "other@example.test",
      createdAt: new Date(),
      archivedAt: null,
    },
  ];
  const notes: any[] = [];
  const tags: any[] = [
    { id: "tag-a", businessId: "a", name: "VIP", slug: "vip" },
    { id: "tag-b", businessId: "b", name: "Other", slug: "other" },
  ];
  const assignments: any[] = [];
  let lastList: any;
  const prisma: any = {
    businessCustomer: {
      findFirst: async ({ where }: any) =>
        customers.find(
          (customer) =>
            customer.id === where.id &&
            customer.businessId === where.businessId,
        ) ??
        (where.OR
          ? customers.find(
              (customer) =>
                customer.businessId === where.businessId &&
                where.OR.some(
                  (condition: any) =>
                    condition.phone === customer.phone ||
                    condition.email === customer.email,
                ),
            )
          : null),
      create: async ({ data }: any) => ({ id: "created", ...data }),
      update: async ({ where, data }: any) => ({
        ...customers.find((item) => item.id === where.id),
        ...data,
      }),
      findMany: async (args: any) => {
        lastList = args;
        return customers.filter(
          (item) => item.businessId === args.where.businessId,
        );
      },
      count: async ({ where }: any) =>
        customers.filter((item) => item.businessId === where.businessId).length,
    },
    appointment: {
      findMany: async () => [
        { id: "appointment", businessCustomerId: "customer-a" },
      ],
      count: async ({ where }: any) => (where.status === "COMPLETED" ? 2 : 0),
      findFirst: async () => ({
        completedAt: new Date("2030-01-01T10:00:00Z"),
      }),
      aggregate: async () => ({
        _sum: { price: "250.00" },
        _avg: { price: "125.00" },
      }),
    },
    customerNote: {
      create: async ({ data }: any) => {
        const note = { id: "note", ...data };
        notes.push(note);
        return note;
      },
      findMany: async ({ where }: any) =>
        notes.filter(
          (note) =>
            note.businessId === where.businessId &&
            note.customerId === where.customerId,
        ),
      findFirst: async ({ where }: any) =>
        notes.find(
          (note) =>
            note.id === where.id &&
            note.businessId === where.businessId &&
            note.customerId === where.customerId,
        ),
      update: async ({ where, data }: any) => ({
        ...notes.find((note) => note.id === where.id),
        ...data,
      }),
      delete: async ({ where }: any) =>
        notes.splice(
          notes.findIndex((note) => note.id === where.id),
          1,
        ),
    },
    customerTag: {
      findFirst: async ({ where }: any) =>
        tags.find(
          (tag) => tag.id === where.id && tag.businessId === where.businessId,
        ) ?? null,
      findMany: async ({ where }: any) =>
        tags.filter((tag) => tag.businessId === where.businessId),
      create: async ({ data }: any) => ({ id: "created-tag", ...data }),
      update: async ({ where, data }: any) => ({
        ...tags.find((tag) => tag.id === where.id),
        ...data,
      }),
      delete: async () => ({}),
    },
    customerTagAssignment: {
      create: async ({ data }: any) => {
        const value = { ...data };
        assignments.push(value);
        return value;
      },
      findFirst: async ({ where }: any) =>
        assignments.find(
          (item) =>
            item.businessId === where.businessId &&
            item.customerId === where.customerId &&
            item.tagId === where.tagId,
        ),
      delete: async () => ({}),
    },
    staff: {
      findFirst: async ({ where }: any) =>
        where.id === "staff-a" && where.businessId === "a"
          ? { id: "staff-a" }
          : null,
    },
  };
  const permissions: any = {
    assertBusinessAccess: async (_user: any, businessId: string) => {
      if (businessId === "forbidden") throw new Error("Business access denied");
    },
  };
  return {
    service: new CustomersService(prisma, permissions),
    getLastList: () => lastList,
  };
}

describe("CustomersService", () => {
  it("creates normalized tenant customers and rejects duplicate contacts", async () => {
    const { service } = fixture();
    await expect(
      service.create(owner, "a", {
        firstName: " Grace ",
        lastName: " Hopper ",
        phone: "+90 (555) 222-3344",
        email: "GRACE@EXAMPLE.TEST",
      }),
    ).resolves.toMatchObject({
      businessId: "a",
      firstName: "Grace",
      phone: "+905552223344",
      email: "grace@example.test",
    });
    await expect(
      service.create(owner, "a", {
        firstName: "Ada",
        lastName: "Duplicate",
        email: "ADA@example.test",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it("never resolves a customer through another tenant", async () => {
    const { service } = fixture();
    await expect(
      service.detail(owner, "a", "customer-b"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it("uses bounded pagination and prefix search", async () => {
    const current = fixture();
    const result = await current.service.list(owner, "a", {
      search: "Ad",
      page: 2,
      limit: 10,
      sort: "name",
      direction: "asc",
      archived: false,
    });
    expect(result).toMatchObject({ page: 2, limit: 10, total: 1 });
    expect(current.getLastList()).toMatchObject({ skip: 10, take: 10 });
  });
  it("returns appointment history and safe completed-value aggregates", async () => {
    await expect(
      fixture().service.detail(owner, "a", "customer-a"),
    ).resolves.toMatchObject({
      summary: {
        completedAppointments: 2,
        totalVisits: 2,
        completedAppointmentValue: "250.00",
      },
      recentAppointments: [{ id: "appointment" }],
    });
  });
  it("updates only scoped DTO fields", async () => {
    await expect(
      fixture().service.update(owner, "a", "customer-a", {
        firstName: "Augusta",
        archived: true,
      }),
    ).resolves.toMatchObject({
      id: "customer-a",
      businessId: "a",
      firstName: "Augusta",
      archivedAt: expect.any(Date),
    });
  });
  it("isolates notes by both business and customer", async () => {
    const { service } = fixture();
    await service.addNote(owner, "a", "customer-a", {
      content: " Prefers mornings ",
    });
    await expect(
      service.listNotes(owner, "a", "customer-a"),
    ).resolves.toHaveLength(1);
    await expect(
      service.listNotes(owner, "b", "customer-a"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it("manages tenant-scoped tags and assignments", async () => {
    const { service } = fixture();
    await expect(
      service.createTag(owner, "a", { name: "New Client" }),
    ).resolves.toMatchObject({ slug: "new-client" });
    await expect(
      service.assignTag(owner, "a", "customer-a", "tag-a"),
    ).resolves.toMatchObject({ customerId: "customer-a", tagId: "tag-a" });
    await expect(
      service.assignTag(owner, "a", "customer-a", "tag-b"),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.removeTag(owner, "a", "customer-a", "tag-a"),
    ).resolves.toBeUndefined();
  });
  it("rejects preferred staff from another tenant", async () => {
    await expect(
      fixture().service.update(owner, "a", "customer-a", {
        preferredStaffId: "staff-b",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it("rejects users without business access", async () => {
    await expect(
      fixture().service.list(owner, "forbidden", {
        page: 1,
        limit: 25,
        sort: "createdAt",
        direction: "desc",
        archived: false,
      }),
    ).rejects.toThrow("Business access denied");
  });
});
