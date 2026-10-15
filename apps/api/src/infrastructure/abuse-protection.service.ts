import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";

export type AbuseScope =
  | "IP"
  | "ACTOR"
  | "TENANT"
  | "ENDPOINT"
  | "AI_TENANT"
  | "AI_USER"
  | "AI_SESSION"
  | "AI_AGENT_TYPE"
  | "GROWTH_CODE"
  | "GROWTH_INVITE"
  | "PREDICTION_RECOMPUTE";
export interface RateLimitPolicy {
  scope: AbuseScope;
  limit: number;
  windowMs: number;
}

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

@Injectable()
export class AbuseProtectionService {
  constructor(@Inject(PRISMA_SERVICE) private readonly db: PrismaService) {}
  async consume(policy: RateLimitPolicy, identifier: string, now = new Date()) {
    if (!Number.isInteger(policy.limit) || policy.limit < 1)
      throw new Error("Rate limit must be a positive integer");
    if (!Number.isInteger(policy.windowMs) || policy.windowMs < 1000)
      throw new Error("Rate-limit window must be at least 1000ms");
    const windowStart = new Date(
      Math.floor(now.getTime() / policy.windowMs) * policy.windowMs,
    );
    const keyHash = hash(identifier);
    const bucket = await this.db.abuseLimitBucket.upsert({
      where: {
        scope_keyHash_windowStart: {
          scope: policy.scope,
          keyHash,
          windowStart,
        },
      },
      create: {
        scope: policy.scope,
        keyHash,
        windowStart,
        expiresAt: new Date(windowStart.getTime() + policy.windowMs * 2),
      },
      update: { count: { increment: 1 } },
    });
    return {
      allowed: bucket.count <= policy.limit,
      remaining: Math.max(0, policy.limit - bucket.count),
      resetAt: new Date(windowStart.getTime() + policy.windowMs),
    };
  }
}
