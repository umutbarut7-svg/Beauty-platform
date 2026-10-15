/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { SalonCoreService } from "./salon-core.service.js";

const owner = {
  id: "owner",
  email: "owner@test.invalid",
  role: "BUSINESS_OWNER" as const,
};
const staffUser = {
  id: "staff",
  email: "staff@test.invalid",
  role: "STAFF" as const,
};

function fixture() {
  const members = [
    {
      id: "owner-member",
      userId: "owner",
      businessId: "a",
      role: "BUSINESS_OWNER",
    },
  ];
  const branches = [
    { id: "branch-a", businessId: "a", slug: "main" },
    { id: "branch-b", businessId: "b", slug: "main" },
  ];
  const prisma: any = {
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
      count: async ({ where }: any) =>
        members.filter(
          (m) => m.businessId === where.businessId && m.role === where.role,
        ).length,
      delete: async ({ where }: any) =>
        members.splice(
          members.findIndex((m) => m.id === where.id),
          1,
        ),
    },
    branch: {
      findFirst: async ({ where }: any) =>
        branches.find(
          (b) => b.id === where.id && b.businessId === where.businessId,
        ) ?? null,
      create: async ({ data }: any) => ({ id: "new", ...data }),
    },
    businessSettings: {
      findUniqueOrThrow: async () => ({ businessId: "a" }),
      update: async ({ data }: any) => data,
    },
    workingHour: {
      findMany: async () => [],
      deleteMany: async () => ({}),
      createMany: async () => ({}),
    },
    $transaction: async (callback: any) => callback(prisma),
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
        user.id === "staff" &&
        !["branch:read", "working_hours:read", "settings:read"].includes(
          permission,
        )
      )
        throw new ForbiddenException("Insufficient permission");
    },
  };
  return { service: new SalonCoreService(prisma, permissions), members };
}

describe("SalonCoreService", () => {
  it("prevents tenant A from reading tenant B branches", async () => {
    const { service } = fixture();
    await expect(
      service.getBranch(owner, "a", "branch-b"),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.getBranch(owner, "b", "branch-b"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it("prevents staff from settings updates", async () => {
    const { service } = fixture();
    await expect(
      service.updateSettings(staffUser, "a", { bookingEnabled: false }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it("does not remove the final owner", async () => {
    const { service } = fixture();
    await expect(
      service.removeMember(owner, "a", "owner-member"),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it("rejects invalid working-hour ranges", async () => {
    const { service } = fixture();
    await expect(
      service.updateWorkingHours(owner, "a", {
        hours: [
          {
            dayOfWeek: "MONDAY",
            isOpen: true,
            openTime: "18:00",
            closeTime: "09:00",
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it("generates normalized branch slugs", async () => {
    const { service } = fixture();
    await expect(
      service.createBranch(owner, "a", {
        name: "İstanbul Merkez",
        city: "Istanbul",
        address: "Test address",
      }),
    ).resolves.toMatchObject({ slug: "istanbul-merkez", businessId: "a" });
  });
  it("retries branch slug conflicts", async () => {
    const { service } = fixture();
    let attempts = 0;
    (service as any).prisma.branch.create = async ({ data }: any) => {
      attempts += 1;
      if (attempts === 1)
        throw Object.assign(new Error("unique"), { code: "P2002" });
      return data;
    };
    await expect(
      service.createBranch(owner, "a", {
        name: "Main Branch",
        city: "Istanbul",
        address: "Test address",
      }),
    ).resolves.toMatchObject({ slug: "main-branch-2" });
  });
});
