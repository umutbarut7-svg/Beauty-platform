import { Inject, Injectable } from "@nestjs/common";
import { PRISMA_SERVICE } from "../../database/database.tokens.js";
import type { PrismaService } from "../../database/prisma.service.js";
export interface CustomerMetrics {
  totalAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  noShowAppointments: number;
  upcomingAppointments: number;
  totalSpend: number;
  averageSpend: number;
  firstVisitAt: Date | null;
  lastVisitAt: Date | null;
  nextAppointmentAt: Date | null;
  daysSinceLastVisit: number | null;
}
@Injectable()
export class CustomerMetricsService {
  constructor(@Inject(PRISMA_SERVICE) private readonly prisma: PrismaService) {}
  async calculateMany(
    businessId: string,
    customerIds: string[],
    db: PrismaService = this.prisma,
  ) {
    const rows = await db.appointment.findMany({
      where: { businessId, businessCustomerId: { in: customerIds } },
      select: {
        businessCustomerId: true,
        status: true,
        startsAt: true,
        completedAt: true,
        price: true,
      },
    });
    const now = Date.now();
    const result = new Map<string, CustomerMetrics>();
    for (const id of customerIds)
      result.set(id, {
        totalAppointments: 0,
        completedAppointments: 0,
        cancelledAppointments: 0,
        noShowAppointments: 0,
        upcomingAppointments: 0,
        totalSpend: 0,
        averageSpend: 0,
        firstVisitAt: null,
        lastVisitAt: null,
        nextAppointmentAt: null,
        daysSinceLastVisit: null,
      });
    for (const row of rows) {
      const m = result.get(row.businessCustomerId);
      if (!m) continue;
      m.totalAppointments++;
      const start = row.startsAt as Date;
      if (!m.firstVisitAt || start < m.firstVisitAt) m.firstVisitAt = start;
      if (
        ["PENDING", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS"].includes(
          row.status,
        ) &&
        start.getTime() >= now
      ) {
        m.upcomingAppointments++;
        if (!m.nextAppointmentAt || start < m.nextAppointmentAt)
          m.nextAppointmentAt = start;
      }
      if (row.status === "COMPLETED") {
        m.completedAppointments++;
        m.totalSpend += Number(row.price);
        const visit = (row.completedAt as Date | null) ?? start;
        if (!m.lastVisitAt || visit > m.lastVisitAt) m.lastVisitAt = visit;
      }
      if (row.status === "CANCELLED") m.cancelledAppointments++;
      if (row.status === "NO_SHOW") m.noShowAppointments++;
    }
    for (const m of result.values()) {
      m.averageSpend = m.completedAppointments
        ? m.totalSpend / m.completedAppointments
        : 0;
      m.daysSinceLastVisit = m.lastVisitAt
        ? Math.floor((now - m.lastVisitAt.getTime()) / 86400000)
        : null;
    }
    return result;
  }
}
