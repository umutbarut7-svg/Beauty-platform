import { describe, expect, it } from "vitest";
import type { MvpCatalog } from "@beauty-platform/types";
import { locationLabel, staffForBooking } from "../booking-options";

const catalog: MvpCatalog = {
  id: "business",
  name: "Salon",
  isVerified: false,
  services: [],
  locations: [
    { id: "branch-first", name: "Küçükyalı" },
    { id: "branch-second", name: "Küçükyalı" },
  ],
  staff: [
    {
      id: "assigned",
      displayName: "Umut",
      services: [{ serviceId: "hair" }],
      locations: [{ locationId: "branch-second" }],
    },
    {
      id: "other-service",
      displayName: "Other",
      services: [{ serviceId: "nails" }],
      locations: [{ locationId: "branch-first" }],
    },
    {
      id: "unassigned",
      displayName: "Unassigned",
      services: [{ serviceId: "hair" }],
      locations: [],
    },
  ],
};

describe("booking branch and service eligibility", () => {
  it("does not offer a professional assigned only to the other identically named branch", () => {
    expect(staffForBooking(catalog, "hair", "branch-first")).toEqual([]);
    expect(
      staffForBooking(catalog, "hair", "branch-second").map(
        (staff) => staff.id,
      ),
    ).toEqual(["assigned"]);
  });
  it("keeps older catalogue responses usable without treating missing assignments as empty", () => {
    const legacy = {
      ...catalog,
      staff: catalog.staff.map(({ locations: _locations, ...staff }) => staff),
    };
    expect(
      staffForBooking(legacy, "hair", "branch-first").map((staff) => staff.id),
    ).toEqual(["assigned", "unassigned"]);
  });
  it("distinguishes duplicate branch names without changing their identifiers", () => {
    const labels = catalog.locations.map((location) =>
      locationLabel(location, catalog.locations),
    );
    expect(new Set(labels).size).toBe(2);
    expect(labels.every((label) => label.startsWith("Küçükyalı · "))).toBe(
      true,
    );
    expect(locationLabel(catalog.locations[0]!, [catalog.locations[0]!])).toBe(
      "Küçükyalı",
    );
  });
});
