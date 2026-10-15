import { describe, expect, it } from "vitest";
import { BeautyDNAIntelligenceService } from "./beauty-dna-intelligence.service.js";
const now = new Date("2026-09-01T00:00:00Z"),
  day = 86_400_000;
describe("BeautyDNAIntelligenceService", () => {
  const service = new BeautyDNAIntelligenceService();
  it("normalizes Unicode, whitespace, case, and Turkish characters", () =>
    expect(service.normalize("  SARI   İPEK  ")).toBe("sarı ipek"));
  it("decays old evidence without deleting it", () =>
    expect(service.freshness(new Date(now.getTime() - 365 * day), now)).toBe(
      0.5,
    ));
  it("requires evidence and does not invent traits", () =>
    expect(service.resolve([], now)).toBeNull());
  it("does not grant one old observation high confidence", () => {
    const value = service.resolve(
      [
        {
          value: "blonde",
          reliability: 1,
          occurredAt: new Date(now.getTime() - 3 * 365 * day),
        },
      ],
      now,
    )!;
    expect(value.confidence).toBeLessThan(0.5);
  });
  it("resolves conflicts by weighted recency and lowers confidence", () => {
    const conflict = service.resolve(
      [
        {
          value: "blonde",
          reliability: 1,
          occurredAt: new Date(now.getTime() - 600 * day),
        },
        {
          value: "brunette",
          reliability: 1,
          occurredAt: new Date(now.getTime() - day),
        },
      ],
      now,
    )!;
    const agreed = service.resolve(
      [
        {
          value: "brunette",
          reliability: 1,
          occurredAt: new Date(now.getTime() - 2 * day),
        },
        {
          value: "brunette",
          reliability: 1,
          occurredAt: new Date(now.getTime() - day),
        },
      ],
      now,
    )!;
    expect(conflict.normalizedValue).toBe("brunette");
    expect(conflict.conflict).toBe(true);
    expect(conflict.confidence).toBeLessThan(agreed.confidence);
  });
});
