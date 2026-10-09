CREATE TYPE "AIRunStatus" AS ENUM ('RUNNING','COMPLETED','FAILED','BLOCKED','NEEDS_INFORMATION','NO_MATCH','NOT_AVAILABLE');
CREATE TYPE "AISafetySeverity" AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
CREATE TYPE "AIKillSwitchScope" AS ENUM ('GLOBAL','TENANT','AGENT_TYPE','TOOL');
CREATE TABLE "AIRun" (
 "id" TEXT NOT NULL,"businessId" TEXT NOT NULL,"sessionId" TEXT NOT NULL,"userId" TEXT,"agentType" "AgentType" NOT NULL,
 "goal" TEXT,"detectedIntent" TEXT,"provider" TEXT,"tokenUsage" INTEGER NOT NULL DEFAULT 0,"estimatedCostMicros" INTEGER NOT NULL DEFAULT 0,
 "latencyMs" INTEGER,"retryCount" INTEGER NOT NULL DEFAULT 0,"toolCallCount" INTEGER NOT NULL DEFAULT 0,"status" "AIRunStatus" NOT NULL DEFAULT 'RUNNING',
 "errorCategory" TEXT,"retentionPolicy" TEXT NOT NULL,"expiresAt" TIMESTAMP(3) NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "AIRun_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "AIRun_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE,
 CONSTRAINT "AIRun_businessId_sessionId_fkey" FOREIGN KEY ("businessId","sessionId") REFERENCES "AgentSession"("businessId","id") ON DELETE CASCADE,
 CONSTRAINT "AIRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "AIRun_businessId_id_key" ON "AIRun"("businessId","id");
CREATE INDEX "AIRun_businessId_status_createdAt_idx" ON "AIRun"("businessId","status","createdAt");
CREATE INDEX "AIRun_businessId_agentType_createdAt_idx" ON "AIRun"("businessId","agentType","createdAt");
CREATE INDEX "AIRun_expiresAt_idx" ON "AIRun"("expiresAt");
CREATE TABLE "AITraceEvent" (
 "id" TEXT NOT NULL,"businessId" TEXT NOT NULL,"runId" TEXT NOT NULL,"type" TEXT NOT NULL,"version" INTEGER NOT NULL DEFAULT 1,"payload" JSONB,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AITraceEvent_pkey" PRIMARY KEY ("id"),CONSTRAINT "AITraceEvent_businessId_runId_fkey" FOREIGN KEY ("businessId","runId") REFERENCES "AIRun"("businessId","id") ON DELETE CASCADE
);
CREATE INDEX "AITraceEvent_businessId_runId_createdAt_id_idx" ON "AITraceEvent"("businessId","runId","createdAt","id");
CREATE INDEX "AITraceEvent_businessId_type_createdAt_idx" ON "AITraceEvent"("businessId","type","createdAt");
CREATE TABLE "AIEvaluation" (
 "id" TEXT NOT NULL,"businessId" TEXT NOT NULL,"runId" TEXT NOT NULL,"outcome" TEXT NOT NULL,"goalCompletion" INTEGER NOT NULL,"intentAccuracy" INTEGER NOT NULL,"toolAccuracy" INTEGER NOT NULL,"parameterCorrectness" INTEGER NOT NULL,"policyCompliance" INTEGER NOT NULL,"authorizationCompliance" INTEGER NOT NULL,"hallucinationRisk" INTEGER NOT NULL,"responseUsefulness" INTEGER NOT NULL,"responseSafety" INTEGER NOT NULL,"unnecessaryToolUsage" INTEGER NOT NULL,"costEfficiency" INTEGER NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"expiresAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "AIEvaluation_pkey" PRIMARY KEY ("id"),CONSTRAINT "AIEvaluation_businessId_runId_fkey" FOREIGN KEY ("businessId","runId") REFERENCES "AIRun"("businessId","id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "AIEvaluation_runId_key" ON "AIEvaluation"("runId");
CREATE INDEX "AIEvaluation_businessId_outcome_createdAt_idx" ON "AIEvaluation"("businessId","outcome","createdAt");
CREATE INDEX "AIEvaluation_expiresAt_idx" ON "AIEvaluation"("expiresAt");
CREATE TABLE "AISafetyIncident" (
 "id" TEXT NOT NULL,"businessId" TEXT NOT NULL,"runId" TEXT NOT NULL,"category" TEXT NOT NULL,"severity" "AISafetySeverity" NOT NULL,"evidence" JSONB,"blocked" BOOLEAN NOT NULL DEFAULT false,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"expiresAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "AISafetyIncident_pkey" PRIMARY KEY ("id"),CONSTRAINT "AISafetyIncident_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE,CONSTRAINT "AISafetyIncident_businessId_runId_fkey" FOREIGN KEY ("businessId","runId") REFERENCES "AIRun"("businessId","id") ON DELETE CASCADE
);
CREATE INDEX "AISafetyIncident_businessId_severity_createdAt_idx" ON "AISafetyIncident"("businessId","severity","createdAt");
CREATE INDEX "AISafetyIncident_expiresAt_idx" ON "AISafetyIncident"("expiresAt");
CREATE TABLE "AIKillSwitch" ("id" TEXT NOT NULL,"businessId" TEXT,"scope" "AIKillSwitchScope" NOT NULL,"target" TEXT NOT NULL,"enabled" BOOLEAN NOT NULL DEFAULT true,"reason" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "AIKillSwitch_pkey" PRIMARY KEY ("id"),CONSTRAINT "AIKillSwitch_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE);
CREATE UNIQUE INDEX "AIKillSwitch_businessId_scope_target_key" ON "AIKillSwitch"("businessId","scope","target");
CREATE INDEX "AIKillSwitch_scope_target_enabled_idx" ON "AIKillSwitch"("scope","target","enabled");
