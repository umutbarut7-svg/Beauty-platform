import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  OrzellShareTarget,
  PublishedShareService,
} from "@beauty-platform/types";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";

@Injectable()
export class SharedServiceService {
  constructor(@Inject(PRISMA_SERVICE) private readonly db: PrismaService) {}

  async resolve(
    target: OrzellShareTarget,
    database: PrismaService = this.db,
  ): Promise<PublishedShareService> {
    // Photo consent alone is not permission to publish a result to the internet.
    if (process.env.ORZELL_EVERYWHERE_ENABLED !== "true" || target.resultId)
      throw new NotFoundException("Shared service is unavailable");
    const staffWhere = {
      businessId: target.businessId,
      isActive: true,
      acceptsBookings: true,
      ...(target.professionalId ? { id: target.professionalId } : {}),
    };
    const row = await database.service.findFirst({
      where: {
        id: target.serviceId,
        businessId: target.businessId,
        isActive: true,
        isBookable: true,
        business: { isPublic: true, status: "ACTIVE" },
        category: { businessId: target.businessId, isActive: true },
        ...(target.professionalId
          ? {
              staffProfiles: {
                some: {
                  businessId: target.businessId,
                  isActive: true,
                  staff: staffWhere,
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        price: true,
        currency: true,
        durationMinutes: true,
        business: {
          select: {
            id: true,
            name: true,
            timezone: true,
            locations: {
              where: { businessId: target.businessId, isActive: true },
              select: { id: true, name: true },
              orderBy: { id: "asc" },
            },
          },
        },
        staffProfiles: {
          where: {
            businessId: target.businessId,
            isActive: true,
            staff: staffWhere,
          },
          select: {
            customPrice: true,
            customDurationMinutes: true,
            staff: { select: { id: true, displayName: true } },
          },
          orderBy: { staffId: "asc" },
        },
      },
    });
    if (!row) throw new NotFoundException("Shared service is unavailable");
    return {
      business: {
        id: row.business.id,
        name: row.business.name,
        timezone: row.business.timezone,
      },
      locations: row.business.locations,
      service: {
        id: row.id,
        name: row.name,
        price: String(row.price),
        currency: row.currency,
        durationMinutes: row.durationMinutes,
      },
      professionals: row.staffProfiles.map(
        (assignment: {
          customPrice: unknown | null;
          customDurationMinutes: number | null;
          staff: { id: string; displayName: string };
        }) => ({
          id: assignment.staff.id,
          displayName: assignment.staff.displayName,
          price: String(assignment.customPrice ?? row.price),
          durationMinutes:
            assignment.customDurationMinutes ?? row.durationMinutes,
        }),
      ),
    };
  }
}
