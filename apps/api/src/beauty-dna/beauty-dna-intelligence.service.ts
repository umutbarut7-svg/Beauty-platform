import { Injectable } from "@nestjs/common";
import type { ResolvedTrait, TraitEvidenceInput } from "./beauty-dna.types.js";
@Injectable()
export class BeautyDNAIntelligenceService {
  normalize(value: string) {
    return value
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("tr-TR");
  }
  freshness(occurredAt: Date, now = new Date(), halfLifeDays = 365) {
    const age = Math.max(
      0,
      (now.getTime() - occurredAt.getTime()) / 86_400_000,
    );
    return Number(Math.pow(0.5, age / halfLifeDays).toFixed(4));
  }
  resolve(items: TraitEvidenceInput[], now = new Date()): ResolvedTrait | null {
    if (!items.length) return null;
    const groups = new Map<
      string,
      { raw: string; score: number; count: number; latest: number }
    >();
    for (const item of items) {
      const normalized = this.normalize(item.value),
        freshness = this.freshness(item.occurredAt, now);
      const previous = groups.get(normalized) ?? {
        raw: item.value,
        score: 0,
        count: 0,
        latest: 0,
      };
      previous.score += Math.max(0, Math.min(1, item.reliability)) * freshness;
      previous.count += 1;
      previous.latest = Math.max(previous.latest, item.occurredAt.getTime());
      groups.set(normalized, previous);
    }
    const ranked = [...groups.entries()].sort(
      (a, b) =>
        b[1].score - a[1].score ||
        b[1].latest - a[1].latest ||
        a[0].localeCompare(b[0]),
    );
    const [normalizedValue, winner] = ranked[0]!;
    const total = ranked.reduce((sum, x) => sum + x[1].score, 0);
    const conflict = ranked.length > 1;
    const quantity = Math.min(1, items.length / 4);
    const agreement = total ? winner.score / total : 0;
    const freshness = this.freshness(new Date(winner.latest), now);
    const confidence = Number(
      Math.max(
        0,
        Math.min(
          1,
          quantity * 0.35 +
            agreement * quantity * 0.4 +
            freshness * 0.25 -
            (conflict ? 0.1 : 0),
        ),
      ).toFixed(4),
    );
    return {
      value: winner.raw,
      normalizedValue,
      confidence,
      freshness,
      conflict,
      evidenceCount: items.length,
    };
  }
}
