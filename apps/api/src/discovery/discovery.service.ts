/* eslint-disable @typescript-eslint/consistent-type-imports */
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import type {
  DiscoverySearchResponse,
  DiscoverySearchResult,
} from "@beauty-platform/types";
import { DatabaseSearchProvider } from "./database-search.provider.js";
import type { DiscoverySearchQueryDto } from "./discovery.dto.js";
import { RankingService } from "./ranking.service.js";
import { normalizeSearchText } from "./search-normalization.js";
import { DiscoveryAvailabilityService } from "./discovery-availability.service.js";
import { UnavailableResultProbabilityProvider } from "./result-probability.provider.js";
import { MetricsService } from "../infrastructure/metrics.service.js";
import type { DiscoveryIntent } from "@beauty-platform/types";
import { intentToSearchQuery } from "./discovery-intent.js";
interface CursorPayload {
  v: 1;
  id: string;
  sort: string;
}
@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);
  constructor(
    private readonly provider: DatabaseSearchProvider,
    private readonly ranking: RankingService,
    private readonly availability: DiscoveryAvailabilityService,
    private readonly probability: UnavailableResultProbabilityProvider,
    private readonly metrics: MetricsService,
  ) {}
  match(intent: DiscoveryIntent) {
    if (
      intent.attributes &&
      (Object.keys(intent.attributes).length > 20 ||
        Object.values(intent.attributes).some(
          (value) => !["string", "number", "boolean"].includes(typeof value),
        ))
    )
      throw new BadRequestException("Invalid discovery intent attributes");
    return this.search(intentToSearchQuery(intent) as DiscoverySearchQueryDto);
  }
  async search(q: DiscoverySearchQueryDto): Promise<DiscoverySearchResponse> {
    this.validate(q);
    const started = Date.now();
    const normalized = {
      ...q,
      sort: q.sort ?? "RELEVANCE",
      limit: q.limit ?? 20,
      entityType: q.entityType ?? "ALL",
      query: normalizeSearchText(q.query),
      category: normalizeSearchText(q.category),
      service: normalizeSearchText(q.service),
      city: normalizeSearchText(q.city),
      district: normalizeSearchText(q.district),
      professional: normalizeSearchText(q.professional),
      business: normalizeSearchText(q.business),
      location: normalizeSearchText(q.location),
    };
    const health = await this.provider.health();
    if (!health.available)
      throw new BadRequestException({
        code: "SEARCH_PROVIDER_UNAVAILABLE",
        provider: this.provider.name,
      });
    const candidates = await this.provider.searchCandidates(normalized);
    const availableCandidates = await this.availability.resolve(
      candidates,
      normalized,
    );
    const ranked = this.ranking.rank(availableCandidates, normalized);
    let start = 0;
    if (q.cursor) {
      const cursor = this.decode(q.cursor);
      if (cursor.sort !== normalized.sort)
        throw new BadRequestException("Cursor sort does not match query sort");
      const index = ranked.findIndex((x) => x.candidate.id === cursor.id);
      if (index < 0) throw new BadRequestException("Cursor is no longer valid");
      start = index + 1;
    }
    const page = ranked.slice(start, start + normalized.limit),
      hasMore = start + normalized.limit < ranked.length;
    const items: DiscoverySearchResult[] = await Promise.all(
      page.map(async (x) => ({
        businessId: x.candidate.id,
        name: x.candidate.name,
        slug: x.candidate.slug,
        description: x.candidate.description,
        logoUrl: x.candidate.logoUrl,
        city: x.candidate.city,
        district: x.candidate.district,
        categories: x.candidate.categories,
        services: x.candidate.services,
        professionals: x.candidate.staff
          .filter(
            (staff) =>
              !q.availableFrom ||
              x.candidate.availableStaffIds.includes(staff.id),
          )
          .map((staff) => ({
            id: staff.id,
            displayName: staff.displayName,
            title: staff.title,
            completedAppointments: staff.completedAppointments,
            expertiseScore: x.expertiseByStaff[staff.id] ?? null,
          })),
        rating:
          x.rating === null
            ? null
            : { average: x.rating, count: x.candidate.ratings.length },
        verified: x.candidate.isVerified,
        priceRange:
          x.minPrice === null || x.maxPrice === null
            ? null
            : {
                min: x.minPrice.toFixed(2),
                max: x.maxPrice.toFixed(2),
                currency: x.candidate.services[0]?.currency ?? "",
              },
        nextAvailabilityAt: x.candidate.nextAvailabilityAt,
        distanceKm: x.distanceKm,
        distanceMeters:
          x.distanceKm === null ? null : Math.round(x.distanceKm * 1000),
        resultProbability: await this.probability.probability({
          businessId: x.candidate.id,
          serviceId: q.serviceId,
          professionalId: q.professionalId,
        }),
        ranking: { score: x.score, matchedSignals: x.signals },
      })),
    );
    const durationMs = Date.now() - started;
    const filteredCount = candidates.length - ranked.length;
    this.metrics.discovery({
      durationMs,
      resultCount: items.length,
      filteredCount,
      geo: q.latitude !== undefined,
      availability: q.availableFrom !== undefined,
    });
    this.logger.log({
      event: "discovery.search",
      provider: this.provider.name,
      fallbackUsed: false,
      resultCount: items.length,
      queryLength: normalized.query?.length ?? 0,
      durationMs,
    });
    return {
      items,
      nextCursor: hasMore
        ? this.encode({
            v: 1,
            id: page.at(-1)!.candidate.id,
            sort: normalized.sort,
          })
        : null,
      provider: "DATABASE",
      fallbackUsed: false,
      meta: {
        noMatch: items.length === 0,
        totalCandidates: candidates.length,
        filteredCount,
        availabilityEvaluated: q.availableFrom !== undefined,
      },
    };
  }
  private validate(q: DiscoverySearchQueryDto) {
    if (q.categoryId && q.category)
      throw new BadRequestException("Use categoryId or category, not both");
    if (q.serviceId && q.service)
      throw new BadRequestException("Use serviceId or service, not both");
    if (q.professionalId && q.professional)
      throw new BadRequestException(
        "Use professionalId or professional, not both",
      );
    if (q.businessId && q.business)
      throw new BadRequestException("Use businessId or business, not both");
    if (q.locationId && q.location)
      throw new BadRequestException("Use locationId or location, not both");
    if ((q.latitude === undefined) !== (q.longitude === undefined))
      throw new BadRequestException(
        "latitude and longitude must be provided together",
      );
    if (q.radiusKm !== undefined && q.latitude === undefined)
      throw new BadRequestException("radius requires coordinates");
    if (
      q.minPrice !== undefined &&
      q.maxPrice !== undefined &&
      q.minPrice > q.maxPrice
    )
      throw new BadRequestException("minPrice cannot exceed maxPrice");
    if (
      q.minDurationMinutes !== undefined &&
      q.maxDurationMinutes !== undefined &&
      q.minDurationMinutes > q.maxDurationMinutes
    )
      throw new BadRequestException(
        "minDurationMinutes cannot exceed maxDurationMinutes",
      );
    if ((q.availableFrom === undefined) !== (q.availableTo === undefined))
      throw new BadRequestException(
        "availability range requires both boundaries",
      );
    if (
      q.availableFrom &&
      new Date(q.availableFrom) >= new Date(q.availableTo!)
    )
      throw new BadRequestException("availableFrom must be before availableTo");
    if (q.availableFrom && !q.serviceId)
      throw new BadRequestException(
        "Availability discovery requires an exact serviceId",
      );
  }
  private encode(v: CursorPayload) {
    return Buffer.from(JSON.stringify(v)).toString("base64url");
  }
  private decode(value: string): CursorPayload {
    try {
      const parsed: unknown = JSON.parse(
        Buffer.from(value, "base64url").toString("utf8"),
      );
      if (
        !parsed ||
        typeof parsed !== "object" ||
        (parsed as CursorPayload).v !== 1 ||
        typeof (parsed as CursorPayload).id !== "string" ||
        typeof (parsed as CursorPayload).sort !== "string"
      )
        throw new Error();
      return parsed as CursorPayload;
    } catch {
      throw new BadRequestException("Malformed discovery cursor");
    }
  }
}
