CREATE TYPE "BackgroundJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'RETRYING', 'DEAD_LETTER');

CREATE TABLE "IdempotencyRecord" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "statusCode" INTEGER,
  "response" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IdempotencyRecord_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "IdempotencyRecord_businessId_actorId_operation_keyHash_key" ON "IdempotencyRecord"("businessId", "actorId", "operation", "keyHash");
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

CREATE TABLE "InfrastructureCacheEntry" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "namespace" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InfrastructureCacheEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InfrastructureCacheEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InfrastructureCacheEntry_businessId_namespace_keyHash_key" ON "InfrastructureCacheEntry"("businessId", "namespace", "keyHash");
CREATE INDEX "InfrastructureCacheEntry_businessId_namespace_expiresAt_idx" ON "InfrastructureCacheEntry"("businessId", "namespace", "expiresAt");
CREATE INDEX "InfrastructureCacheEntry_expiresAt_idx" ON "InfrastructureCacheEntry"("expiresAt");

CREATE TABLE "BackgroundJob" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "BackgroundJobStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BackgroundJob_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BackgroundJob_businessId_type_idempotencyKey_key" ON "BackgroundJob"("businessId", "type", "idempotencyKey");
CREATE INDEX "BackgroundJob_status_availableAt_idx" ON "BackgroundJob"("status", "availableAt");
CREATE INDEX "BackgroundJob_businessId_status_createdAt_idx" ON "BackgroundJob"("businessId", "status", "createdAt");
