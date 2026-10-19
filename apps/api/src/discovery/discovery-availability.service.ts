/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Injectable } from "@nestjs/common";
import type { DiscoverySearchQuery } from "@beauty-platform/types";
import { AvailabilityService } from "../appointments/availability.service.js";
import type { SearchCandidate } from "./search-provider.js";

@Injectable()
export class DiscoveryAvailabilityService {
  constructor(private readonly availability: AvailabilityService) {}
  async resolve(
    candidates: SearchCandidate[],
    query: DiscoverySearchQuery,
  ): Promise<SearchCandidate[]> {
    if (!query.availableFrom || !query.availableTo || !query.serviceId)
      return candidates;
    const result: SearchCandidate[] = [];
    for (let index = 0; index < candidates.length; index += 10) {
      const batch = candidates.slice(index, index + 10);
      const resolved = await Promise.all(
        batch.map(async (candidate) => {
          try {
            const slots = await this.availability.calculate({
              businessId: candidate.id,
              serviceId: query.serviceId!,
              staffMemberId: query.professionalId,
              locationId: query.locationId,
              date: query.availableFrom!.slice(0, 10),
            });
            const from = new Date(query.availableFrom!).getTime();
            const to = new Date(query.availableTo!).getTime();
            const matching = slots.filter(
              (slot) =>
                new Date(slot.startsAt).getTime() >= from &&
                new Date(slot.endsAt).getTime() <= to,
            );
            if (!matching.length) return null;
            return {
              ...candidate,
              nextAvailabilityAt: matching[0]!.startsAt,
              availableStaffIds: [
                ...new Set(
                  matching
                    .map((slot) => slot.staffId)
                    .filter((id): id is string => Boolean(id)),
                ),
              ],
            };
          } catch {
            return null;
          }
        }),
      );
      for (const item of resolved) if (item !== null) result.push(item);
    }
    return result;
  }
}
