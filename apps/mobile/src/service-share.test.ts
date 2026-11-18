import { describe, expect, it, vi } from "vitest";
import { prepareServiceShare } from "../service-share";

const target = {
  businessId: "salon",
  serviceId: "color",
  professionalId: "staff",
};
const published = {
  locations: [],
  business: { id: "salon", name: "Salon", timezone: "Europe/Istanbul" },
  service: {
    id: "color",
    name: "Renklendirme",
    price: "1500",
    currency: "TRY",
    durationMinutes: 90,
  },
  professionals: [
    {
      id: "staff",
      displayName: "Stylist",
      price: "1700",
      durationMinutes: 120,
    },
  ],
};
describe("Merchant service share preparation", () => {
  it("prepares a link only after current publication and exact staff resolution", async () => {
    const request = vi.fn().mockResolvedValue(published);
    const draft = await prepareServiceShare(
      { request },
      "https://share.example.test",
      target,
    );
    expect(request).toHaveBeenCalledWith(
      "/discovery/shared-service?businessId=salon&serviceId=color&professionalId=staff",
    );
    expect(draft.url).toBe(
      "https://share.example.test/discover/service?businessId=salon&serviceId=color&professionalId=staff",
    );
    expect(draft.published).toEqual(published);
  });
  it("does not prepare a foreign-tenant or unapproved-result share", async () => {
    const request = vi.fn().mockResolvedValue({
      ...published,
      business: { ...published.business, id: "other" },
    });
    await expect(
      prepareServiceShare({ request }, "https://share.example.test", target),
    ).rejects.toThrow();
    request.mockResolvedValue(published);
    await expect(
      prepareServiceShare({ request }, "https://share.example.test", {
        ...target,
        resultId: "private-photo",
      }),
    ).rejects.toThrow();
  });
  it("validates origin and identifiers before making a request", async () => {
    const request = vi.fn();
    await expect(
      prepareServiceShare({ request }, "http://unsafe.test", target),
    ).rejects.toThrow();
    await expect(
      prepareServiceShare({ request }, "https://share.example.test", {
        ...target,
        serviceId: "foreign/tenant",
      }),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});
