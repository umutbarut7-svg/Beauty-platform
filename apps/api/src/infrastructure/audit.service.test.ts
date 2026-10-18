import { describe, expect, it, vi } from "vitest";
import { AuditService } from "./audit.service.js";

describe("AuditService", () => {
  it("persists tenant-scoped events while redacting sensitive metadata", async () => {
    const db = {
      auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
    };
    await new AuditService(db as never).record({
      businessId: "tenant-a",
      actorId: "actor-a",
      actorType: "OWNER",
      action: "customer.update",
      resourceType: "BusinessCustomer",
      resourceId: "customer-a",
      result: "SUCCEEDED",
      metadata: { password: "never-store", changedFields: ["firstName"] },
    });
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId: "tenant-a",
        actorId: "actor-a",
        metadata: { password: "[REDACTED]", changedFields: ["firstName"] },
      }),
    });
  });
});
