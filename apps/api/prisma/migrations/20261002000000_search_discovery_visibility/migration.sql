ALTER TABLE "Business"
  ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isVerified" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Business_isPublic_status_city_district_idx" ON "Business"("isPublic", "status", "city", "district");
CREATE INDEX "Business_isPublic_isVerified_idx" ON "Business"("isPublic", "isVerified");
