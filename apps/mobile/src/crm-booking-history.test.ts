import { MvpApiClient } from "@beauty-platform/types";
import { describe, expect, it } from "vitest";
import {
  businessBookingEmail,
  customerPaymentAmount,
  listBusinessCustomers,
  readCustomerActivity,
  readCustomerAppointment,
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
  it("lists imported and booking-backed profiles in a single search result", async () => {
    const items = [
      { id: "profile-a", businessId: "salon-a", firstName: "Ada" },
      {
        id: "profile-b",
        businessId: "salon-a",
        accountEmail: "ada.scholar@example.test",
      },
    ];
    await expect(
      listBusinessCustomers(
        client(
          { items, page: 1, pages: 1 },
          "/businesses/salon-a/customers?page=1&limit=25&search=Ada",
        ),
        "salon-a",
        "Ada",
        1,
      ),
    ).resolves.toMatchObject({ items });
  });

  const linked = { ...booking, businessCustomerId: "profile-a" };
  const customerPath = "/businesses/salon-a/customers/profile-a";

  it("passes the next page cursor only to the selected customer and history", async () => {
    const path =
      customerPath + "/activity?section=appointments&cursor=next-page";
    await expect(
      readCustomerActivity(
        client({ items: [linked], nextCursor: null }, path),
        "salon-a",
        "profile-a",
        "appointments",
        "next-page",
      ),
    ).resolves.toEqual({ items: [linked], nextCursor: null });
  });

  it("rejects cross-customer rows and foreign appointment references", async () => {
    const path = customerPath + "/activity?section=operations";
    await expect(
      readCustomerActivity(
        client(
          {
            items: [
              {
                id: "event",
                businessId: "salon-a",
                appointment: { ...linked, businessCustomerId: "profile-b" },
              },
            ],
            nextCursor: null,
          },
          path,
        ),
        "salon-a",
        "profile-a",
        "operations",
      ),
    ).rejects.toThrow("scope mismatch");
    await expect(
      readCustomerAppointment(
        client(
          { ...linked, id: "different" },
          customerPath + "/appointments/appointment-1",
        ),
        "salon-a",
        "profile-a",
        "appointment-1",
      ),
    ).rejects.toThrow("scope mismatch");
  });

  it("formats actual ledger amounts with the configured precision", async () => {
    const payment = {
      id: "receipt",
      businessId: "salon-a",
      businessCustomerId: "profile-a",
      appointmentId: linked.id,
      serviceName: "Saç kesimi",
      type: "CHARGE" as const,
      amountMinor: "900719925474099301",
      currency: "TRY",
      minorUnit: 2,
      createdAt: booking.startsAt,
    };
    await expect(
      readCustomerActivity(
        client(
          { items: [payment], nextCursor: null },
          customerPath + "/activity?section=payments",
        ),
        "salon-a",
        "profile-a",
        "payments",
      ),
    ).resolves.toMatchObject({ items: [payment] });
    expect(customerPaymentAmount(payment)).toBe("9007199254740993,01 TRY");
    expect(customerPaymentAmount({ ...payment, minorUnit: null })).toBe(
      "900719925474099301 TRY (alt birim)",
    );
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
