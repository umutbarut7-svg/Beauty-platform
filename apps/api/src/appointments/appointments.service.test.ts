/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { AppointmentsService } from "./appointments.service.js";

const customerUser = {
  id: "customer-user",
  email: "customer@test.invalid",
  role: "CUSTOMER" as const,
};
const staffUser = {
  id: "staff-user",
  email: "staff@test.invalid",
  role: "STAFF" as const,
};
const owner = {
  id: "owner-user",
  email: "owner@test.invalid",
  role: "BUSINESS_OWNER" as const,
};

function fixture(
  options: {
    overlap?: boolean;
    unavailable?: boolean;
    ownerCustomer?: boolean;
  } = {},
) {
  let listWhere: any;
  const history: any[] = [];
  const appointment = {
    id: "appointment",
    businessId: "business",
    customerId: "customer",
    staffMemberId: "staff-member",
    serviceId: "service",
    locationId: "location",
    startsAt: new Date(Date.now() + 86400000),
    endsAt: new Date(Date.now() + 90000000),
    status: "CONFIRMED",
  };
  const prisma: any = {
    businessMember: {
      findUnique: async ({ where }: any) => {
        const id = where.userId_businessId.userId;
        if (id === "owner-user")
          return { id: "owner-member", role: "BUSINESS_OWNER" };
        if (id === "staff-user") return { id: "staff-member", role: "STAFF" };
        return null;
      },
      findFirst: async ({ where }: any) =>
        where.id === "staff-member" && where.businessId === "business"
          ? { id: "staff-member" }
          : null,
    },
    customer: {
      findUnique: async ({ where }: any) =>
        options.ownerCustomer &&
        (where.userId === "owner-user" || where.id === "owner-customer")
          ? { id: "owner-customer" }
          : where.userId === "customer-user" || where.id === "customer"
            ? { id: "customer" }
            : null,
    },
    businessCustomer: {
      findFirst: async () => null,
      create: async ({ data }: any) => ({ id: "business-customer", ...data }),
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
    },
    appointment: {
      findMany: async ({ where }: any) => {
        listWhere = where;
        return [];
      },
      findFirst: async ({ where }: any) =>
        where.id === "appointment" &&
        where.businessId === "business" &&
        (where.customerId === undefined ||
          where.customerId === appointment.customerId) &&
        (where.staffMemberId === undefined ||
          where.staffMemberId === appointment.staffMemberId)
          ? appointment
          : null,
      update: async ({ data }: any) => ({ ...appointment, ...data }),
      create: async ({ data }: any) => {
        if (options.overlap)
          throw {
            code: "P2004",
            meta: { database_error: "23P01 Appointment_no_staff_overlap" },
          };
        return { id: "created", ...data };
      },
    },
    business: { findUnique: async () => ({ timezone: "UTC" }) },
    staffService: {
      findFirst: async () => ({
        customPrice: "80.00",
        service: { price: "100.00", currency: "TRY" },
      }),
    },
    staffProfileService: { findFirst: async () => null },
    staff: {
      findFirst: async () => ({ id: "staff-profile", userId: "staff-user" }),
    },
    businessSettings: {
      findUnique: async () => ({
        cancellationEnabled: true,
        cancellationWindowMinutes: 60,
      }),
    },
    appointmentStatusHistory: {
      create: async ({ data }: any) => {
        history.push(data);
        return data;
      },
      findMany: async ({ where }: any) =>
        history.filter(
          (item) =>
            item.businessId === where.businessId &&
            item.appointmentId === where.appointmentId,
        ),
    },
    staffWorkingHour: {
      deleteMany: async () => ({}),
      createMany: async () => ({}),
      findMany: async () => [],
    },
    staffTimeOff: {
      findFirst: async () => null,
      create: async ({ data }: any) => ({ id: "time-off", ...data }),
      findMany: async () => [],
      update: async ({ data }: any) => ({ id: "time-off", ...data }),
      delete: async () => ({}),
    },
    $queryRawUnsafe: async () => [],
    $transaction: async (callback: any) => callback(prisma),
  };
  const permissions: any = { assertBusinessAccess: async () => undefined };
  const availability: any = {
    calculate: async () =>
      options.unavailable
        ? []
        : [
            {
              startsAt: "2030-01-07T10:00:00.000Z",
              endsAt: "2030-01-07T10:30:00.000Z",
              staffId: "staff-profile",
            },
          ],
  };
  return {
    service: new AppointmentsService(prisma, permissions, availability),
    getListWhere: () => listWhere,
    appointment,
    history,
  };
}

