/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { CatalogService } from "./catalog.service.js";

const owner = {
  id: "owner-user",
  email: "owner@test.invalid",
  role: "BUSINESS_OWNER" as const,
};
const admin = {
  id: "admin-user",
  email: "admin@test.invalid",
  role: "BUSINESS_ADMIN" as const,
};
const staff = {
  id: "staff-user",
  email: "staff@test.invalid",
  role: "STAFF" as const,
};

function fixture() {
  const categories = [
    {
      id: "cat-a",
      businessId: "a",
      name: "Hair",
      slug: "hair",
      isActive: true,
    },
    {
      id: "cat-b",
      businessId: "b",
      name: "Nails",
      slug: "nails",
      isActive: true,
    },
  ];
  const services = [
    {
      id: "svc-a",
      businessId: "a",
      categoryId: "cat-a",
      name: "Cut",
      slug: "cut",
      isActive: true,
      isBookable: true,
    },
    {
      id: "svc-inactive",
      businessId: "a",
      categoryId: "cat-a",
      name: "Old",
      slug: "old",
      isActive: false,
      isBookable: false,
    },
    {
      id: "svc-b",
      businessId: "b",
      categoryId: "cat-b",
      name: "Nails",
      slug: "nails",
      isActive: true,
      isBookable: true,
    },
  ];
  const members = [
    {
      id: "owner-member",
      userId: "owner-user",
      businessId: "a",
      role: "BUSINESS_OWNER",
    },
    {
      id: "admin-member",
      userId: "admin-user",
      businessId: "a",
      role: "BUSINESS_ADMIN",
    },
    {
      id: "staff-member",
      userId: "staff-user",
      businessId: "a",
      role: "STAFF",
    },
    { id: "member-b", userId: "b-user", businessId: "b", role: "STAFF" },
  ];
  const assignments: any[] = [];
  const prisma: any = {
    staff: { findFirst: async () => null },
    business: {
      findUnique: async ({ where }: any) =>
        where.id === "a" ? { currency: "TRY" } : null,
    },
    businessMember: {
      findUnique: async ({ where }: any) =>
        members.find(
          (m) =>
            m.userId === where.userId_businessId.userId &&
            m.businessId === where.userId_businessId.businessId,
        ) ?? null,
      findFirst: async ({ where }: any) =>
        members.find(
          (m) => m.id === where.id && m.businessId === where.businessId,
        ) ?? null,
    },
    serviceCategory: {
      create: async ({ data }: any) => ({ id: "created-category", ...data }),
      findFirst: async ({ where }: any) =>
        categories.find(
          (c) =>
            c.id === where.id &&
            c.businessId === where.businessId &&
            (where.isActive === undefined || c.isActive === where.isActive),
        ) ?? null,
      findMany: async ({ where }: any) =>
        categories.filter(
          (c) =>
            c.businessId === where.businessId &&
            (where.isActive === undefined || c.isActive === where.isActive),
        ),
    },
    service: {
      create: async ({ data }: any) => ({ id: "created-service", ...data }),
      update: async ({ where, data }: any) => ({
        ...services.find((s) => s.id === where.id),
        ...data,
      }),
      findFirst: async ({ where }: any) =>
        services.find(
          (s) =>
            s.id === where.id &&
            s.businessId === where.businessId &&
            (where.isActive === undefined || s.isActive === where.isActive) &&
            (where.isBookable === undefined ||
              s.isBookable === where.isBookable),
        ) ?? null,
      findMany: async ({ where }: any) =>
        services.filter(
          (s) =>
            s.businessId === where.businessId &&
            (where.isActive === undefined || s.isActive === where.isActive) &&
            (where.isBookable === undefined ||
              s.isBookable === where.isBookable),
        ),
    },
    staffService: {
      create: async ({ data }: any) => {
        if (
          assignments.some(
            (a) =>
              a.businessMemberId === data.businessMemberId &&
              a.serviceId === data.serviceId,
          )
        )
          throw Object.assign(new Error("duplicate"), { code: "P2002" });
        assignments.push(data);
        return data;
      },
      findFirst: async ({ where }: any) =>
        assignments.find(
          (a) =>
            a.businessId === where.businessId &&
            a.businessMemberId === where.businessMemberId &&
            a.serviceId === where.serviceId,
        ) ?? null,
      update: async ({ where, data }: any) => ({
        ...assignments.find(
          (a) =>
            a.businessMemberId ===
            where.businessMemberId_serviceId.businessMemberId,
        ),
        ...data,
      }),
    },
  };
  const permissions: any = {
    assertBusinessAccess: async (
      user: any,
      businessId: string,
      permission: string,
    ) => {
      if (businessId !== "a")
        throw new ForbiddenException("Business access denied");
      if (
        user.id === "staff-user" &&
        !["service:read", "service_category:read"].includes(permission)
      )
        throw new ForbiddenException("Insufficient permission");
    },
  };
  return {
    catalog: new CatalogService(prisma, permissions),
    prisma,
    assignments,
  };
}

