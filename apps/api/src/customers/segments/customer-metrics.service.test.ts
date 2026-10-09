/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { CustomerMetricsService } from "./customer-metrics.service.js";
describe("CustomerMetricsService", () => {
  it("derives spend only from completed appointment snapshots in one batch query", async () => {
    const db: any = {
      appointment: {
        findMany: async () => [
          {
            businessCustomerId: "c",
            status: "COMPLETED",
            startsAt: new Date(Date.now() - 86400000),
            completedAt: new Date(Date.now() - 86400000),
            price: "100.00",
          },
          {
            businessCustomerId: "c",
            status: "CANCELLED",
            startsAt: new Date(),
            completedAt: null,
            price: "999.00",
          },
        ],
      },
    };
    const m = (
      await new CustomerMetricsService(db).calculateMany("b", ["c"])
    ).get("c")!;
    expect(m).toMatchObject({
      totalAppointments: 2,
      completedAppointments: 1,
      cancelledAppointments: 1,
      totalSpend: 100,
      averageSpend: 100,
    });
  });
});
