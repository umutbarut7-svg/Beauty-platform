-- The result belongs to the existing owner-scoped, expiring consultation.
-- No retention extension, default provider action or catalog reindex is introduced.
ALTER TABLE "MvpPhotoAnalysis"
  ADD COLUMN "matchingStatus" TEXT,
  ADD COLUMN "matchingRequestId" TEXT,
  ADD COLUMN "matchingOutput" JSONB;
