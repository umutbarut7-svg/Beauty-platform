CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "MvpPhotoConsent" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "policyVersion" VARCHAR(100) NOT NULL,
    "noticeHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "auditExpiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MvpPhotoConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MvpPhoto" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "uploadExpiresAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MvpPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MvpPhotoAnalysis" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "intent" VARCHAR(1000) NOT NULL,
    "target" VARCHAR(1000) NOT NULL,
    "answers" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "output" JSONB,
    "provider" TEXT,
    "model" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MvpPhotoAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MvpPrivacyEvent" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MvpPrivacyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MvpCatalogVector" (
    "serviceId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
    "businessUpdatedAt" TIMESTAMP(3) NOT NULL,
    "indexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MvpCatalogVector_pkey" PRIMARY KEY ("serviceId","model")
);

-- CreateTable
CREATE TABLE "MvpVerificationRequest" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "policyVersion" VARCHAR(100) NOT NULL,
    "answers" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evidenceExpiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MvpVerificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MvpPhotoConsent_ownerId_expiresAt_idx" ON "MvpPhotoConsent"("ownerId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MvpPhotoConsent_ownerId_id_key" ON "MvpPhotoConsent"("ownerId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MvpPhoto_objectKey_key" ON "MvpPhoto"("objectKey");

-- CreateIndex
CREATE INDEX "MvpPhoto_expiresAt_deletedAt_idx" ON "MvpPhoto"("expiresAt", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MvpPhoto_ownerId_id_key" ON "MvpPhoto"("ownerId", "id");

-- CreateIndex
CREATE INDEX "MvpPhotoAnalysis_ownerId_expiresAt_idx" ON "MvpPhotoAnalysis"("ownerId", "expiresAt");

-- CreateIndex
CREATE INDEX "MvpPrivacyEvent_ownerId_createdAt_idx" ON "MvpPrivacyEvent"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "MvpPrivacyEvent_createdAt_idx" ON "MvpPrivacyEvent"("createdAt");

-- CreateIndex
CREATE INDEX "MvpPrivacyEvent_expiresAt_idx" ON "MvpPrivacyEvent"("expiresAt");

-- CreateIndex
CREATE INDEX "MvpCatalogVector_businessId_idx" ON "MvpCatalogVector"("businessId");

-- CreateIndex
CREATE INDEX "MvpVerificationRequest_businessId_createdAt_idx" ON "MvpVerificationRequest"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "MvpVerificationRequest_status_createdAt_idx" ON "MvpVerificationRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MvpVerificationRequest_evidenceExpiresAt_idx" ON "MvpVerificationRequest"("evidenceExpiresAt");

-- AddForeignKey
ALTER TABLE "MvpPhotoConsent" ADD CONSTRAINT "MvpPhotoConsent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MvpPhoto" ADD CONSTRAINT "MvpPhoto_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MvpPhoto" ADD CONSTRAINT "MvpPhoto_ownerId_consentId_fkey" FOREIGN KEY ("ownerId", "consentId") REFERENCES "MvpPhotoConsent"("ownerId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MvpPhotoAnalysis" ADD CONSTRAINT "MvpPhotoAnalysis_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MvpPhotoAnalysis" ADD CONSTRAINT "MvpPhotoAnalysis_ownerId_photoId_fkey" FOREIGN KEY ("ownerId", "photoId") REFERENCES "MvpPhoto"("ownerId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MvpPrivacyEvent" ADD CONSTRAINT "MvpPrivacyEvent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MvpCatalogVector" ADD CONSTRAINT "MvpCatalogVector_businessId_serviceId_fkey" FOREIGN KEY ("businessId", "serviceId") REFERENCES "Service"("businessId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MvpCatalogVector" ADD CONSTRAINT "MvpCatalogVector_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MvpVerificationRequest" ADD CONSTRAINT "MvpVerificationRequest_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;


CREATE INDEX "MvpCatalogVector_embedding_hnsw_idx" ON "MvpCatalogVector" USING hnsw (embedding vector_cosine_ops);
