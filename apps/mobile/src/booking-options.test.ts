import { describe, expect, it } from "vitest";
import type { MvpCatalog } from "@beauty-platform/types";
import {
  hasUnknownStaffLocations,
  locationLabel,
  staffForBooking,
} from "../booking-options";

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
  it("does not invent branch eligibility when a catalogue omits staff locations", () => {
    const legacy = {
      ...catalog,
      staff: catalog.staff.map((staff) => ({
        id: staff.id,
        displayName: staff.displayName,
        services: staff.services,
      })),
    };
    expect(staffForBooking(legacy, "hair", "branch-first")).toEqual([]);
    expect(staffForBooking(legacy, "hair", "branch-second")).toEqual([]);
    expect(hasUnknownStaffLocations(legacy, "hair")).toBe(true);
  });
  it("keeps confirmed professionals usable while excluding unknown branch assignments", () => {
    const mixed = {
      ...catalog,
      staff: [
        catalog.staff[0]!,
        {
          id: "legacy",
          displayName: "Legacy",
          services: [{ serviceId: "hair" }],
        },
      ],
    };
    expect(staffForBooking(mixed, "hair", "branch-first")).toEqual([]);
    expect(
      staffForBooking(mixed, "hair", "branch-second").map((staff) => staff.id),
    ).toEqual(["assigned"]);
  });
  it("distinguishes known empty assignments and unrelated services from unknown location data", () => {
    expect(hasUnknownStaffLocations(catalog, "hair")).toBe(false);
    const unrelated = {
      ...catalog,
      staff: [
        {
          id: "other",
          displayName: "Other",
          services: [{ serviceId: "nails" }],
        },
      ],
    };
    expect(hasUnknownStaffLocations(unrelated, "hair")).toBe(false);
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

