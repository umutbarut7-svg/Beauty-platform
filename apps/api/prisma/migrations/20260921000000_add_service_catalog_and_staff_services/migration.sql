-- Preserve legacy staff-profile assignments while introducing member-based assignments.
ALTER TABLE "StaffService" RENAME TO "StaffProfileService";
ALTER INDEX "StaffService_pkey" RENAME TO "StaffProfileService_pkey";
ALTER INDEX "StaffService_businessId_serviceId_idx" RENAME TO "StaffProfileService_businessId_serviceId_idx";

CREATE TABLE "ServiceCategory" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServiceCategory_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "ServiceCategory_businessId_slug_key" ON "ServiceCategory"("businessId", "slug");
CREATE UNIQUE INDEX "ServiceCategory_businessId_id_key" ON "ServiceCategory"("businessId", "id");
CREATE INDEX "ServiceCategory_businessId_isActive_sortOrder_idx" ON "ServiceCategory"("businessId", "isActive", "sortOrder");

-- Migrate the previous free-text category into tenant categories.
INSERT INTO "ServiceCategory" ("id", "businessId", "name", "slug")
SELECT 'cat-' || md5("businessId" || ':' || COALESCE(NULLIF("category", ''), 'General')),
       "businessId",
       COALESCE(NULLIF("category", ''), 'General'),
       'category-' || substr(md5(COALESCE(NULLIF("category", ''), 'General')), 1, 12)
FROM "Service"
GROUP BY "businessId", COALESCE(NULLIF("category", ''), 'General');

ALTER TABLE "Service"
  ADD COLUMN "categoryId" TEXT,
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "isBookable" BOOLEAN NOT NULL DEFAULT true;
UPDATE "Service" s
SET "categoryId" = c."id",
    "slug" = lower(regexp_replace(s."name", '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(s."id", 1, 8)
FROM "ServiceCategory" c
WHERE c."businessId" = s."businessId"
  AND c."name" = COALESCE(NULLIF(s."category", ''), 'General');
ALTER TABLE "Service" ALTER COLUMN "categoryId" SET NOT NULL;
ALTER TABLE "Service" ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "Service" DROP COLUMN "category";
ALTER TABLE "Service" ADD CONSTRAINT "Service_category_fkey" FOREIGN KEY ("businessId", "categoryId") REFERENCES "ServiceCategory"("businessId", "id") ON DELETE RESTRICT;
ALTER TABLE "Service" ADD CONSTRAINT "Service_duration_check" CHECK ("durationMinutes" > 0);
ALTER TABLE "Service" ADD CONSTRAINT "Service_buffers_check" CHECK ("bufferBeforeMinutes" >= 0 AND "bufferAfterMinutes" >= 0);
ALTER TABLE "Service" ADD CONSTRAINT "Service_price_check" CHECK ("price" >= 0);
CREATE UNIQUE INDEX "Service_businessId_slug_key" ON "Service"("businessId", "slug");
CREATE INDEX "Service_businessId_categoryId_isActive_idx" ON "Service"("businessId", "categoryId", "isActive");

CREATE UNIQUE INDEX "BusinessMember_businessId_id_key" ON "BusinessMember"("businessId", "id");
CREATE TABLE "StaffService" (
  "businessId" TEXT NOT NULL,
  "businessMemberId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "customPrice" DECIMAL(12,2),
  "customDurationMinutes" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffService_pkey" PRIMARY KEY ("businessMemberId", "serviceId"),
  CONSTRAINT "StaffService_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE,
  CONSTRAINT "StaffService_member_fkey" FOREIGN KEY ("businessId", "businessMemberId") REFERENCES "BusinessMember"("businessId", "id") ON DELETE CASCADE,
  CONSTRAINT "StaffService_service_fkey" FOREIGN KEY ("businessId", "serviceId") REFERENCES "Service"("businessId", "id") ON DELETE CASCADE,
  CONSTRAINT "StaffService_customPrice_check" CHECK ("customPrice" IS NULL OR "customPrice" >= 0),
  CONSTRAINT "StaffService_customDuration_check" CHECK ("customDurationMinutes" IS NULL OR "customDurationMinutes" > 0)
);
CREATE INDEX "StaffService_businessId_serviceId_isActive_idx" ON "StaffService"("businessId", "serviceId", "isActive");
