import type { DiscoverySearchQuery } from "@beauty-platform/types";
import type { SearchCandidate } from "./search-provider.js";
import { normalizeSearchText } from "./search-normalization.js";

export interface RankingSignal {
  name: string;
  score: number;
}

export function textSignal(
  candidate: SearchCandidate,
  query: DiscoverySearchQuery,
): RankingSignal | null {
  const text = normalizeSearchText(query.query);
  if (!text) return null;
  const fields = [
    normalizeSearchText(candidate.name),
    normalizeSearchText(candidate.description ?? undefined),
    ...candidate.categories.map((item) => normalizeSearchText(item.name)),
    ...candidate.services.map((item) => normalizeSearchText(item.name)),
    ...candidate.staff.map((item) => normalizeSearchText(item.displayName)),
    ...candidate.locations.map((item) => normalizeSearchText(item.name)),
  ];
  const matches = fields.filter((field) => field?.includes(text)).length;
  return matches
    ? { name: "text", score: Math.min(50, 25 + matches * 5) }
    : null;
}

export function matchSignals(
  candidate: SearchCandidate,
  query: DiscoverySearchQuery,
): RankingSignal[] {
  const signals: RankingSignal[] = [];
  if (
    (query.categoryId &&
      candidate.categories.some((item) => item.id === query.categoryId)) ||
    (query.category &&
      candidate.categories.some((item) =>
        normalizeSearchText(item.name)?.includes(
          normalizeSearchText(query.category)!,
        ),
      ))
  )
    signals.push({ name: "category", score: 15 });
  if (
    (query.serviceId &&
      candidate.services.some((item) => item.id === query.serviceId)) ||
    (query.service &&
      candidate.services.some((item) =>
        normalizeSearchText(item.name)?.includes(
          normalizeSearchText(query.service)!,
        ),
      ))
  )
    signals.push({ name: "service", score: 15 });
  if (query.professionalId || query.professional)
    signals.push({ name: "professional", score: 10 });
  return signals;
}

export function qualitySignals(
  candidate: SearchCandidate,
  rating: number | null,
): RankingSignal[] {
  const signals: RankingSignal[] = [];
  if (rating !== null) signals.push({ name: "rating", score: rating * 3 });
  if (candidate.isVerified) signals.push({ name: "verified", score: 5 });
  if (candidate.nextAvailabilityAt)
    signals.push({ name: "availability", score: 10 });
  const completeness =
    [
      candidate.description,
      candidate.logoUrl,
      candidate.city,
      candidate.services.length,
      candidate.staff.length,
    ].filter(Boolean).length / 5;
  if (completeness > 0)
    signals.push({ name: "profile", score: completeness * 5 });
  return signals;
}

export function priceSignal(
  candidate: SearchCandidate,
  query: DiscoverySearchQuery,
): RankingSignal | null {
  if (query.minPrice === undefined && query.maxPrice === undefined) return null;
  return candidate.services.length ? { name: "price", score: 5 } : null;
}
