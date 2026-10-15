/* eslint-disable @typescript-eslint/no-explicit-any */
import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { AvailabilityService } from "./availability.service.js";

function database(
  options: {
    inactive?: boolean;
    assigned?: boolean;
    businessOpen?: boolean;
    invalidLocation?: boolean;
    inactiveStaff?: boolean;
  } = {},
) {
  const appointments = [
    {
      startsAt: new Date("2030-01-07T14:00:00.000Z"),
      endsAt: new Date("2030-01-07T15:00:00.000Z"),
      status: "CONFIRMED",
      service: { bufferBeforeMinutes: 0, bufferAfterMinutes: 0 },
    },
    {
      startsAt: new Date("2030-01-07T09:00:00.000Z"),
      endsAt: new Date("2030-01-07T10:00:00.000Z"),
      status: "CANCELLED",
      service: { bufferBeforeMinutes: 0, bufferAfterMinutes: 0 },
    },
  ];
  return {
    business: {
      findUnique: async () => ({
        timezone: "UTC",
        status: "ACTIVE",
        settings: { bookingEnabled: true, appointmentIntervalMinutes: 30 },
      }),
    },
    service: {
      findFirst: async () =>
        options.inactive
          ? null
          : {
              id: "service",
              durationMinutes: 60,
              bufferBeforeMinutes: 15,
              bufferAfterMinutes: 15,
            },
    },
    staffService: {
      findFirst: async () =>
        options.assigned === false ? null : { customDurationMinutes: null },
    },
    staffProfileService: {
      findFirst: async () =>
        options.assigned === false ? null : { customDurationMinutes: null },
    },
    businessMember: {
      findFirst: async () => ({ id: "member", userId: "staff-user" }),
    },
    location: {
      findFirst: async () =>
        options.invalidLocation ? null : { id: "location" },
    },
    staff: {
      findFirst: async ({ where }: any) =>
        where.id === "member" || options.inactiveStaff
          ? null
          : { id: "profile", userId: "staff-user" },
      findMany: async () => [{ id: "profile" }],
    },
    workingHour: {
      findMany: async () =>
        options.businessOpen === false
          ? []
          : [{ openTime: "09:00", closeTime: "18:00" }],
    },
    staffWorkingHour: {
      findMany: async () => [
        { startTime: "09:00", endTime: "12:00" },
        { startTime: "13:00", endTime: "17:00" },
      ],
    },
    staffTimeOff: {
      findMany: async () => [
        {
          startsAt: new Date("2030-01-07T10:45:00.000Z"),
          endsAt: new Date("2030-01-07T11:30:00.000Z"),
        },
      ],
    },
    appointment: {
      findMany: async ({ where }: any) =>
        appointments.filter((a) => where.status.in.includes(a.status)),
    },
  } as any;
}

describe("AvailabilityService", () => {
  const request = {
    businessId: "business",
    serviceId: "service",
    staffMemberId: "member",
    date: "2030-01-07",
  };
  it("intersects business/staff hours, multiple intervals, time-off, buffers and active appointments", async () => {
    const service = new AvailabilityService(database());
    const slots = await service.calculate(
      request,
      database(),
      DateTime.fromISO("2030-01-01T00:00:00Z"),
    );
    expect(slots.map((slot) => slot.startsAt)).toContain(
      "2030-01-07T09:30:00.000Z",
    );
    expect(slots.map((slot) => slot.startsAt)).not.toContain(
      "2030-01-07T10:30:00.000Z",
    );
    expect(slots.map((slot) => slot.startsAt)).not.toContain(
      "2030-01-07T14:00:00.000Z",
    );
    expect(slots.map((slot) => slot.startsAt)).toContain(
      "2030-01-07T15:30:00.000Z",
    );
  });
  it("treats cancelled appointments as free slots", async () => {
    const db = database();
    const slots = await new AvailabilityService(db).calculate(
      request,
      db,
      DateTime.fromISO("2030-01-01T00:00:00Z"),
    );
    expect(slots.map((slot) => slot.startsAt)).toContain(
      "2030-01-07T09:30:00.000Z",
    );
  });
  it("returns no slots while the business is closed", async () => {
    const db = database({ businessOpen: false });
    await expect(
      new AvailabilityService(db).calculate(
        request,
        db,
        DateTime.fromISO("2030-01-01T00:00:00Z"),
      ),
    ).resolves.toEqual([]);
  });
  it("returns staff-qualified slots when no staff is specified", async () => {
    const db = database();
    const slots = await new AvailabilityService(db).calculate(
      { ...request, staffMemberId: undefined },
      db,
      DateTime.fromISO("2030-01-01T00:00:00Z"),
    );
    expect(slots).not.toHaveLength(0);
    expect(slots.every((slot) => slot.staffId === "profile")).toBe(true);
  });
  it("rejects inactive services and missing staff assignments", async () => {
    const inactive = database({ inactive: true });
    await expect(
      new AvailabilityService(inactive).calculate(request, inactive),
    ).rejects.toThrow("Bookable service not found");
    const unassigned = database({ assigned: false });
    await expect(
      new AvailabilityService(unassigned).calculate(request, unassigned),
    ).rejects.toThrow("not assigned");
  });
  it("rejects cross-tenant locations and inactive/unassigned location staff", async () => {
    const invalidLocation = database({ invalidLocation: true });
    await expect(
      new AvailabilityService(invalidLocation).calculate(
        { ...request, locationId: "foreign-location" },
        invalidLocation,
      ),
    ).rejects.toThrow("Active location not found");
    const inactiveStaff = database({ inactiveStaff: true });
    await expect(
      new AvailabilityService(inactiveStaff).calculate(
        { ...request, locationId: "location" },
        inactiveStaff,
      ),
    ).rejects.toThrow("Active bookable staff member not found");
  });
  it("handles a DST jump using the business timezone without emitting nonexistent local times", async () => {
    const db = database();
    db.business.findUnique = async () => ({
      timezone: "America/New_York",
      status: "ACTIVE",
      settings: { bookingEnabled: true, appointmentIntervalMinutes: 30 },
    });
    db.workingHour.findMany = async () => [
      { openTime: "01:00", closeTime: "04:00" },
    ];
    db.staffWorkingHour.findMany = async () => [
      { startTime: "01:00", endTime: "04:00" },
    ];
    db.staffTimeOff.findMany = async () => [];
    db.appointment.findMany = async () => [];
    const slots = await new AvailabilityService(db).calculate(
      { ...request, date: "2030-03-10" },
      db,
      DateTime.fromISO("2030-01-01T00:00:00Z"),
    );
    expect(
      slots.every(
        (slot) =>
          DateTime.fromISO(slot.startsAt).setZone("America/New_York").hour !==
          2,
      ),
    ).toBe(true);
  });
});
