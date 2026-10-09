CREATE TYPE "AgentType" AS ENUM ('BOOKING', 'CUSTOMER_BEAUTY', 'BUSINESS_GROWTH', 'PROFESSIONAL_COPILOT');
CREATE TYPE "AgentInputSource" AS ENUM ('TEXT', 'VOICE', 'PHOTO');
CREATE TYPE "AgentSessionStatus" AS ENUM ('ACTIVE', 'NEEDS_INFORMATION', 'NEEDS_CONFIRMATION', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED', 'NO_MATCH');
CREATE TYPE "AgentConfirmationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED', 'EXECUTED');

CREATE TABLE "AgentSession" (
  "id" TEXT NOT NULL, "businessId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "agentType" "AgentType" NOT NULL, "inputSource" "AgentInputSource" NOT NULL,
  "activeGoal" TEXT, "intent" TEXT NOT NULL DEFAULT 'UNKNOWN', "entities" JSONB,
  "constraints" JSONB, "missingInformation" JSONB, "selectedBusinessId" TEXT,
  "selectedProfessionalId" TEXT, "selectedServiceId" TEXT, "selectedLocationId" TEXT,
  "selectedTimeRange" JSONB, "candidateResults" JSONB,
  "status" "AgentSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentSession_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE,
  CONSTRAINT "AgentSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "AgentSession_businessId_id_key" ON "AgentSession"("businessId", "id");
CREATE INDEX "AgentSession_businessId_userId_updatedAt_idx" ON "AgentSession"("businessId", "userId", "updatedAt");

CREATE TABLE "AgentTurn" (
  "id" TEXT NOT NULL, "sessionId" TEXT NOT NULL, "role" TEXT NOT NULL,
  "source" "AgentInputSource" NOT NULL, "content" TEXT NOT NULL, "intent" TEXT,
  "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentTurn_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession"("id") ON DELETE CASCADE
);
CREATE INDEX "AgentTurn_sessionId_createdAt_id_idx" ON "AgentTurn"("sessionId", "createdAt", "id");

CREATE TABLE "AgentPendingAction" (
  "id" TEXT NOT NULL, "businessId" TEXT NOT NULL, "sessionId" TEXT NOT NULL,
  "toolName" TEXT NOT NULL, "arguments" JSONB NOT NULL, "summary" TEXT NOT NULL,
  "status" "AgentConfirmationStatus" NOT NULL DEFAULT 'PENDING', "expiresAt" TIMESTAMP(3) NOT NULL,
  "confirmedAt" TIMESTAMP(3), "executedAt" TIMESTAMP(3), "result" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentPendingAction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentPendingAction_businessId_sessionId_fkey" FOREIGN KEY ("businessId", "sessionId") REFERENCES "AgentSession"("businessId", "id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "AgentPendingAction_businessId_id_key" ON "AgentPendingAction"("businessId", "id");
CREATE INDEX "AgentPendingAction_businessId_sessionId_status_idx" ON "AgentPendingAction"("businessId", "sessionId", "status");
CREATE INDEX "AgentPendingAction_expiresAt_status_idx" ON "AgentPendingAction"("expiresAt", "status");

CREATE TABLE "AgentToolExecution" (
  "id" TEXT NOT NULL, "businessId" TEXT NOT NULL, "sessionId" TEXT NOT NULL,
  "toolName" TEXT NOT NULL, "operationType" TEXT NOT NULL, "status" TEXT NOT NULL,
  "durationMs" INTEGER NOT NULL, "errorCode" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentToolExecution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AgentToolExecution_businessId_sessionId_fkey" FOREIGN KEY ("businessId", "sessionId") REFERENCES "AgentSession"("businessId", "id") ON DELETE CASCADE
);
CREATE INDEX "AgentToolExecution_businessId_sessionId_createdAt_idx" ON "AgentToolExecution"("businessId", "sessionId", "createdAt");
