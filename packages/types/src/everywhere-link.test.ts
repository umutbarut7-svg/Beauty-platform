import { describe, expect, it } from "vitest";
import { createOrzellShareLink, parseOrzellShareLink } from "./everywhere-link";

const origin = "https://orzell.app";
describe("ORZELL Everywhere share links", () => {
  it("round-trips exact service, business, professional and result", () => {
    const target = { businessId: "salon_1", serviceId: "balayage", professionalId: "staff-2", resultId: "photo_3" };
    expect(parseOrzellShareLink(createOrzellShareLink(origin, target), origin)).toEqual(target);
  });
  it("supports a service-only destination", () => {
    const target = { businessId: "salon", serviceId: "color" };
    expect(parseOrzellShareLink(createOrzellShareLink(origin, target), origin)).toEqual(target);
  });
  it("rejects insecure origins and unsafe IDs", () => {
    expect(() => createOrzellShareLink("http://orzell.app", { businessId: "a", serviceId: "b" })).toThrow();
    expect(() => createOrzellShareLink(origin, { businessId: "a/b", serviceId: "b" })).toThrow();
  });
  it("rejects foreign hosts, duplicated IDs and unknown parameters", () => {
    expect(parseOrzellShareLink("https://orzell.app.evil.test/discover/service?businessId=a&serviceId=b", origin)).toBeNull();
    expect(parseOrzellShareLink("https://orzell.app/discover/service?businessId=a&businessId=b&serviceId=c", origin)).toBeNull();
    expect(parseOrzellShareLink("https://orzell.app/discover/service?businessId=a&serviceId=b&redirect=https://evil.test", origin)).toBeNull();
  });
});
