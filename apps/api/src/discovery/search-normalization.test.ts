import { describe, expect, it } from "vitest";
import { normalizeSearchText } from "./search-normalization.js";
describe("normalizeSearchText", () => {
  it("normalizes whitespace and case without stripping Turkish characters", () => {
    expect(normalizeSearchText("  İpek   Şişli  ")).toBe("ipek şişli");
  });
  it("normalizes canonically equivalent Unicode", () => {
    expect(normalizeSearchText("Cafe\u0301")).toBe(normalizeSearchText("Café"));
    expect(normalizeSearchText("   ")).toBeUndefined();
  });
});
