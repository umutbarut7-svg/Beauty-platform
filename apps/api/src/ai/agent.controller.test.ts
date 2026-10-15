import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { IS_PUBLIC_KEY } from "../auth/auth.decorators.js";
import { AgentController } from "./agent.controller.js";
describe("AgentController security policy", () => {
  it("is authenticated and rate limited", () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, AgentController)).not.toBe(true);
    expect(Reflect.getMetadata("THROTTLER:LIMITdefault", AgentController)).toBe(
      20,
    );
    for (const name of [
      "create",
      "get",
      "message",
      "confirm",
      "reject",
    ] as const)
      expect(
        Reflect.getMetadata(IS_PUBLIC_KEY, AgentController.prototype[name]),
      ).not.toBe(true);
  });
});
