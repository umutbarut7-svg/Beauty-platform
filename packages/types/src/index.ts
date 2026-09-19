/** A lightweight response shared by platform health checks. */
export interface HealthStatus {
  readonly service: string;
  readonly status: "ok";
}

export function createHealthStatus(service: string): HealthStatus {
  return { service, status: "ok" };
}
