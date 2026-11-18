import { describe, expect, it, vi } from "vitest";
import { publicApiBase, resolvePublishedService } from "./published-service";

const target = { businessId: "salon", serviceId: "color" };
const published = {
  locations: [],
  business: { id: "salon", name: "Salon", timezone: "Europe/Istanbul" },
  service: {
    id: "color",
    name: "Renklendirme",
    price: "1500.50",
    currency: "TRY",
    durationMinutes: 90,
  },
  professionals: [
    {
      id: "staff",
      displayName: "Stylist",
      price: "1700.25",
      durationMinutes: 120,
    },
  ],
};
describe("Shared-service server lookup", () => {
  it("supports the approved /api reverse-proxy mount without accepting arbitrary prefixes", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(published));
    expect(
      await resolvePublishedService(
        target,
        "https://api.example.test",
        transport,
        "/api",
      ),
    ).toEqual(published);
    expect(String(transport.mock.calls[0]![0])).toBe(
      "https://api.example.test/api/discovery/shared-service?businessId=salon&serviceId=color",
    );
    expect(publicApiBase("https://api.example.test", "/other")).toBeNull();
    expect(
      publicApiBase("https://api.example.test", "//foreign.test"),
    ).toBeNull();
  });
  it("fetches the exact trusted endpoint without cache, credentials or redirects", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(published));
    expect(
      await resolvePublishedService(
        target,
        "https://api.example.test",
        transport,
      ),
    ).toEqual(published);
    const [url, options] = transport.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://api.example.test/discovery/shared-service?businessId=salon&serviceId=color",
    );
    expect(options).toMatchObject({ cache: "no-store", redirect: "error" });
    expect(options?.headers).toBeUndefined();
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  });
  it("never fetches unconfigured/unsafe origins or unapproved result photos", async () => {
    const transport = vi.fn<typeof fetch>();
    for (const origin of [
      undefined,
      "http://api.example.test",
      "https://user:pass@api.example.test",
      "https://api.example.test/path",
      "https://api.example.test?key=secret",
    ]) {
      expect(
        await resolvePublishedService(target, origin, transport),
      ).toBeNull();
    }
    expect(
      await resolvePublishedService(
        { ...target, resultId: "photo" },
        "https://api.example.test",
        transport,
      ),
    ).toBeNull();
    expect(transport).not.toHaveBeenCalled();
  });
  it("rejects foreign, malformed, ambiguous and unverified professional data", async () => {
    const cases = [
      null,
      {},
      { items: [published] },
      { ...published, business: { ...published.business, id: "other" } },
      { ...published, service: { ...published.service, id: "other" } },
      { ...published, service: { ...published.service, price: "NaN" } },
      { ...published, service: { ...published.service, durationMinutes: -1 } },
      {
        ...published,
        business: { ...published.business, timezone: "invalid" },
      },
      {
        ...published,
        professionals: [...published.professionals, ...published.professionals],
      },
      {
        ...published,
        professionals: [
          { displayName: "Missing id", price: "1", durationMinutes: 1 },
        ],
      },
    ];
    for (const value of cases) {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(value));
      expect(
        await resolvePublishedService(
          target,
          "https://api.example.test",
          transport,
        ),
      ).toBeNull();
    }
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json(published));
    expect(
      await resolvePublishedService(
        { ...target, professionalId: "other" },
        "https://api.example.test",
        transport,
      ),
    ).toBeNull();
    expect(
      await resolvePublishedService(
        { ...target, professionalId: "staff" },
        "https://api.example.test",
        transport,
      ),
    ).toEqual(published);
  });
  it("uses a generic unavailable state for HTTP, JSON and network failures", async () => {
    for (const transport of [
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("", { status: 404 })),
      vi.fn<typeof fetch>().mockResolvedValue(new Response("invalid JSON")),
      vi.fn<typeof fetch>().mockRejectedValue(new Error("unavailable")),
    ])
      expect(
        await resolvePublishedService(
          target,
          "https://api.example.test",
          transport,
        ),
      ).toBeNull();
  });
});