describe("AppointmentsService", () => {
  it("scopes customer and staff appointment lists to ownership", async () => {
    const customerFixture = fixture();
    await customerFixture.service.list(customerUser, "business");
    expect(customerFixture.getListWhere()).toMatchObject({
      customerId: "customer",
    });
    const staffFixture = fixture();
    await staffFixture.service.list(staffUser, "business");
    expect(staffFixture.getListWhere()).toMatchObject({
      staffMemberId: "staff-member",
    });
  });
  it("creates a customer-owned appointment using assignment pricing", async () => {
    const { service } = fixture();
    await expect(
      service.create(customerUser, "business", {
        serviceId: "service",
        locationId: "location",
        staffMemberId: "staff-member",
        startsAt: "2030-01-07T10:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      customerId: "customer",
      locationId: "location",
      price: "80.00",
      currency: "TRY",
      status: "PENDING",
    });
  });
  it("prevents customers from spoofing another customer", async () => {
    await expect(
      fixture().service.create(customerUser, "business", {
        customerId: "other",
        serviceId: "service",
        locationId: "location",
        staffMemberId: "staff-member",
        startsAt: "2030-01-07T10:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it("creates and links a normalized tenant CRM profile during booking", async () => {
    await expect(
      fixture().service.create(customerUser, "business", {
        serviceId: "service",
        locationId: "location",
        staffMemberId: "staff-member",
        startsAt: "2030-01-07T10:00:00.000Z",
        customerProfile: {
          firstName: "Ada",
          lastName: "Lovelace",
          phone: "+90 (555) 111-2233",
          email: "ADA@EXAMPLE.TEST",
        },
      }),
    ).resolves.toMatchObject({ businessCustomerId: "business-customer" });
  });
  it("prevents customers and staff from reading appointments they do not own", async () => {
    const customerFixture = fixture();
    customerFixture.appointment.customerId = "other-customer";
    await expect(
      customerFixture.service.get(customerUser, "business", "appointment"),
    ).rejects.toThrow("Appointment not found");
    const staffFixture = fixture();
    staffFixture.appointment.staffMemberId = "other-member";
    await expect(
      staffFixture.service.get(staffUser, "business", "appointment"),
    ).rejects.toThrow("Appointment not found");
  });
  it("rejects invalid status transitions", async () => {
    const { service, appointment, history } = fixture();
    appointment.status = "COMPLETED";
    await expect(
      service.update(owner, "business", "appointment", { status: "CONFIRMED" }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(history).toEqual([]);
  });
  it("allows a manager to apply a valid status transition", async () => {
    const current = fixture();
    current.appointment.status = "CHECKED_IN";
    await expect(
      current.service.update(owner, "business", "appointment", {
        status: "IN_PROGRESS",
      }),
    ).resolves.toMatchObject({
      status: "IN_PROGRESS",
      serviceStartedAt: expect.any(Date),
    });
    expect(current.history).toMatchObject([
      { fromStatus: "CHECKED_IN", toStatus: "IN_PROGRESS" },
    ]);
  });
  it("reschedules atomically and refreshes the service snapshot", async () => {
    await expect(
      fixture().service.update(owner, "business", "appointment", {
        locationId: "location",
        staffMemberId: "staff-member",
        serviceId: "service",
        startsAt: "2030-01-07T10:00:00.000Z",
        customerNote: "New time",
      }),
    ).resolves.toMatchObject({
      startsAt: new Date("2030-01-07T10:00:00.000Z"),
      endsAt: new Date("2030-01-07T10:30:00.000Z"),
      price: "80.00",
      customerNote: "New time",
    });
  });
  it("rejects a reschedule when the recalculated slot is unavailable", async () => {
    await expect(
      fixture({ unavailable: true }).service.update(
        owner,
        "business",
        "appointment",
        { startsAt: "2030-01-07T10:00:00.000Z" },
      ),
    ).rejects.toThrow("reschedule slot is unavailable");
  });
  it("allows an owning customer to cancel and records the actor", async () => {
    const { service, history } = fixture();
    await expect(
      service.cancel(customerUser, "business", "appointment", {
        reason: "Changed plans",
      }),
    ).resolves.toMatchObject({
      status: "CANCELLED",
      cancelledById: "customer-user",
      cancelledAt: expect.any(Date),
    });
    expect(history).toMatchObject([
      {
        fromStatus: "CONFIRMED",
        toStatus: "CANCELLED",
        changedById: "customer-user",
        reason: "Changed plans",
      },
    ]);
  });
  it("does not expose or update lifecycle data across tenants", async () => {
    const current = fixture();
    await expect(
      current.service.changeStatus(
        owner,
        "other-business",
        "appointment",
        "CONFIRMED",
      ),
    ).rejects.toThrow("Appointment not found");
    await expect(
      current.service.statusHistory(
        customerUser,
        "business",
        "other-appointment",
      ),
    ).rejects.toThrow("Appointment not found");
  });
  it("maps a concurrent database exclusion violation to 409", async () => {
    await expect(
      fixture({ overlap: true }).service.create(customerUser, "business", {
        serviceId: "service",
        locationId: "location",
        staffMemberId: "staff-member",
        startsAt: "2030-01-07T10:00:00.000Z",
      }),
    ).rejects.toThrow("booked concurrently");
  });
  it("validates and supports multiple staff working intervals", async () => {
    const { service } = fixture();
    await expect(
      service.replaceStaffHours(owner, "business", "staff-member", {
        hours: [
          { dayOfWeek: "MONDAY", startTime: "09:00", endTime: "13:00" },
          { dayOfWeek: "MONDAY", startTime: "14:00", endTime: "19:00" },
        ],
      }),
    ).resolves.toEqual([]);
    await expect(
      service.replaceStaffHours(owner, "business", "staff-member", {
        hours: [{ dayOfWeek: "MONDAY", startTime: "19:00", endTime: "09:00" }],
      }),
    ).rejects.toThrow("start must be before end");
  });
  it("records time-off type and authenticated creator server-side", async () => {
    await expect(
      fixture().service.addTimeOff(owner, "business", "staff-profile", {
        startsAt: "2030-01-07T12:00:00.000Z",
        endsAt: "2030-01-07T13:00:00.000Z",
        type: "BREAK",
        reason: "Lunch",
      }),
    ).resolves.toMatchObject({
      staffId: "staff-profile",
      type: "BREAK",
      createdByUserId: "owner-user",
    });
  });
});

describe("Explicit customer booking context for dual-role users", () => {
  const booking = {
    serviceId: "service",
    locationId: "location",
    staffMemberId: "staff-member",
    startsAt: "2030-01-07T10:00:00.000Z",
  };
  it("books for the owner's own customer only when explicitly requested", async () => {
    await expect(
      fixture({ ownerCustomer: true }).service.create(owner, "business", {
        ...booking,
        bookForSelf: true,
        internalNote: "must not persist",
      }),
    ).resolves.toMatchObject({
      customerId: "owner-customer",
      internalNote: undefined,
      status: "PENDING",
    });
  });
  it("keeps manager booking without a selected customer rejected", async () => {
    await expect(
      fixture({ ownerCustomer: true }).service.create(
        owner,
        "business",
        booking,
      ),
    ).rejects.toThrow("A customer is required");
  });
  it("preserves manager booking for an explicitly selected customer", async () => {
    await expect(
      fixture({ ownerCustomer: true }).service.create(owner, "business", {
        ...booking,
        customerId: "customer",
      }),
    ).resolves.toMatchObject({ customerId: "customer" });
  });
  it("rejects a different customer ID in self-booking context even for owners", async () => {
    await expect(
      fixture({ ownerCustomer: true }).service.create(owner, "business", {
        ...booking,
        bookForSelf: true,
        customerId: "customer",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it("does not invent a customer profile when the owner has none", async () => {
    await expect(
      fixture().service.create(owner, "business", {
        ...booking,
        bookForSelf: true,
      }),
    ).rejects.toThrow("A customer is required");
  });
  it("preserves the existing staff booking restriction", async () => {
    await expect(
      fixture().service.create(staffUser, "business", {
        ...booking,
        bookForSelf: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it("keeps normal customers scoped to their own profile", async () => {
    await expect(
      fixture().service.create(customerUser, "business", {
        ...booking,
        bookForSelf: true,
      }),
    ).resolves.toMatchObject({ customerId: "customer" });
  });
});
