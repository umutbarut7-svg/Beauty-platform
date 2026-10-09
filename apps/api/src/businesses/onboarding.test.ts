/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { BusinessesService } from "./businesses.service.js";

describe("business onboarding", () => {
  it("atomically creates settings, owner membership and default hours", async () => {
    const calls: string[] = [];
    const tx: any = {
      business: {
        create: async ({ data }: any) => {
          calls.push("business");
          return { id: "business-1", ...data };
        },
      },
      businessSettings: { create: async () => calls.push("settings") },
      businessMember: {
        create: async ({ data }: any) => {
          calls.push(`member:${data.role}`);
        },
      },
      workingHour: {
        createMany: async ({ data }: any) => calls.push(`hours:${data.length}`),
      },
    };
    const prisma: any = {
      $transaction: async (callback: any) => {
        calls.push("transaction");
        return callback(tx);
      },
    };
    const permissions: any = { has: () => true };
    const service = new BusinessesService(prisma, permissions);
    const business = await service.createBusiness(
      { id: "user-1", email: "owner@test.invalid", role: "CUSTOMER" },
      { name: "Restart Hair Design" },
    );
    expect(business.slug).toBe("restart-hair-design");
    expect(calls).toEqual([
      "transaction",
      "business",
      "settings",
      "member:BUSINESS_OWNER",
      "hours:7",
    ]);
  });

  it("retries a database slug conflict with a numeric suffix", async () => {
    let attempts = 0;
    const tx: any = {
      business: {
        create: async ({ data }: any) => {
          attempts += 1;
          if (attempts === 1)
            throw Object.assign(new Error("unique"), { code: "P2002" });
          return { id: "b", ...data };
        },
      },
      businessSettings: { create: async () => ({}) },
      businessMember: { create: async () => ({}) },
      workingHour: { createMany: async () => ({}) },
    };
    const service = new BusinessesService(
      { $transaction: async (callback: any) => callback(tx) } as never,
      { has: () => true } as never,
    );
    await expect(
      service.createBusiness(
        { id: "u", email: "u@test.invalid", role: "CUSTOMER" },
        { name: "Same Salon" },
      ),
    ).resolves.toMatchObject({ slug: "same-salon-2" });
  });
});
