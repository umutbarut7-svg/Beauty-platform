import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { CategoryEngineService } from "./category-engine.service.js";
const category = {
  id: "cat",
  key: "massage",
  name: "Massage",
  version: 2,
  capabilities: [
    { capability: "BOOKING" },
    { capability: "CUSTOM_ATTRIBUTES" },
  ],
};
function fixture(overrides: Record<string, unknown> = {}) {
  const db = {
    platformCategory: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { ...category, subcategories: [], serviceTypes: [] },
        ]),
      findUnique: vi.fn().mockResolvedValue({ id: "cat" }),
    },
    platformSubcategory: {
      findFirst: vi.fn().mockResolvedValue({ id: "sub" }),
    },
    platformServiceType: {
      findFirst: vi.fn().mockResolvedValue({ id: "type" }),
    },
    tenantCategoryConfiguration: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({ id: "cfg" }),
      create: vi.fn(),
      update: vi.fn(),
    },
    service: {
      findFirst: vi.fn().mockResolvedValue({
        platformCategory: category,
        platformSubcategory: {
          id: "sub",
          key: "therapeutic",
          name: "Therapeutic",
        },
        platformServiceType: { id: "type", key: "deep", name: "Deep tissue" },
      }),
    },
    categoryAttributeDefinition: {
      findMany: vi.fn().mockResolvedValue([
        {
          key: "pressure",
          type: "ENUM",
          required: true,
          minValue: null,
          maxValue: null,
          options: [{ value: "medium" }, { value: "firm" }],
        },
      ]),
    },
    professionalServiceTypeAssignment: {
      findFirst: vi.fn().mockResolvedValue({ staffId: "staff" }),
    },
    serviceResourceRequirement: { findMany: vi.fn().mockResolvedValue([]) },
    platformResource: { aggregate: vi.fn() },
    ...overrides,
  };
  const permissions = {
    assertBusinessAccess: vi.fn().mockResolvedValue(undefined),
  };
  return {
    db,
    permissions,
    service: new CategoryEngineService(db as never, permissions as never),
  };
}
describe("CategoryEngineService", () => {
  it("returns a versioned hierarchy and normalized capability taxonomy", async () => {
    const { service } = fixture();
    const rows = await service.registry();
    expect(rows[0]).toMatchObject({ key: "massage", version: 2 });
  });
  it("keeps legacy services backward compatible", async () => {
    const { service, db } = fixture();
    db.service.findFirst.mockResolvedValueOnce({
      platformCategory: null,
      platformSubcategory: null,
      platformServiceType: null,
    });
    await expect(
      service.validateBooking("b", "legacy", "staff"),
    ).resolves.toEqual({ legacy: true, attributes: {} });
  });
  it("distinguishes required typed attributes from arbitrary JSON", async () => {
    const { service } = fixture();
    await expect(
      service.validateBooking("b", "s", "staff", {}),
    ).rejects.toThrow("Missing category attribute");
    await expect(
      service.validateBooking("b", "s", "staff", { pressure: "medium" }),
    ).resolves.toMatchObject({ legacy: false });
  });
  it("rejects unknown and invalid enum attributes", async () => {
    const { service } = fixture();
    await expect(
      service.validateBooking("b", "s", "staff", { pressure: "soft" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.validateBooking("b", "s", "staff", {
        pressure: "medium",
        injected: "x",
      }),
    ).rejects.toThrow("Unknown category attribute");
  });
  it("rejects unsupported capabilities deterministically", async () => {
    const { service } = fixture();
    const context = await service.contextForService("b", "s");
    expect(() => service.assertCapability(context!, "RESULT")).toThrow(
      ConflictException,
    );
  });
  it("fails closed when the tenant has not enabled the category", async () => {
    const { service, db } = fixture();
    db.tenantCategoryConfiguration.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.validateBooking("b", "s", "staff", { pressure: "firm" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it("requires explicit professional eligibility when matching is enabled", async () => {
    const matching = {
      ...category,
      capabilities: [
        ...category.capabilities,
        { capability: "PROFESSIONAL_MATCHING" },
      ],
    };
    const { service, db } = fixture();
    db.service.findFirst.mockResolvedValue({
      platformCategory: matching,
      platformSubcategory: null,
      platformServiceType: { id: "type", key: "deep", name: "Deep" },
    });
    db.professionalServiceTypeAssignment.findFirst.mockResolvedValue(null);
    await expect(
      service.validateBooking("b", "s", "other", { pressure: "firm" }),
    ).rejects.toThrow("not eligible");
  });
  it("enforces resource capacity for resource-required categories", async () => {
    const resource = {
      ...category,
      capabilities: [
        ...category.capabilities,
        { capability: "RESOURCE_REQUIRED" },
      ],
    };
    const { service, db } = fixture();
    db.service.findFirst.mockResolvedValue({
      platformCategory: resource,
      platformSubcategory: null,
      platformServiceType: { id: "type", key: "deep", name: "Deep" },
    });
    db.serviceResourceRequirement.findMany.mockResolvedValue([
      { resourceTypeId: "room", quantity: 2 },
    ]);
    db.platformResource.aggregate.mockResolvedValue({ _sum: { capacity: 1 } });
    await expect(
      service.validateBooking("b", "s", "staff", { pressure: "firm" }),
    ).rejects.toThrow("resource capacity");
  });
  it("delegates tenant access to server-side authorization", async () => {
    const { service, permissions } = fixture();
    await service.tenantRegistry(
      { id: "u", role: "CUSTOMER", email: "u@example.com" },
      "tenant-a",
    );
    expect(permissions.assertBusinessAccess).toHaveBeenCalledWith(
      expect.anything(),
      "tenant-a",
      "service_category:read",
    );
  });
});
