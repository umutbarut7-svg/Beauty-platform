import { describe, expect, it } from "vitest";
import { MetricsService } from "./metrics.service.js";

describe("MetricsService", () => {
  it("measures operational outcomes without high-cardinality labels", () => {
    const metrics = new MetricsService();
    metrics.request(12, true);
    metrics.database();
    metrics.database(true);
    metrics.retry();
    metrics.notification(true);
    metrics.notification(false);
    metrics.authFailure();
    metrics.authorizationDenied();
    metrics.rateLimitExceeded();
    metrics.discovery({
      durationMs: 25,
      resultCount: 0,
      filteredCount: 4,
      geo: true,
      availability: true,
    });
    metrics.aiRun("SUCCEEDED", 12, 34);
    metrics.aiRun("BLOCKED");
    metrics.aiPolicyBlock();
    metrics.aiSafetyBlock();
    metrics.aiNeedsInformation();
    metrics.aiNotAvailable();
    expect(metrics.snapshot()).toMatchObject({
      requests: 1,
      errors: 1,
      requestDurationMs: 12,
      dbOperations: 2,
      dbErrors: 1,
      retries: 1,
      notificationsSucceeded: 1,
      notificationsFailed: 1,
      authFailures: 1,
      authorizationDenied: 1,
      rateLimitExceeded: 1,
      discoveryRequests: 1,
      discoveryDurationMs: 25,
      discoveryZeroResults: 1,
      discoveryFilteredResults: 4,
      discoveryGeoRequests: 1,
      discoveryAvailabilityRequests: 1,
      aiRunsSucceeded: 1,
      aiRunsBlocked: 1,
      aiPolicyBlocks: 1,
      aiSafetyBlocks: 1,
      aiTokenUsage: 12,
      aiEstimatedCostMicros: 34,
      aiNeedsInformation: 1,
      aiNotAvailable: 1,
    });
  });
});
