import { Inject, Injectable } from "@nestjs/common";
import type { DiscoverySearchQuery } from "@beauty-platform/types";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { SearchCandidate, SearchProvider } from "./search-provider.js";
import { normalizeSearchText } from "./search-normalization.js";
interface DatabaseBusinessRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  city: string | null;
  district: string | null;
  latitude: unknown | null;
  longitude: unknown | null;
  isVerified: boolean;
  locations: {
    id: string;
    name: string;
    city: string;
    district: string | null;
    latitude: unknown | null;
    longitude: unknown | null;
  }[];
  serviceCategories: { id: string; name: string; slug: string }[];
  services: {
    id: string;
    name: string;
    price: unknown;
    currency: string;
    durationMinutes: number;
  }[];
  staff: {
    id: string;
    displayName: string;
    title: string | null;
    services: { serviceId: string }[];
    _count: { appointments: number };
  }[];
  reviews: { rating: number }[];
}
@Injectable()
export class DatabaseSearchProvider implements SearchProvider {
  readonly name = "DATABASE";
  constructor(@Inject(PRISMA_SERVICE) private readonly db: PrismaService) {}
  async health() {
    return { available: true };
  }
  async searchCandidates(q: DiscoverySearchQuery): Promise<SearchCandidate[]> {
    const text = normalizeSearchText(q.query);
    const price: Record<string, number> = {};
    if (q.minPrice !== undefined) price.gte = q.minPrice;
    if (q.maxPrice !== undefined) price.lte = q.maxPrice;
    const duration: Record<string, number> = {};
    if (q.minDurationMinutes !== undefined) duration.gte = q.minDurationMinutes;
    if (q.maxDurationMinutes !== undefined) duration.lte = q.maxDurationMinutes;
    const serviceWhere: Record<string, unknown> = {
      isActive: true,
      isBookable: true,
      ...(q.serviceId ? { id: q.serviceId } : {}),
      ...(q.subcategoryId ? { platformSubcategoryId: q.subcategoryId } : {}),
      ...(q.serviceTypeId ? { platformServiceTypeId: q.serviceTypeId } : {}),
      ...(q.capability
        ? {
            platformCategory: {
              capabilities: { some: { capability: q.capability } },
            },
          }
        : {}),
      ...(q.service
        ? { name: { contains: q.service, mode: "insensitive" } }
        : {}),
      ...(Object.keys(price).length ? { price } : {}),
      ...(Object.keys(duration).length ? { durationMinutes: duration } : {}),
    };
    const needsServiceFilter =
      q.serviceId !== undefined ||
      q.subcategoryId !== undefined ||
      q.serviceTypeId !== undefined ||
      q.capability !== undefined ||
      q.service !== undefined ||
      Object.keys(price).length > 0 ||
      Object.keys(duration).length > 0;
    const where: Record<string, unknown> = {
      isPublic: true,
      status: "ACTIVE",
      ...(q.countryCode ? { country: q.countryCode.toUpperCase() } : {}),
      ...(q.businessId ? { id: q.businessId } : {}),
      ...(q.business
        ? { name: { contains: q.business, mode: "insensitive" } }
        : {}),
      ...(q.verifiedOnly ? { isVerified: true } : {}),
      ...(q.entityType === "SERVICE"
        ? { services: { some: serviceWhere } }
        : {}),
      ...(q.entityType === "PROFESSIONAL"
        ? {
            staff: {
              some: { isActive: true, acceptsBookings: true },
            },
          }
        : {}),
      ...(needsServiceFilter ? { services: { some: serviceWhere } } : {}),
      ...(q.categoryId
        ? { serviceCategories: { some: { id: q.categoryId, isActive: true } } }
        : {}),
      ...(q.professionalSkill
        ? {
            staff: {
              some: {
                isActive: true,
                serviceTypeAssignments: {
                  some: {
                    isActive: true,
                    skills: { has: q.professionalSkill },
                  },
                },
              },
            },
          }
        : {}),
      ...(q.professionalId
        ? {
            staff: {
              some: {
                id: q.professionalId,
                isActive: true,
                acceptsBookings: true,
              },
            },
          }
        : {}),
      ...(q.professional
        ? {
            staff: {
              some: {
                displayName: { contains: q.professional, mode: "insensitive" },
                isActive: true,
                acceptsBookings: true,
              },
            },
          }
        : {}),
      ...(q.locationId
        ? { locations: { some: { id: q.locationId, isActive: true } } }
        : {}),
      ...(q.location
        ? {
            locations: {
              some: {
                name: { contains: q.location, mode: "insensitive" },
                isActive: true,
              },
            },
          }
        : {}),
      ...(text
        ? {
            OR: [
              { name: { contains: text, mode: "insensitive" } },
              { description: { contains: text, mode: "insensitive" } },
              {
                services: {
                  some: {
                    name: { contains: text, mode: "insensitive" },
                    isActive: true,
                  },
                },
              },
              {
                serviceCategories: {
                  some: {
                    name: { contains: text, mode: "insensitive" },
                    isActive: true,
                  },
                },
              },
              {
                staff: {
                  some: {
                    displayName: { contains: text, mode: "insensitive" },
                    isActive: true,
                  },
                },
              },
              {
                locations: {
                  some: {
                    name: { contains: text, mode: "insensitive" },
                    isActive: true,
                  },
                },
              },
            ],
          }
        : {}),
    };
    const locationFilters: Record<string, unknown>[] = [];
    if (q.city)
      locationFilters.push({
        OR: [
          { city: { equals: q.city, mode: "insensitive" } },
          {
            locations: {
              some: {
                city: { equals: q.city, mode: "insensitive" },
                isActive: true,
              },
            },
          },
        ],
      });
    if (q.district)
      locationFilters.push({
        OR: [
          { district: { equals: q.district, mode: "insensitive" } },
          {
            locations: {
              some: {
                district: { equals: q.district, mode: "insensitive" },
                isActive: true,
              },
            },
          },
        ],
      });
    if (
      q.latitude !== undefined &&
      q.longitude !== undefined &&
      q.radiusKm !== undefined
    ) {
      const latitudeDelta = q.radiusKm / 111.32;
      const longitudeScale = Math.max(
        0.01,
        Math.cos((q.latitude * Math.PI) / 180),
      );
      const longitudeDelta = q.radiusKm / (111.32 * longitudeScale);
      const longitudeLow = q.longitude - longitudeDelta;
      const longitudeHigh = q.longitude + longitudeDelta;
      const longitudeBounds =
        longitudeDelta >= 180
          ? {}
          : longitudeLow < -180
            ? {
                OR: [
                  { longitude: { gte: longitudeLow + 360 } },
                  { longitude: { lte: longitudeHigh } },
                ],
              }
            : longitudeHigh > 180
              ? {
                  OR: [
                    { longitude: { gte: longitudeLow } },
                    { longitude: { lte: longitudeHigh - 360 } },
                  ],
                }
              : {
                  longitude: { gte: longitudeLow, lte: longitudeHigh },
                };
      const coordinateBounds = {
        latitude: {
          gte: Math.max(-90, q.latitude - latitudeDelta),
          lte: Math.min(90, q.latitude + latitudeDelta),
        },
        ...longitudeBounds,
      };
      locationFilters.push({
        OR: [
          coordinateBounds,
          {
            locations: {
              some: { ...coordinateBounds, isActive: true },
            },
          },
        ],
      });
    }
    if (locationFilters.length) where.AND = locationFilters;
    if (q.category)
      where.serviceCategories = {
        some: {
          name: { contains: q.category, mode: "insensitive" },
          isActive: true,
        },
      };
    const rows: DatabaseBusinessRow[] = await this.db.business.findMany({
      where,
      take: 100,
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        logoUrl: true,
        city: true,
        district: true,
        latitude: true,
        longitude: true,
        isVerified: true,
        locations: {
          where: { isActive: true },
          take: 10,
          orderBy: { id: "asc" },
          select: {
            id: true,
            name: true,
            city: true,
            district: true,
            latitude: true,
            longitude: true,
          },
        },
        serviceCategories: {
          where: { isActive: true },
          select: { id: true, name: true, slug: true },
        },
        services: {
          where: serviceWhere,
          take: 10,
          orderBy: [{ price: "asc" }, { id: "asc" }],
          select: {
            id: true,
            name: true,
            price: true,
            currency: true,
            durationMinutes: true,
          },
        },
        staff: {
          where: {
            isActive: true,
            acceptsBookings: true,
            ...(q.professionalId ? { id: q.professionalId } : {}),
            ...(q.professional
              ? {
                  displayName: {
                    contains: q.professional,
                    mode: "insensitive",
                  },
                }
              : {}),
            ...(q.serviceId
              ? {
                  services: {
                    some: { serviceId: q.serviceId, isActive: true },
                  },
                }
              : {}),
          },
          take: 20,
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          select: {
            id: true,
            displayName: true,
            title: true,
            services: {
              where: { isActive: true },
              select: { serviceId: true },
            },
            _count: {
              select: { appointments: { where: { status: "COMPLETED" } } },
            },
          },
        },
        reviews: { select: { rating: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      logoUrl: r.logoUrl,
      city: r.city ?? r.locations[0]?.city ?? null,
      district: r.district ?? r.locations[0]?.district ?? null,
      latitude: r.latitude === null ? null : Number(r.latitude),
      longitude: r.longitude === null ? null : Number(r.longitude),
      isVerified: r.isVerified,
      locations: r.locations.map((location) => ({
        ...location,
        latitude: location.latitude === null ? null : Number(location.latitude),
        longitude:
          location.longitude === null ? null : Number(location.longitude),
      })),
      categories: r.serviceCategories,
      services: r.services.map((s) => ({ ...s, price: String(s.price) })),
      staff: r.staff.map(({ services, _count, ...staff }) => ({
        ...staff,
        serviceIds: services.map((service) => service.serviceId),
        completedAppointments: _count.appointments,
      })),
      ratings: r.reviews.map((x) => x.rating),
      nextAvailabilityAt: null,
      availableStaffIds: [],
    }));
  }
}
