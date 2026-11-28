import { MvpApiClient } from "@beauty-platform/types";
import { describe, expect, it } from "vitest";
import {
  businessBookingEmail,
  readAppointmentCustomers,
  readBusinessCustomer,
  type BusinessBooking,
} from "./business-customers";

const booking: BusinessBooking = {
  id: "appointment-1",
  businessId: "salon-a",
  status: "COMPLETED",
  startsAt: "2026-11-28T10:00:00Z",
  price: "100",
  currency: "TRY",
  service: { name: "Saç kesimi" },
  customer: { id: "account-a", user: { email: "ada@example.test" } },
};
function client(payload: unknown, path: string) {
  return new MvpApiClient("https://example.test/api", async (input, init) => {
    expect(String(input)).toBe("https://example.test/api" + path);
    expect(init?.method).toBe("GET");
    return Response.json(payload);
  });
}

describe("CRM appointment history", () => {
  it("reads the selected business and groups real unlinked bookings by account ID", async () => {
    const rows = [
      booking,
      { ...booking, id: "appointment-2" },
      { ...booking, id: "appointment-3", businessCustomerId: "profile-a" },
      { ...booking, id: "appointment-4", businessId: "salon-b" },
      { ...booking, id: "appointment-5", customer: { id: "account-b" } },
    ];
    const result = await readAppointmentCustomers(
      client(rows, "/businesses/salon-a/appointments"),
      "salon-a",
      "ADA@",
    );
    expect(result).toEqual({
      limited: false,
      items: [
        {
          id: "account-a",
          email: "ada@example.test",
          appointments: rows.slice(0, 2),
        },
      ],
    });
  });

  it("never shows a booking contact from a different business", () => {
    expect(businessBookingEmail(booking, "salon-b")).toBeNull();
    expect(businessBookingEmail(booking, "salon-a")).toBe("ada@example.test");
  });

  it("reads linked appointment history and rejects history from another business", async () => {
    const detail = {
      customer: { id: "profile-a", businessId: "salon-a" },
      summary: { completedAppointments: 1, upcomingAppointments: 0 },
      recentAppointments: [booking],
    };
    const path = "/businesses/salon-a/customers/profile-a";
    await expect(
      readBusinessCustomer(client(detail, path), "salon-a", "profile-a"),
    ).resolves.toMatchObject({ recentAppointments: [booking] });
    await expect(
      readBusinessCustomer(
        client(
          {
            ...detail,
            recentAppointments: [{ ...booking, businessId: "salon-b" }],
          },
          path,
        ),
        "salon-a",
        "profile-a",
      ),
    ).rejects.toThrow("scope mismatch");
  });
});
