import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { ApiPrincipal } from "./public-api.types.js";
export interface PublicRateLimiter {
  consume(
    principal: ApiPrincipal,
    operation: string,
  ): Promise<{ limit: number; remaining: number; resetAt: string }>;
}
@Injectable()
export class PublicApiRateLimitService implements PublicRateLimiter {
  private readonly limit = 120;
  constructor(@Inject(PRISMA_SERVICE) private readonly db: PrismaService) {}
  async consume(p: ApiPrincipal, operation: string) {
    const now = Date.now(),
      windowStart = new Date(Math.floor(now / 60000) * 60000),
      resetAt = new Date(windowStart.getTime() + 60000);
    const result = await this.db.$transaction(async (tx: PrismaService) => {
      const lock = `public-api-rate:${p.clientId}:${p.businessId}:${operation}`;
      await tx.$queryRawUnsafe(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        lock,
      );
      const row = await tx.apiRateLimitBucket.upsert({
        where: {
          clientId_businessId_operation_windowStart: {
            clientId: p.clientId,
            businessId: p.businessId,
            operation,
            windowStart,
          },
        },
        create: {
          clientId: p.clientId,
          businessId: p.businessId,
          operation,
          windowStart,
          count: 1,
          expiresAt: resetAt,
        },
        update: { count: { increment: 1 } },
      });
      return row.count;
    });
    if (result > this.limit)
      throw new HttpException(
        {
          code: "RATE_LIMITED",
          limit: this.limit,
          remaining: 0,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((resetAt.getTime() - now) / 1000),
          ),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    return {
      limit: this.limit,
      remaining: this.limit - result,
      resetAt: resetAt.toISOString(),
    };
  }
}
