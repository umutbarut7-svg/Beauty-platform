import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "redis";
import {
  RedisWakeupService,
  MVP_WAKEUP_KEY,
} from "../src/infrastructure/redis-wakeup.service.js";
import { MetricsService } from "../src/infrastructure/metrics.service.js";
const url = "redis://127.0.0.1:6379";
if (process.env.STAGE33_TEST_REDIS_URL !== url)
  throw new Error(
    "Redis integration tests require the isolated Stage 33 Redis service",
  );
let service: RedisWakeupService | undefined;
afterEach(() => {
  service?.onModuleDestroy();
  service = undefined;
  vi.unstubAllEnvs();
});
describe("Real Redis wakeups with PostgreSQL authority preserved", () => {
  it("bounds wakeups to a short-lived non-PII tick and consumes a real wakeup", async () => {
    vi.stubEnv("MVP_REDIS_ENABLED", "true");
    vi.stubEnv("MVP_REDIS_URL", url);
    service = new RedisWakeupService(new MetricsService());
    await service.onModuleInit();
    expect(service.status()).toMatchObject({
      enabled: true,
      ready: true,
      durableStore: "POSTGRESQL",
    });
    const observer = createClient({
      url,
      socket: { reconnectStrategy: false },
    });
    observer.on("error", () => {});
    await observer.connect();
    try {
      await observer.del(MVP_WAKEUP_KEY);
      await service.notify();
      await service.notify();
      expect(await observer.lRange(MVP_WAKEUP_KEY, 0, -1)).toEqual(["1"]);
      expect(await observer.ttl(MVP_WAKEUP_KEY)).toBeGreaterThan(0);
      expect(await observer.ttl(MVP_WAKEUP_KEY)).toBeLessThanOrEqual(10);
      await service.wait();
      expect(await observer.lLen(MVP_WAKEUP_KEY)).toBe(0);
    } finally {
      observer.destroy();
    }
  });
  it("exposes degraded connectivity and falls back without claiming Redis delivery", async () => {
    vi.stubEnv("MVP_REDIS_ENABLED", "true");
    vi.stubEnv("MVP_REDIS_URL", "redis://127.0.0.1:1");
    service = new RedisWakeupService(new MetricsService());
    await service.onModuleInit();
    expect(service.status()).toMatchObject({
      enabled: true,
      ready: false,
      fallback: "POSTGRES_POLLING",
    });
    await service.notify();
    await service.wait();
  });
  it("requires verified TLS transport for production Redis configuration", async () => {
    vi.stubEnv("MVP_REDIS_ENABLED", "true");
    vi.stubEnv("MVP_REDIS_URL", url);
    vi.stubEnv("NODE_ENV", "production");
    service = new RedisWakeupService(new MetricsService());
    await service.onModuleInit();
    expect(service.status().ready).toBe(false);
  });
});
