ALTER TABLE "BusinessOpportunity"
  ADD COLUMN "source" "BusinessMetricSource" NOT NULL DEFAULT 'DERIVED',
  ADD COLUMN "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "calculationVersion" TEXT NOT NULL DEFAULT 'business-rules-v1';
ALTER TABLE "BusinessRiskSignal"
  ADD COLUMN "source" "BusinessMetricSource" NOT NULL DEFAULT 'DERIVED',
  ADD COLUMN "calculationVersion" TEXT NOT NULL DEFAULT 'business-rules-v1';
ALTER TABLE "BusinessGrowthRecommendation"
  ADD COLUMN "source" "BusinessMetricSource" NOT NULL DEFAULT 'DERIVED',
  ADD COLUMN "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "calculationVersion" TEXT NOT NULL DEFAULT 'business-rules-v1';

CREATE INDEX "BusinessOpportunity_businessId_calculationVersion_idx"
  ON "BusinessOpportunity"("businessId", "calculationVersion");
CREATE INDEX "BusinessRiskSignal_businessId_calculationVersion_idx"
  ON "BusinessRiskSignal"("businessId", "calculationVersion");
CREATE INDEX "BusinessGrowthRecommendation_businessId_calculationVersion_idx"
  ON "BusinessGrowthRecommendation"("businessId", "calculationVersion");
