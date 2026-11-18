import {
  parsePublishedShareService,
  type OrzellShareTarget,
} from "@beauty-platform/types";

export interface SharedBookingReceipt {
  id: string;
  businessId: string;
  serviceId: string;
  professionalId: string;
  locationId: string;
  startsAt: string;
  endsAt: string;
  price: string;
  currency: string;
  status: string;
}
const id = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);
const instant = (value: unknown): value is string =>
  typeof value === "string" &&
  /(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
  Number.isFinite(Date.parse(value));
export function parseSharedQuote(
  value: unknown,
  target: OrzellShareTarget & { professionalId: string },
) {
  if (
    !value ||
    typeof value !== "object" ||
    !("published" in value) ||
    !("slots" in value)
  )
    return null;
  const published = parsePublishedShareService(value.published, target);
  if (!published || !Array.isArray(value.slots) || value.slots.length > 1500)
    return null;
  const seen = new Set<string>();
  const slots: Array<{ startsAt: string; endsAt: string; staffId: string }> =
    [];
  const staff = published.professionals[0]!;
  for (const slot of value.slots) {
    if (
      !slot ||
      typeof slot !== "object" ||
      slot.staffId !== target.professionalId ||
      !instant(slot.startsAt) ||
      !instant(slot.endsAt) ||
      Date.parse(slot.endsAt) <= Date.parse(slot.startsAt) ||
      Date.parse(slot.endsAt) - Date.parse(slot.startsAt) !==
        staff.durationMinutes * 60_000 ||
      seen.has(slot.startsAt)
    )
      return null;
    seen.add(slot.startsAt);
    slots.push({
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      staffId: slot.staffId,
    });
  }
  return { published, slots };
}
export function sameSharedPrice(left: string, right: string) {
  const minor = (value: string) => {
    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) return null;
    const [whole = "0", fraction = ""] = value.split(".");
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  };
  const a = minor(left),
    b = minor(right);
  return a !== null && b !== null && a === b;
}
export function parseSharedReceipt(
  value: unknown,
  target: OrzellShareTarget,
): SharedBookingReceipt | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<SharedBookingReceipt>;
  if (
    !id(row.id) ||
    row.businessId !== target.businessId ||
    row.serviceId !== target.serviceId ||
    !id(row.professionalId) ||
    (target.professionalId && row.professionalId !== target.professionalId) ||
    !id(row.locationId) ||
    !instant(row.startsAt) ||
    !instant(row.endsAt) ||
    Date.parse(row.endsAt) <= Date.parse(row.startsAt) ||
    typeof row.price !== "string" ||
    !/^\d{1,10}(?:\.\d{1,2})?$/.test(row.price) ||
    typeof row.currency !== "string" ||
    !/^[A-Z]{3}$/.test(row.currency) ||
    ![
      "PENDING",
      "CONFIRMED",
      "CHECKED_IN",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED",
      "NO_SHOW",
    ].includes(row.status ?? "")
  )
    return null;
  return row as SharedBookingReceipt;
}
