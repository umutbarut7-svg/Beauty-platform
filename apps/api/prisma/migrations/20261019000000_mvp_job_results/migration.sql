CREATE TABLE "BeautyJobResult" (
  "passportPublishedAt" TIMESTAMP(3),
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "summary" VARCHAR(2000) NOT NULL CHECK (length(trim("summary")) > 0),
  "recordedById" TEXT NOT NULL,
  "idempotencyKey" VARCHAR(100) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BeautyJobResult_businessId_appointmentId_key" UNIQUE ("businessId", "appointmentId"),
  CONSTRAINT "BeautyJobResult_businessId_id_key" UNIQUE ("businessId", "id"),
  CONSTRAINT "BeautyJobResult_businessId_idempotencyKey_key" UNIQUE ("businessId", "idempotencyKey"),
  CONSTRAINT "BeautyJobResult_businessId_appointmentId_fkey" FOREIGN KEY ("businessId", "appointmentId") REFERENCES "Appointment"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "BeautyJobResult_createdAt_id_idx" ON "BeautyJobResult"("createdAt", "id");
CREATE TABLE "BeautyJobSatisfaction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "resultId" TEXT NOT NULL,
  "customerUserId" TEXT NOT NULL,
  "outcome" VARCHAR(20) NOT NULL CHECK ("outcome" IN ('SATISFIED','UNSATISFIED','UNSURE')),
  "idempotencyKey" VARCHAR(100) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BeautyJobSatisfaction_businessId_resultId_key" UNIQUE ("businessId", "resultId"),
  CONSTRAINT "BeautyJobSatisfaction_businessId_idempotencyKey_key" UNIQUE ("businessId", "idempotencyKey"),
  CONSTRAINT "BeautyJobSatisfaction_businessId_resultId_fkey" FOREIGN KEY ("businessId", "resultId") REFERENCES "BeautyJobResult"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
