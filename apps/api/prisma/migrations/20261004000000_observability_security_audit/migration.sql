CREATE TYPE "AuditResult" AS ENUM ('SUCCEEDED', 'DENIED', 'FAILED');
CREATE TYPE "SecuritySeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

ALTER TABLE "BackgroundJob"
  ADD COLUMN "correlationId" TEXT,
  ADD COLUMN "actorId" TEXT;
UPDATE "BackgroundJob" SET "correlationId" = "id" WHERE "correlationId" IS NULL;
ALTER TABLE "BackgroundJob" ALTER COLUMN "correlationId" SET NOT NULL;
CREATE INDEX "BackgroundJob_correlationId_idx" ON "BackgroundJob"("correlationId");

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "actorId" TEXT,
  "actorType" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "requestId" TEXT,
  "correlationId" TEXT,
  "metadata" JSONB,
  "result" "AuditResult" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditLog_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AuditLog_businessId_createdAt_idx" ON "AuditLog"("businessId", "createdAt");
CREATE INDEX "AuditLog_businessId_resourceType_resourceId_createdAt_idx" ON "AuditLog"("businessId", "resourceType", "resourceId", "createdAt");
CREATE INDEX "AuditLog_businessId_actorId_createdAt_idx" ON "AuditLog"("businessId", "actorId", "createdAt");

CREATE TABLE "SecurityEvent" (
  "id" TEXT NOT NULL,
  "businessId" TEXT,
  "actorId" TEXT,
  "actorType" TEXT,
  "type" TEXT NOT NULL,
  "severity" "SecuritySeverity" NOT NULL,
  "requestId" TEXT,
  "route" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SecurityEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SecurityEvent_businessId_createdAt_idx" ON "SecurityEvent"("businessId", "createdAt");
CREATE INDEX "SecurityEvent_type_severity_createdAt_idx" ON "SecurityEvent"("type", "severity", "createdAt");

CREATE TABLE "AbuseLimitBucket" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AbuseLimitBucket_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AbuseLimitBucket_scope_keyHash_windowStart_key" ON "AbuseLimitBucket"("scope", "keyHash", "windowStart");
CREATE INDEX "AbuseLimitBucket_expiresAt_idx" ON "AbuseLimitBucket"("expiresAt");
