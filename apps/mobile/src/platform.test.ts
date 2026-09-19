import { describe, expect, it } from "vitest";
import { platformLabel } from "./platform";

describe("platformLabel", () => {
  it("formats a product label", () => {
    expect(platformLabel("Mobile")).toBe("Beauty Platform · Mobile");
  });
});
