import { describe, expect, it } from "vitest";
import { intentToSearchQuery } from "./discovery-intent.js";
import { HistoricalExpertiseProvider } from "./expertise.service.js";
import { UnavailableResultProbabilityProvider } from "./result-probability.provider.js";

describe("discovery foundations", () => {
  it("converts transport-independent text/voice/photo intent without identity leakage", () => {
    expect(
      intentToSearchQuery({
        source: "VOICE",
        userId: "user-a",
        customerId: "customer-a",
        query: "balayage",
        serviceId: "service-a",
        attributes: { finish: "natural" },
      }),
    ).toEqual({ query: "balayage", serviceId: "service-a" });
  });
  it("never fabricates result probability", async () => {
    await expect(
      new UnavailableResultProbabilityProvider().probability({
        businessId: "business-a",
      }),
    ).resolves.toBeNull();
  });
  it("derives expertise only from real matching history", () => {
    const provider = new HistoricalExpertiseProvider();
    expect(
      provider.score({ completedAppointments: 0, serviceMatched: false }),
    ).toBeNull();
    expect(
      provider.score({ completedAppointments: 7, serviceMatched: true }),
    ).toBeGreaterThan(0);
  });
});
