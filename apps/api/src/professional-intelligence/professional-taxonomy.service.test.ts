import { describe, expect, it } from "vitest";
import { ProfessionalTaxonomyService } from "./professional-taxonomy.service.js";
describe("ProfessionalTaxonomyService", () => {
  const s = new ProfessionalTaxonomyService();
  it("accepts extensible taxonomy codes", () =>
    expect(() => s.assert("HAIR", "BALAYAGE")).not.toThrow());
  it("rejects unregistered category and free text", () => {
    expect(() => s.assert("MEDICAL", "DIAGNOSIS")).toThrow();
    expect(() => s.assert("HAIR", "great stylist")).toThrow();
  });
});
