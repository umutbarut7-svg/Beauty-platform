import { Injectable } from "@nestjs/common";
import type {
  AppointmentSignal,
  PredictionFeatures,
} from "./prediction.types.js";
const mode = <T extends string | number>(values: T[]) => {
  if (!values.length) return null;
  const counts = new Map<T, number>();
  values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  return [...counts].sort(
    ([a, ca], [b, cb]) => cb - ca || String(a).localeCompare(String(b)),
  )[0]![0];
};
@Injectable()
export class FeatureExtractionService {
  extract(items: AppointmentSignal[], now = new Date()): PredictionFeatures {
    const ordered = [...items].sort(
      (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
    );
    const completed = ordered.filter((x) => x.status === "COMPLETED");
    const intervals = completed
      .slice(1)
      .map(
        (x, i) =>
          (x.startsAt.getTime() - completed[i]!.startsAt.getTime()) /
          86_400_000,
      );
    const average = intervals.length
      ? intervals.reduce((a, b) => a + b, 0) / intervals.length
      : null;
    const variance =
      average === null || !intervals.length
        ? null
        : intervals.reduce((sum, x) => sum + (x - average) ** 2, 0) /
          intervals.length;
    const service = mode(completed.map((x) => x.serviceId)),
      staff = mode(completed.flatMap((x) => (x.staffId ? [x.staffId] : [])));
    const cancelled = ordered.filter(
      (x) => x.status === "CANCELLED" || x.status === "NO_SHOW",
    ).length;
    return {
      completedCount: completed.length,
      totalCount: ordered.length,
      daysSinceLastService: completed.length
        ? Math.max(
            0,
            Math.floor(
              (now.getTime() - completed.at(-1)!.startsAt.getTime()) /
                86_400_000,
            ),
          )
        : null,
      averageRebookingIntervalDays:
        average === null ? null : Number(average.toFixed(1)),
      bookingFrequencyPer90Days: Number(
        completed
          .filter(
            (x) => now.getTime() - x.startsAt.getTime() <= 90 * 86_400_000,
          )
          .length.toFixed(2),
      ),
      cancellationRate: ordered.length
        ? Number((cancelled / ordered.length).toFixed(4))
        : 0,
      preferredWeekday: mode(completed.map((x) => x.startsAt.getUTCDay())),
      preferredHour: mode(completed.map((x) => x.startsAt.getUTCHours())),
      serviceAffinity: service
        ? {
            id: service,
            ratio: Number(
              (
                completed.filter((x) => x.serviceId === service).length /
                completed.length
              ).toFixed(4),
            ),
          }
        : null,
      professionalAffinity: staff
        ? {
            id: staff,
            ratio: Number(
              (
                completed.filter((x) => x.staffId === staff).length /
                completed.length
              ).toFixed(4),
            ),
          }
        : null,
      averagePrice: completed.length
        ? Number(
            (
              completed.reduce((s, x) => s + x.price, 0) / completed.length
            ).toFixed(2),
          )
        : null,
      consistency:
        variance === null || average === null
          ? 0
          : Number(
              Math.max(
                0,
                1 - Math.sqrt(variance) / Math.max(average, 1),
              ).toFixed(4),
            ),
    };
  }
}
