import { Injectable } from "@nestjs/common";
import type { DiscoverySearchQuery } from "@beauty-platform/types";
import type { SearchCandidate } from "./search-provider.js";

export interface Coordinates {
  latitude: number;
  longitude: number;
}

@Injectable()
export class GeoService {
  distanceKm(left: Coordinates, right: Coordinates) {
    const rad = (value: number) => (value * Math.PI) / 180;
    const dLat = rad(right.latitude - left.latitude);
    const dLon = rad(right.longitude - left.longitude);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(left.latitude)) *
        Math.cos(rad(right.latitude)) *
        Math.sin(dLon / 2) ** 2;
    return Number(
      (6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(3),
    );
  }
  candidateDistance(candidate: SearchCandidate, query: DiscoverySearchQuery) {
    if (query.latitude === undefined || query.longitude === undefined)
      return null;
    const origin = { latitude: query.latitude, longitude: query.longitude };
    const points = [
      ...(candidate.latitude !== null && candidate.longitude !== null
        ? [{ latitude: candidate.latitude, longitude: candidate.longitude }]
        : []),
      ...candidate.locations.flatMap((location) =>
        location.latitude !== null && location.longitude !== null
          ? [{ latitude: location.latitude, longitude: location.longitude }]
          : [],
      ),
    ];
    if (!points.length) return null;
    return Math.min(...points.map((point) => this.distanceKm(origin, point)));
  }
}
