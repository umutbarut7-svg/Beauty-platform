import { Injectable } from "@nestjs/common";
import type { DiscoverySearchQuery, SearchSort } from "@beauty-platform/types";
import type { SearchCandidate } from "./search-provider.js";
import { normalizeSearchText } from "./search-normalization.js";
import { GeoService } from "./geo.service.js";
import { HistoricalExpertiseProvider } from "./expertise.service.js";
import {
  matchSignals,
  priceSignal,
  qualitySignals,
  textSignal,
} from "./ranking-signals.js";
export interface RankedCandidate {
  candidate: SearchCandidate;
  score: number;
  signals: string[];
  rating: number | null;
  distanceKm: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  expertiseByStaff: Record<string, number | null>;
}
export interface RankingEngine {
  rank(
    candidates: SearchCandidate[],
    query: DiscoverySearchQuery,
  ): RankedCandidate[];
}
@Injectable()
export class RankingService implements RankingEngine {
  constructor(
    private readonly geo: GeoService = new GeoService(),
    private readonly expertise: HistoricalExpertiseProvider = new HistoricalExpertiseProvider(),
  ) {}
  rank(cs: SearchCandidate[], q: DiscoverySearchQuery) {
    const ranked = cs
      .map((c) => this.score(c, q))
      .filter(
        (x) =>
          (q.minRating === undefined ||
            (x.rating !== null && x.rating >= q.minRating!)) &&
          (q.radiusKm === undefined ||
            (x.distanceKm !== null && x.distanceKm <= q.radiusKm!)),
      );
    return ranked.sort((a, b) => this.compare(a, b, q.sort ?? "RELEVANCE"));
  }
  private score(c: SearchCandidate, q: DiscoverySearchQuery): RankedCandidate {
    const weighted = [textSignal(c, q), ...matchSignals(c, q)].filter(
      (signal): signal is { name: string; score: number } => signal !== null,
    );
    if (
      q.city &&
      normalizeSearchText(c.city ?? undefined) === normalizeSearchText(q.city)
    ) {
      weighted.push({ name: "city", score: 8 });
    }
    if (
      q.district &&
      normalizeSearchText(c.district ?? undefined) ===
        normalizeSearchText(q.district)
    ) {
      weighted.push({ name: "district", score: 7 });
    }
    const rating = c.ratings.length
      ? c.ratings.reduce((a, b) => a + b, 0) / c.ratings.length
      : null;
    weighted.push(...qualitySignals(c, rating));
    const compatiblePrice = priceSignal(c, q);
    if (compatiblePrice) weighted.push(compatiblePrice);
    const expertiseByStaff = Object.fromEntries(
      c.staff.map((staff) => [
        staff.id,
        this.expertise.score({
          completedAppointments: staff.completedAppointments,
          serviceMatched:
            !q.serviceId || staff.serviceIds.includes(q.serviceId),
        }),
      ]),
    );
    const expertiseScore = Math.max(
      0,
      ...Object.values(expertiseByStaff).filter(
        (value): value is number => value !== null,
      ),
    );
    if (expertiseScore)
      weighted.push({ name: "expertise", score: expertiseScore });
    const distanceKm = this.geo.candidateDistance(c, q);
    if (distanceKm !== null)
      weighted.push({ name: "geo", score: Math.max(0, 10 - distanceKm / 10) });
    const score = weighted.reduce((total, signal) => total + signal.score, 0);
    const prices = c.services.map((x) => Number(x.price));
    return {
      candidate: c,
      score: Number(score.toFixed(6)),
      signals: weighted.map((signal) => signal.name),
      rating: rating === null ? null : Number(rating.toFixed(2)),
      distanceKm,
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      expertiseByStaff,
    };
  }
  private compare(a: RankedCandidate, b: RankedCandidate, sort: SearchSort) {
    let delta: number;
    if (sort === "RATING") delta = (b.rating ?? -1) - (a.rating ?? -1);
    else if (sort === "PRICE_ASC")
      delta = (a.minPrice ?? Infinity) - (b.minPrice ?? Infinity);
    else if (sort === "PRICE_DESC")
      delta = (b.maxPrice ?? -1) - (a.maxPrice ?? -1);
    else if (sort === "DISTANCE")
      delta = (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
    else delta = b.score - a.score;
    return (
      delta || b.score - a.score || a.candidate.id.localeCompare(b.candidate.id)
    );
  }
}
