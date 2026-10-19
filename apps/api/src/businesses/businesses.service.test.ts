/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { PermissionsService } from "../auth/permissions.service.js";
import { BusinessesService } from "./businesses.service.js";

const users = {
  owner: {
    id: "owner",
    email: "owner@example.test",
    role: "BUSINESS_OWNER" as const,
  },
  admin: {
    id: "admin",
    email: "admin@example.test",
    role: "BUSINESS_ADMIN" as const,
  },
  staff: {
    id: "staff-user",
    email: "staff@example.test",
    role: "STAFF" as const,
  },
  customer: {
    id: "customer",
    email: "customer@example.test",
    role: "CUSTOMER" as const,
  },
  superAdmin: {
    id: "super",
    email: "super@example.test",
    role: "SUPER_ADMIN" as const,
  },
};

function fixture() {
  const memberships = new Set(["owner:a", "admin:a", "staff-user:a"]);
  const locations = [
    { id: "location-a", businessId: "a" },
    { id: "location-b", businessId: "b" },
  ];
  const staff = [
    { id: "staff-a", businessId: "a" },
    { id: "staff-b", businessId: "b" },
  ];
  const services = [
    { id: "service-a", businessId: "a" },
    { id: "service-b", businessId: "b" },
  ];
  const model = (records: any[]) => ({
    findFirst: async ({ where }: any) =>
      records.find(
        (item) =>
          item.id === where.id &&
          (!where.businessId || item.businessId === where.businessId),
      ) ?? null,
    findUnique: async ({ where }: any) =>
      records.find((item) => item.id === where.id) ?? null,
    findMany: async ({ where }: any) =>
      records.filter(
        (item) => !where?.businessId || item.businessId === where.businessId,
      ),
    count: async ({ where }: any) =>
      records.filter(
        (item) =>
          item.businessId === where.businessId && where.id.in.includes(item.id),
      ).length,
    update: async ({ where, data }: any) => ({
      ...records.find((item) => item.id === where.id),
      ...data,
    }),
  });
  const prisma: any = {
    businessMember: {
      findUnique: async ({ where }: any) => {
        const key = `${where.userId_businessId.userId}:${where.userId_businessId.businessId}`;
        if (!memberships.has(key)) return null;
        return {
          id: "membership",
          role: key.startsWith("owner:")
            ? "BUSINESS_OWNER"
            : key.startsWith("admin:")
              ? "BUSINESS_ADMIN"
              : "STAFF",
        };
      },
    },
    business: model([{ id: "a" }, { id: "b" }]),
    location: model(locations),
    staff: model(staff),
    service: model(services),
    staffProfileService: { upsert: async ({ create }: any) => create },
  };
  const permissions = new PermissionsService(prisma);
  return { service: new BusinessesService(prisma, permissions), permissions };
}

describe("business tenant authorization", () => {
  it("lets owners and admins manage their business", async () => {
    const { service } = fixture();
    await expect(
      service.updateBusiness(users.owner, "a", { name: "Owner update" }),
    ).resolves.toMatchObject({ id: "a" });
    await expect(
      service.updateBusiness(users.admin, "a", { name: "Admin update" }),
    ).resolves.toMatchObject({ id: "a" });
  });
  it("rejects staff and customers from management", async () => {
    const { service } = fixture();
    await expect(
      service.updateBusiness(users.staff, "a", { name: "No" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.updateBusiness(users.customer, "a", { name: "No" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it("prevents tenant A from reading or changing tenant B resources", async () => {
    const { service } = fixture();
    await expect(service.getBusiness(users.owner, "b")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.updateStaff(users.owner, "a", "staff-b", { displayName: "No" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it("cannot connect staff to a cross-tenant service or location", async () => {
    const { service } = fixture();
    await expect(
      service.addStaffService(users.owner, "a", "staff-a", "service-b"),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.createStaff(users.owner, "a", {
        firstName: "A",
        lastName: "B",
        displayName: "A B",
        locationIds: ["location-b"],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it("allows SUPER_ADMIN global tenant access", async () => {
    const { service } = fixture();
    await expect(
      service.getBusiness(users.superAdmin, "b"),
    ).resolves.toMatchObject({ id: "b" });
  });
  it("returns 404 for missing tenant resources", async () => {
    const { service } = fixture();
    await expect(
      service.getLocation(users.owner, "a", "missing"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