describe("CatalogService", () => {
  it("lets an owner create a category and service using business currency", async () => {
    const { catalog } = fixture();
    await expect(
      catalog.createCategory(owner, "a", { name: "Hair Care" }),
    ).resolves.toMatchObject({ slug: "hair-care", businessId: "a" });
    await expect(
      catalog.createService(owner, "a", {
        categoryId: "cat-a",
        name: "Hair Cut",
        durationMinutes: 30,
        price: "250.00",
      }),
    ).resolves.toMatchObject({
      slug: "hair-cut",
      currency: "TRY",
      businessId: "a",
    });
  });
  it("lets an admin update services but rejects staff management", async () => {
    const { catalog } = fixture();
    await expect(
      catalog.updateService(admin, "a", "svc-a", { durationMinutes: 45 }),
    ).resolves.toMatchObject({ durationMinutes: 45 });
    await expect(
      catalog.updateService(staff, "a", "svc-a", { durationMinutes: 45 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it("blocks cross-tenant reads and category assignment", async () => {
    const { catalog } = fixture();
    await expect(
      catalog.getService(owner, "a", "svc-b"),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      catalog.createService(owner, "a", {
        categoryId: "cat-b",
        name: "No",
        durationMinutes: 30,
        price: "1.00",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it("blocks cross-tenant staff assignments", async () => {
    const { catalog } = fixture();
    await expect(
      catalog.assignService(owner, "a", "member-b", { serviceId: "svc-a" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      catalog.assignService(owner, "a", "staff-member", { serviceId: "svc-b" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it("supports custom price and duration and rejects duplicate assignments", async () => {
    const { catalog } = fixture();
    await expect(
      catalog.assignService(owner, "a", "staff-member", {
        serviceId: "svc-a",
        customPrice: "300.00",
        customDurationMinutes: 50,
      }),
    ).resolves.toMatchObject({
      customPrice: "300.00",
      customDurationMinutes: 50,
    });
    await expect(
      catalog.assignService(owner, "a", "staff-member", { serviceId: "svc-a" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it("hides inactive or non-bookable services from staff", async () => {
    const { catalog } = fixture();
    await expect(
      catalog.getService(staff, "a", "svc-inactive"),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(catalog.listServices(staff, "a")).resolves.toEqual([
      expect.objectContaining({ id: "svc-a" }),
    ]);
  });
  it("retries duplicate service slugs", async () => {
    const { catalog, prisma } = fixture();
    let attempts = 0;
    prisma.service.create = async ({ data }: any) => {
      attempts += 1;
      if (attempts === 1)
        throw Object.assign(new Error("duplicate"), { code: "P2002" });
      return data;
    };
    await expect(
      catalog.createService(owner, "a", {
        categoryId: "cat-a",
        name: "Same",
        durationMinutes: 30,
        price: "1.00",
      }),
    ).resolves.toMatchObject({ slug: "same-2" });
  });
});
