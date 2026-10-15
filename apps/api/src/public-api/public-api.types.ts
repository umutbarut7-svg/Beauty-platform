export const API_SCOPES = [
  "business.read",
  "services.read",
  "professionals.read",
  "availability.read",
  "booking.read",
  "booking.write",
  "result.read",
  "result.write",
  "discovery.read",
  "webhook.manage",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];
export interface ApiPrincipal {
  applicationId: string;
  clientId: string;
  credentialId: string;
  businessId: string;
  userId: string;
  scopes: ApiScope[];
}
export const PUBLIC_ERROR_CODES = [
  "INVALID_REQUEST",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "INSUFFICIENT_SCOPE",
  "TENANT_ACCESS_DENIED",
  "NOT_FOUND",
  "CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "RATE_LIMITED",
  "STALE_DATA",
  "NO_MATCH",
  "INTERNAL_ERROR",
] as const;
export interface PublicErrorEnvelope {
  error: {
    code: (typeof PUBLIC_ERROR_CODES)[number];
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  };
}
export interface WebhookEnvelope {
  eventId: string;
  eventType: string;
  version: 1;
  occurredAt: string;
  businessId: string;
  resource: { type: string; id: string };
  data: Record<string, unknown>;
}
export interface ExternalAiToolContract {
  name: string;
  operation: "READ" | "WRITE";
  requiredScopes: ApiScope[];
  requiresConfirmation: boolean;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}
