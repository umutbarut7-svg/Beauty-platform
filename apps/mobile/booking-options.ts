import type { MvpCatalog } from "@beauty-platform/types";

export function staffForBooking(
  catalog: MvpCatalog,
  serviceId: string,
  locationId: string,
) {
  return catalog.staff.filter(
    (staff) =>
      staff.services.some((service) => service.serviceId === serviceId) &&
      (!locationId ||
        (Array.isArray(staff.locations) &&
          staff.locations.some(
            (location) => location.locationId === locationId,
          ))),
  );
}

export function hasUnknownStaffLocations(catalog: MvpCatalog, serviceId: string) {
  return catalog.staff.some(
    (staff) =>
      staff.services.some((service) => service.serviceId === serviceId) &&
      !Array.isArray(staff.locations),
  );
}

export function locationLabel(
  location: MvpCatalog["locations"][number],
  locations: MvpCatalog["locations"],
) {
  const duplicates = locations.filter(
    (item) =>
      item.name.trim().toLocaleLowerCase("tr") ===
      location.name.trim().toLocaleLowerCase("tr"),
  );
  if (duplicates.length < 2) return location.name;
  let length = 6;
  while (
    length < location.id.length &&
    duplicates.some(
      (item) =>
        item.id !== location.id &&
        item.id.slice(-length) === location.id.slice(-length),
    )
  )
    length++;
  return `${location.name} · ${location.id.slice(-length)}`;
}

