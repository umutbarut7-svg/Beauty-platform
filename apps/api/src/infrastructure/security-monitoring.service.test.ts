import { describe, expect, it, vi } from "vitest";
import { MetricsService } from "./metrics.service.js";
import { SecurityMonitoringService } from "./security-monitoring.service.js";

describe("SecurityMonitoringService", () => {
  it("stores provider-neutral redacted events and instruments failures", async () => {
    const db = {
      securityEvent: { create: vi.fn().mockResolvedValue({ id: "event-1" }) },
    };
    const metrics = new MetricsService();
    await new SecurityMonitoringService(db as never, metrics).record(
      "AUTHENTICATION_FAILED",
      "WARNING",
      { token: "never-store", reason: "invalid_signature" },
    );
    expect(db.securityEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "AUTHENTICATION_FAILED",
        metadata: { token: "[REDACTED]", reason: "invalid_signature" },
      }),
    });
    expect(metrics.snapshot().authFailures).toBe(1);
  });
  it("does not replace the original request failure when monitoring storage is unavailable", async () => {
    const db = {
      securityEvent: {
        create: vi.fn().mockRejectedValue(new Error("offline")),
      },
    };
    const metrics = new MetricsService();
    await expect(
      new SecurityMonitoringService(db as never, metrics).record(
        "RATE_LIMIT_EXCEEDED",
        "WARNING",
      ),
    ).resolves.toBeNull();
    expect(metrics.snapshot().dependencyFailures).toBe(1);
  });
});
