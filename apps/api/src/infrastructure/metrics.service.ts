import { Injectable } from "@nestjs/common";

export interface MetricsSnapshot {
  requests: number;
  errors: number;
  requestDurationMs: number;
  jobsSucceeded: number;
  jobsFailed: number;
  dependencyFailures: number;
  dbOperations: number;
  dbErrors: number;
  retries: number;
  notificationsSucceeded: number;
  notificationsFailed: number;
  authFailures: number;
  authorizationDenied: number;
  rateLimitExceeded: number;
  discoveryRequests: number;
  discoveryDurationMs: number;
  discoveryZeroResults: number;
  discoveryFilteredResults: number;
  discoveryGeoRequests: number;
  discoveryAvailabilityRequests: number;
  agentRequests: number;
  agentDurationMs: number;
  agentToolCalls: number;
  agentToolFailures: number;
  agentConfirmations: number;
  agentNoMatches: number;
  agentLimitsExceeded: number;
  aiRunsSucceeded: number;
  aiRunsFailed: number;
  aiRunsBlocked: number;
  aiPolicyBlocks: number;
  aiSafetyBlocks: number;
  aiTokenUsage: number;
  aiEstimatedCostMicros: number;
  aiNeedsInformation: number;
  aiNotAvailable: number;
}

@Injectable()
export class MetricsService {
  private readonly values: MetricsSnapshot = {
    requests: 0,
    errors: 0,
    requestDurationMs: 0,
    jobsSucceeded: 0,
    jobsFailed: 0,
    dependencyFailures: 0,
    dbOperations: 0,
    dbErrors: 0,
    retries: 0,
    notificationsSucceeded: 0,
    notificationsFailed: 0,
    authFailures: 0,
    authorizationDenied: 0,
    rateLimitExceeded: 0,
    discoveryRequests: 0,
    discoveryDurationMs: 0,
    discoveryZeroResults: 0,
    discoveryFilteredResults: 0,
    discoveryGeoRequests: 0,
    discoveryAvailabilityRequests: 0,
    agentRequests: 0,
    agentDurationMs: 0,
    agentToolCalls: 0,
    agentToolFailures: 0,
    agentConfirmations: 0,
    agentNoMatches: 0,
    agentLimitsExceeded: 0,
    aiRunsSucceeded: 0,
    aiRunsFailed: 0,
    aiRunsBlocked: 0,
    aiPolicyBlocks: 0,
    aiSafetyBlocks: 0,
    aiTokenUsage: 0,
    aiEstimatedCostMicros: 0,
    aiNeedsInformation: 0,
    aiNotAvailable: 0,
  };
  request(durationMs: number, failed: boolean) {
    this.values.requests += 1;
    this.values.requestDurationMs += durationMs;
    if (failed) this.values.errors += 1;
  }
  job(succeeded: boolean) {
    this.values[succeeded ? "jobsSucceeded" : "jobsFailed"] += 1;
  }
  dependencyFailure() {
    this.values.dependencyFailures += 1;
  }
  database(failed = false) {
    this.values.dbOperations += 1;
    if (failed) this.values.dbErrors += 1;
  }
  retry() {
    this.values.retries += 1;
  }
  notification(succeeded: boolean) {
    this.values[succeeded ? "notificationsSucceeded" : "notificationsFailed"] +=
      1;
  }
  authFailure() {
    this.values.authFailures += 1;
  }
  authorizationDenied() {
    this.values.authorizationDenied += 1;
  }
  rateLimitExceeded() {
    this.values.rateLimitExceeded += 1;
  }
  discovery(input: {
    durationMs: number;
    resultCount: number;
    filteredCount: number;
    geo: boolean;
    availability: boolean;
  }) {
    this.values.discoveryRequests += 1;
    this.values.discoveryDurationMs += input.durationMs;
    this.values.discoveryFilteredResults += input.filteredCount;
    if (input.resultCount === 0) this.values.discoveryZeroResults += 1;
    if (input.geo) this.values.discoveryGeoRequests += 1;
    if (input.availability) this.values.discoveryAvailabilityRequests += 1;
  }
  agent(durationMs: number, noMatch = false) {
    this.values.agentRequests += 1;
    this.values.agentDurationMs += durationMs;
    if (noMatch) this.values.agentNoMatches += 1;
  }
  agentTool(succeeded: boolean) {
    this.values.agentToolCalls += 1;
    if (!succeeded) this.values.agentToolFailures += 1;
  }
  agentConfirmation() {
    this.values.agentConfirmations += 1;
  }
  agentLimitExceeded() {
    this.values.agentLimitsExceeded += 1;
  }
  aiRun(
    status: "SUCCEEDED" | "FAILED" | "BLOCKED",
    tokens = 0,
    costMicros = 0,
  ) {
    this.values[
      status === "SUCCEEDED"
        ? "aiRunsSucceeded"
        : status === "BLOCKED"
          ? "aiRunsBlocked"
          : "aiRunsFailed"
    ] += 1;
    this.values.aiTokenUsage += tokens;
    this.values.aiEstimatedCostMicros += costMicros;
  }
  aiPolicyBlock() {
    this.values.aiPolicyBlocks += 1;
  }
  aiSafetyBlock() {
    this.values.aiSafetyBlocks += 1;
  }
  aiNeedsInformation() {
    this.values.aiNeedsInformation += 1;
  }
  aiNotAvailable() {
    this.values.aiNotAvailable += 1;
  }
  snapshot(): Readonly<MetricsSnapshot> {
    return { ...this.values };
  }
}
