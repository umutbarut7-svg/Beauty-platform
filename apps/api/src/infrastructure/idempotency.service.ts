/* eslint-disable @typescript-eslint/consistent-type-imports */
import { createHash } from "node:crypto";
import { ConflictException, Inject, Injectable } from "@nestjs/common";
import { PRISMA_SERVICE } from "../database/database.tokens.js";
import type { PrismaService } from "../database/prisma.service.js";
import { SecurityMonitoringService } from "./security-monitoring.service.js";

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export interface IdempotencyScope {
  businessId: string;
  actorId: string;
  operation: string;
}

@Injectable()
export class IdempotencyService {
  constructor(
    @Inject(PRISMA_SERVICE) private readonly db: PrismaService,
    private readonly security: SecurityMonitoringService,
  ) {}
  async reserve(
    scope: IdempotencyScope,
    key: string,
    requestFingerprint: string,
  ) {
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key))
      throw new ConflictException("Invalid idempotency key");
    const keyHash = digest(key);
    const requestHash = digest(requestFingerprint);
    try {
      return await this.db.idempotencyRecord.create({
        data: {
          ...scope,
          keyHash,
          requestHash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
    } catch (error) {
      const existing = await this.db.idempotencyRecord.findUnique({
        where: {
          businessId_actorId_operation_keyHash: { ...scope, keyHash },
        },
      });
      if (!existing) throw error;
      if (existing.requestHash !== requestHash) {
        await this.security.record("IDEMPOTENCY_REPLAY_REJECTED", "WARNING", {
          operation: scope.operation,
        });
        throw new ConflictException(
          "Idempotency key was used with another request",
        );
      }
      return existing;
    }
  }
  complete(id: string, statusCode: number, response: unknown) {
    return this.db.idempotencyRecord.update({
      where: { id },
      data: { statusCode, response },
    });
  }
}
