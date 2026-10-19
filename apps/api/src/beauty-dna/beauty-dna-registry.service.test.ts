import { describe, expect, it } from "vitest";
import { BeautyDNARegistry } from "./beauty-dna-registry.service.js";
describe("BeautyDNARegistry", () => {
  const registry = new BeautyDNARegistry();
  it("accepts extensible beauty traits", () =>
    expect(() =>
      registry.assertAllowed("HAIR", "preferred_color_family"),
    ).not.toThrow());
  it.each([
    "ethnicity",
    "medical_diagnosis",
    "face_recognition",
    "sexual_orientation",
  ])("rejects sensitive inference %s", (trait) =>
    expect(() => registry.assertAllowed("HAIR", trait)).toThrow("prohibited"),
  );
});
