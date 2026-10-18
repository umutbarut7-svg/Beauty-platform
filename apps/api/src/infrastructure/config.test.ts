import { afterEach, describe, expect, it } from "vitest";
import { loadRuntimeConfig } from "./config.js";

const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});

describe("runtime configuration", () => {
  it("validates typed bounds and production requirements", () => {
    process.env.DATABASE_URL = "postgresql://local/test";
    process.env.NODE_ENV = "production";
    process.env.CORS_ORIGINS = "https://app.example";
    process.env.PORT = "3001";
    process.env.TRUST_PROXY = "false";
    process.env.EXTERNAL_REQUEST_TIMEOUT_MS = "10000";
    process.env.RETRY_MAX_ATTEMPTS = "3";
    process.env.RATE_LIMIT_DEFAULT = "100";
    process.env.RATE_LIMIT_WINDOW_MS = "60000";
    expect(loadRuntimeConfig()).toMatchObject({
      environment: "production",
      port: 3001,
    });
    process.env.PORT = "invalid";
    expect(() => loadRuntimeConfig()).toThrow("PORT");
    process.env.PORT = "3001";
    process.env.TRUST_PROXY = "sometimes";
    expect(() => loadRuntimeConfig()).toThrow("TRUST_PROXY");
    process.env.TRUST_PROXY = "false";
    process.env.AI_TRACE_RETENTION_DAYS = "0";
    expect(() => loadRuntimeConfig()).toThrow("AI_TRACE_RETENTION_DAYS");
  });
  it("fails fast without database or production origins", () => {
    delete process.env.DATABASE_URL;
    expect(() => loadRuntimeConfig()).toThrow("DATABASE_URL");
    process.env.DATABASE_URL = "postgresql://local/test";
    process.env.NODE_ENV = "production";
    delete process.env.CORS_ORIGINS;
    expect(() => loadRuntimeConfig()).toThrow("CORS_ORIGINS");
  });
});
