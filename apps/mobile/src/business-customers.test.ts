import { ApiError, MvpApiClient } from "@beauty-platform/types";
import { describe, expect, it } from "vitest";
import {
  listBusinessCustomers,
  readBusinessCustomer,
} from "./business-customers";

const customer = {
  id: "customer-1",
  businessId: "salon-a",
  firstName: "Ada",
  lastName: "Test",
};
const legacyDetail = {
  customer,
  summary: {
    completedAppointments: 2,
    upcomingAppointments: 1,
    completedAppointmentValue: "200",
  },
};

function client(payload: unknown, status = 200) {
  const requested: Array<{ url: string; method?: string }> = [];
  const api = new MvpApiClient(
    "https://example.test/api",
    async (input, init) => {
      requested.push({ url: String(input), method: init?.method });
      return Response.json(payload, { status });
    },
  );
  return { api, requested };
}

describe("mobile CRM reads", () => {
  it("requests the selected business and safely encodes search and pagination", async () => {
    const { api, requested } = client({ items: [customer], page: 2, pages: 3 });
    await expect(
      listBusinessCustomers(api, "salon-a", "Ada & İpek", 2),
    ).resolves.toMatchObject({ page: 2, pages: 3 });
    const url = new URL(requested[0]!.url);
    expect(url.pathname).toBe("/api/businesses/salon-a/customers");
    expect([...url.searchParams]).toEqual([
      ["page", "2"],
      ["limit", "25"],
      ["search", "Ada & İpek"],
    ]);
    expect(requested[0]?.method).toBe("GET");
  });

  it("accepts the current pilot response without the new currency field", async () => {
    const { api, requested } = client(legacyDetail);
    const detail = await readBusinessCustomer(api, "salon-a", "customer-1");
    expect(detail.summary.completedAppointments).toBe(2);
    expect(detail.summary.completedValuesByCurrency).toBeUndefined();
    expect(requested[0]?.url).toBe(
      "https://example.test/api/businesses/salon-a/customers/customer-1",
    );
  });

  it("accepts the #190 per-currency extension", async () => {
    const totals = [
      { currency: "TRY", completedAppointmentValue: "200" },
      { currency: "EUR", completedAppointmentValue: "10" },
    ];
    const { api } = client({
      ...legacyDetail,
      summary: { ...legacyDetail.summary, completedValuesByCurrency: totals },
    });
    expect(
      (await readBusinessCustomer(api, "salon-a", "customer-1")).summary
        .completedValuesByCurrency,
    ).toEqual(totals);
  });

  it("rejects cross-business records in either response", async () => {
    const other = { ...customer, businessId: "salon-b" };
    await expect(
      listBusinessCustomers(
        client({ items: [other], page: 1, pages: 1 }).api,
        "salon-a",
        "",
        1,
      ),
    ).rejects.toThrow("scope mismatch");
    await expect(
      readBusinessCustomer(
        client({ ...legacyDetail, customer: other }).api,
        "salon-a",
        "customer-1",
      ),
    ).rejects.toThrow("scope mismatch");
  });

  it("propagates denied access through the existing client", async () => {
    await expect(
      listBusinessCustomers(client({}, 403).api, "salon-a", "", 1),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
