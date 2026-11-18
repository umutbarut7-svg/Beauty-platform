import type { OrzellShareTarget } from "./everywhere-link.js";

export interface PublishedShareService {
  business: { id: string; name: string; timezone: string };
  locations: Array<{ id: string; name: string }>;
  service: {
    id: string;
    name: string;
    price: string;
    currency: string;
    durationMinutes: number;
  };
  professionals: Array<{
    id: string;
    displayName: string;
    price: string;
    durationMinutes: number;
  }>;
}

/** Validate the public wire response before displaying a targeted service. */
export function parsePublishedShareService(
  value: unknown,
  target: OrzellShareTarget,
): PublishedShareService | null {
  if (!value || typeof value !== "object" || target.resultId) return null;
  const row = value as Partial<PublishedShareService>;
  const text = (v: unknown): v is string =>
    typeof v === "string" && v.trim().length > 0 && v.length <= 500;
  const price = (v: unknown) =>
    typeof v === "string" && /^\d{1,10}(?:\.\d{1,2})?$/.test(v);
  const duration = (v: unknown) =>
    typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 1440;
  if (
    row.business?.id !== target.businessId ||
    !text(row.business.name) ||
    !text(row.business.timezone) ||
    row.service?.id !== target.serviceId ||
    !text(row.service.name) ||
    !price(row.service.price) ||
    !/^[A-Z]{3}$/.test(row.service.currency ?? "") ||
    !duration(row.service.durationMinutes) ||
    !Array.isArray(row.locations) ||
    row.locations.length > 500 ||
    !Array.isArray(row.professionals) ||
    row.professionals.length > 500
  )
    return null;
  try {
    new Intl.DateTimeFormat("tr-TR", { timeZone: row.business.timezone });
  } catch {
    return null;
  }
  const ids = new Set<string>();
  const locationIds = new Set<string>();
  for (const location of row.locations) {
    if (
      !location ||
      typeof location.id !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(location.id) ||
      !text(location.name) ||
      locationIds.has(location.id)
    )
      return null;
    locationIds.add(location.id);
  }
  for (const staff of row.professionals) {
    if (
      !staff ||
      typeof staff.id !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(staff.id) ||
      !text(staff.displayName) ||
      !price(staff.price) ||
      !duration(staff.durationMinutes) ||
      ids.has(staff.id)
    )
      return null;
    ids.add(staff.id);
  }
  if (
    target.professionalId &&
    (ids.size !== 1 || !ids.has(target.professionalId))
  )
    return null;
  return value as PublishedShareService;
}
