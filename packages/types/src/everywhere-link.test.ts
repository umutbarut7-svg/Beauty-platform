import { describe, expect, it } from "vitest";
import { createOrzellShareLink, parseOrzellShareLink } from "./everywhere-link";

const origin = "https://orzell.app";
describe("ORZELL Everywhere share links", () => {
  it("round-trips exact service, business, professional and result", () => {
    const target = {
      businessId: "salon_1",
      serviceId: "balayage",
      professionalId: "staff-2",
      resultId: "photo_3",
    };
    expect(
      parseOrzellShareLink(createOrzellShareLink(origin, target), origin),
    ).toEqual(target);
  });
  it("supports a service-only destination", () => {
    const target = { businessId: "salon", serviceId: "color" };
    expect(
      parseOrzellShareLink(createOrzellShareLink(origin, target), origin),
    ).toEqual(target);
  });
  it("rejects insecure origins and unsafe IDs", () => {
    expect(() =>
      createOrzellShareLink("http://orzell.app", {
        businessId: "a",
        serviceId: "b",
      }),
    ).toThrow();
    expect(() =>
      createOrzellShareLink(origin, { businessId: "a/b", serviceId: "b" }),
    ).toThrow();
  });
  it("rejects empty optional IDs when creating a share link", () => {
    expect(() =>
      createOrzellShareLink(origin, {
        businessId: "salon",
        serviceId: "color",
        professionalId: "",
      }),
    ).toThrow();
    expect(() =>
      createOrzellShareLink(origin, {
        businessId: "salon",
        serviceId: "color",
        resultId: "",
      }),
    ).toThrow();
  });
  it("rejects an optional identifier containing encoded separators", () => {
    expect(
      parseOrzellShareLink(
        "https://orzell.app/discover/service?businessId=a&serviceId=b&resultId=other%2Ftenant",
        origin,
      ),
    ).toBeNull();
  });
  it("rejects wrong paths and missing required identifiers", () => {
    expect(
      parseOrzellShareLink(
        "https://orzell.app/discover/other?businessId=a&serviceId=b",
        origin,
      ),
    ).toBeNull();
    expect(
      parseOrzellShareLink(
        "https://orzell.app/discover/service?businessId=a",
        origin,
      ),
    ).toBeNull();
    expect(
      parseOrzellShareLink(
        "https://orzell.app/discover/service?serviceId=b",
        origin,
      ),
    ).toBeNull();
  });
  it("rejects malformed optional identifiers and untrusted origins", () => {
    expect(
      parseOrzellShareLink(
        "https://orzell.app/discover/service?businessId=a&serviceId=b&professionalId=bad%2Fid",
        origin,
      ),
    ).toBeNull();
    expect(
      parseOrzellShareLink(
        "https://orzell.app/discover/service?businessId=a&serviceId=b",
        "http://orzell.app",
      ),
    ).toBeNull();
  });
  it("rejects foreign hosts, duplicated IDs and unknown parameters", () => {
    expect(
      parseOrzellShareLink(
        "https://orzell.app.evil.test/discover/service?businessId=a&serviceId=b",
        origin,
      ),
    ).toBeNull();
    expect(
      parseOrzellShareLink(
        "https://orzell.app/discover/service?businessId=a&businessId=b&serviceId=c",
        origin,
      ),
    ).toBeNull();
    expect(
      parseOrzellShareLink(
        "https://orzell.app/discover/service?businessId=a&serviceId=b&redirect=https://evil.test",
        origin,
      ),
    ).toBeNull();
    expect(
      parseOrzellShareLink(
        "https://orzell.app/discover/service?businessId=a&serviceId=b&professionalId=",
        origin,
      ),
    ).toBeNull();
    expect(
      parseOrzellShareLink(
        "https://orzell.app/discover/service?businessId=a&serviceId=b&resultId=",
        origin,
      ),
    ).toBeNull();
    expect(
      parseOrzellShareLink(
        "https://orzell.app/discover/service?businessId=a&serviceId=b#unexpected",
        origin,
      ),
    ).toBeNull();
    expect(
      parseOrzellShareLink(
        "https://user:pass@orzell.app/discover/service?businessId=a&serviceId=b",
        origin,
      ),
    ).toBeNull();
  });
});
