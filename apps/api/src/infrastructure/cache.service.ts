import { createHash } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";

export interface TenantCache {
  get<T>(businessId: string, namespace: string, key: string): Promise<T | null>;
  set<T>(
    businessId: string,
    namespace: string,
    key: string,
    value: T,
    ttlMs: number,
  ): Promise<void>;
  delete(businessId: string, namespace: string, key: string): Promise<void>;
  invalidateNamespace(businessId: string, namespace: string): Promise<void>;
}

const hash = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

@Injectable()
export class DatabaseCacheService implements TenantCache {
  private readonly logger = new Logger(DatabaseCacheService.name);
  constructor(@Inject(PRISMA_SERVICE) private readonly db: PrismaService) {}
  async get<T>(businessId: string, namespace: string, key: string) {
    try {
      const record = await this.db.infrastructureCacheEntry.findUnique({
        where: {
          businessId_namespace_keyHash: {
            businessId,
            namespace,
            keyHash: hash(key),
          },
        },
      });
      if (!record || record.expiresAt <= new Date()) return null;
      return record.value as T;
    } catch {
      this.logger.warn({ event: "cache_unavailable", operation: "get" });
      return null;
    }
  }
  async set<T>(
    businessId: string,
    namespace: string,
    key: string,
    value: T,
    ttlMs: number,
  ) {
    if (!Number.isInteger(ttlMs) || ttlMs <= 0)
      throw new Error("Cache TTL must be a positive integer");
    try {
      const keyHash = hash(key);
      await this.db.infrastructureCacheEntry.upsert({
        where: {
          businessId_namespace_keyHash: { businessId, namespace, keyHash },
        },
        create: {
          businessId,
          namespace,
          keyHash,
          value,
          expiresAt: new Date(Date.now() + ttlMs),
        },
        update: { value, expiresAt: new Date(Date.now() + ttlMs) },
      });
    } catch {
      this.logger.warn({ event: "cache_unavailable", operation: "set" });
    }
  }
  async delete(businessId: string, namespace: string, key: string) {
    await this.db.infrastructureCacheEntry.deleteMany({
      where: { businessId, namespace, keyHash: hash(key) },
    });
  }
  async invalidateNamespace(businessId: string, namespace: string) {
    await this.db.infrastructureCacheEntry.deleteMany({
      where: { businessId, namespace },
    });
  }
}
