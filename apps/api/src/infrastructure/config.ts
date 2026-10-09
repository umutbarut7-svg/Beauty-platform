export type RuntimeEnvironment = "development" | "test" | "production";

export interface RuntimeConfig {
  environment: RuntimeEnvironment;
  port: number;
  corsOrigins: string[];
  trustProxy: boolean;
  requestTimeoutMs: number;
  retryMaxAttempts: number;
  rateLimitDefault: number;
  rateLimitWindowMs: number;
  aiTraceRetentionDays: number;
  aiMaxEstimatedCostMicros: number;
  aiRateLimitPerMinute: number;
}

const integer = (name: string, fallback: number, min: number, max: number) => {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return value;
};
const boolean = (name: string, fallback: boolean) => {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  if (raw !== "true" && raw !== "false")
    throw new Error(`${name} must be true or false`);
  return raw === "true";
};

export function loadRuntimeConfig(): RuntimeConfig {
  const environment = process.env.NODE_ENV ?? "development";
  if (
    !(["development", "test", "production"] as string[]).includes(environment)
  )
    throw new Error("NODE_ENV must be development, test, or production");
  const corsOrigins =
    process.env.CORS_ORIGINS?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];
  if (environment === "production" && corsOrigins.length === 0)
    throw new Error("CORS_ORIGINS is required in production");
  if (environment === "production") {
    for (const name of [
      "TRUST_PROXY",
      "EXTERNAL_REQUEST_TIMEOUT_MS",
      "RETRY_MAX_ATTEMPTS",
      "RATE_LIMIT_DEFAULT",
      "RATE_LIMIT_WINDOW_MS",
    ])
      if (process.env[name] === undefined)
        throw new Error(`${name} is required in production`);
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  return {
    environment: environment as RuntimeEnvironment,
    port: integer("PORT", 3001, 1, 65_535),
    corsOrigins,
    trustProxy: boolean("TRUST_PROXY", false),
    requestTimeoutMs: integer(
      "EXTERNAL_REQUEST_TIMEOUT_MS",
      10_000,
      100,
      120_000,
    ),
    retryMaxAttempts: integer("RETRY_MAX_ATTEMPTS", 3, 1, 10),
    rateLimitDefault: integer("RATE_LIMIT_DEFAULT", 100, 1, 100_000),
    rateLimitWindowMs: integer("RATE_LIMIT_WINDOW_MS", 60_000, 1000, 3_600_000),
    aiTraceRetentionDays: integer("AI_TRACE_RETENTION_DAYS", 30, 1, 3650),
    aiMaxEstimatedCostMicros: integer(
      "AI_MAX_ESTIMATED_COST_MICROS",
      100_000,
      0,
      100_000_000,
    ),
    aiRateLimitPerMinute: integer("AI_RATE_LIMIT_PER_MINUTE", 20, 1, 10_000),
  };
}
