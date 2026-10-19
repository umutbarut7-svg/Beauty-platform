import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { IS_PUBLIC_KEY } from "../auth/auth.decorators.js";
import { DiscoveryController } from "./discovery.controller.js";

describe("DiscoveryController policies", () => {
  it("keeps public search endpoints at 30 requests per minute", () => {
    for (const method of [
      "search",
      "businesses",
      "services",
      "professionals",
    ] as const) {
      const handler = DiscoveryController.prototype[method];
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
      expect(Reflect.getMetadata("THROTTLER:LIMITdefault", handler)).toBe(30);
      expect(Reflect.getMetadata("THROTTLER:TTLdefault", handler)).toBe(60_000);
    }
  });
  it("applies a stricter public policy to structured matching", () => {
    const handler = DiscoveryController.prototype.match;
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
    expect(Reflect.getMetadata("THROTTLER:LIMITdefault", handler)).toBe(20);
  });
});
