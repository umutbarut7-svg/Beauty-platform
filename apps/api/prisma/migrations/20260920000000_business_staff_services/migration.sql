-- Extend the existing tenant models without deleting business data.
CREATE TYPE "BusinessStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

ALTER TABLE "Business"
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "website" TEXT,
  ADD COLUMN "logoUrl" TEXT,
  ADD COLUMN "status" "BusinessStatus" NOT NULL DEFAULT 'ACTIVE';
UPDATE "Business" SET "slug" = lower(regexp_replace("name", '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr("id", 1, 8) WHERE "slug" IS NULL;
ALTER TABLE "Business" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");

ALTER TABLE "Location"
  ADD COLUMN "address" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "city" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "district" TEXT,
  ADD COLUMN "country" TEXT NOT NULL DEFAULT 'TR',
  ADD COLUMN "latitude" DECIMAL(9,6),
  ADD COLUMN "longitude" DECIMAL(9,6),
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX "Location_businessId_id_key" ON "Location"("businessId", "id");
CREATE INDEX "Location_businessId_isActive_idx" ON "Location"("businessId", "isActive");

ALTER TABLE "Staff"
  ADD COLUMN "firstName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "lastName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "displayName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "bio" TEXT,
  ADD COLUMN "avatarUrl" TEXT,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX "Staff_businessId_id_key" ON "Staff"("businessId", "id");
CREATE INDEX "Staff_businessId_isActive_idx" ON "Staff"("businessId", "isActive");
CREATE INDEX "Staff_userId_idx" ON "Staff"("userId");
UPDATE "Staff" SET "userId" = NULL WHERE "userId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" WHERE "User"."id" = "Staff"."userId");
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL;

ALTER TABLE "Service"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "durationMinutes" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "currency" CHAR(3) NOT NULL DEFAULT 'TRY',
  ADD COLUMN "category" TEXT,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX "Service_businessId_id_key" ON "Service"("businessId", "id");
CREATE INDEX "Service_businessId_isActive_idx" ON "Service"("businessId", "isActive");

CREATE TABLE "StaffLocation" (
  "businessId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffLocation_pkey" PRIMARY KEY ("staffId", "locationId"),
  CONSTRAINT "StaffLocation_staff_fkey" FOREIGN KEY ("businessId", "staffId") REFERENCES "Staff"("businessId", "id") ON DELETE CASCADE,
  CONSTRAINT "StaffLocation_location_fkey" FOREIGN KEY ("businessId", "locationId") REFERENCES "Location"("businessId", "id") ON DELETE CASCADE
);
CREATE INDEX "StaffLocation_businessId_locationId_idx" ON "StaffLocation"("businessId", "locationId");
INSERT INTO "StaffLocation" ("businessId", "staffId", "locationId")
SELECT "businessId", "id", "locationId" FROM "Staff" WHERE "locationId" IS NOT NULL;
ALTER TABLE "Staff" DROP CONSTRAINT IF EXISTS "Staff_locationId_fkey";
DROP INDEX IF EXISTS "Staff_businessId_locationId_idx";
ALTER TABLE "Staff" DROP COLUMN "locationId";

CREATE TABLE "StaffService" (
  "businessId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffService_pkey" PRIMARY KEY ("staffId", "serviceId"),
  CONSTRAINT "StaffService_staff_fkey" FOREIGN KEY ("businessId", "staffId") REFERENCES "Staff"("businessId", "id") ON DELETE CASCADE,
  CONSTRAINT "StaffService_service_fkey" FOREIGN KEY ("businessId", "serviceId") REFERENCES "Service"("businessId", "id") ON DELETE CASCADE
);
CREATE INDEX "StaffService_businessId_serviceId_idx" ON "StaffService"("businessId", "serviceId");
