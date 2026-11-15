/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Injectable } from "@nestjs/common";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { createClient } from "redis";
import { MetricsService } from "./metrics.service.js";

export const MVP_WAKEUP_KEY = "beauty:mvp:wakeup:v1";
/** Redis carries one non-PII wakeup tick, never job authority or customer data. */
@Injectable()
export class RedisWakeupService implements OnModuleInit, OnModuleDestroy {
  private client?: ReturnType<typeof createClient>;
  private enabled = false;
  constructor(private readonly metrics: MetricsService) {}
  status() {
    return {
      enabled: this.enabled,
      ready: this.client?.isReady ?? false,
      durableStore: "POSTGRESQL",
      fallback: "POSTGRES_POLLING",
    };
  }
  async onModuleInit() {
    this.enabled = process.env.MVP_REDIS_ENABLED === "true";
    if (!this.enabled) return;
    try {
      const url = process.env.MVP_REDIS_URL;
      if (
        !url ||
        (process.env.NODE_ENV === "production" && !url.startsWith("rediss://"))
      )
        throw new Error("RedisConfigurationRequired");
      this.client = createClient({
        url,
        socket: { connectTimeout: 1000, reconnectStrategy: false },
      });
      this.client.on("error", () => this.metrics.dependencyFailure());
      await this.bounded(this.client.connect());
    } catch {
      this.degrade();
    }
  }
  async notify() {
    if (!this.client?.isReady) return;
    try {
      await this.bounded(
        this.client
          .multi()
          .lPush(MVP_WAKEUP_KEY, "1")
          .lTrim(MVP_WAKEUP_KEY, 0, 0)
          .expire(MVP_WAKEUP_KEY, 10)
          .exec(),
      );
    } catch {
      this.degrade();
    }
  }
  async wait() {
    if (!this.client?.isReady) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return;
    }
    try {
      await this.bounded(this.client.blPop(MVP_WAKEUP_KEY, 1));
    } catch {
      this.degrade();
    }
  }
  onModuleDestroy() {
    if (this.client?.isOpen) this.client.destroy();
  }
  private degrade() {
    this.metrics.dependencyFailure();
    this.onModuleDestroy();
    this.client = undefined;
  }
  private async bounded<T>(operation: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            this.onModuleDestroy();
            reject(new Error("RedisTimeout"));
          }, 1500);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
