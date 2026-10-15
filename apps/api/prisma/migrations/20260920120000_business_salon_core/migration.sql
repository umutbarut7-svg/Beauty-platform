-- Complete the salon core while preserving the existing tenant data.
CREATE TYPE "BusinessRole" AS ENUM ('BUSINESS_OWNER', 'BUSINESS_ADMIN', 'MANAGER', 'STAFF');
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

ALTER TABLE "BusinessMember" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "BusinessMember" ALTER COLUMN "role" TYPE "BusinessRole"
USING (CASE WHEN "role"::text IN ('BUSINESS_OWNER', 'BUSINESS_ADMIN', 'STAFF') THEN "role"::text ELSE 'STAFF' END)::"BusinessRole";

ALTER TABLE "Business"
  ADD COLUMN "coverImageUrl" TEXT,
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
  ADD COLUMN "currency" CHAR(3) NOT NULL DEFAULT 'TRY',
  ADD COLUMN "country" CHAR(2) NOT NULL DEFAULT 'TR',
  ADD COLUMN "city" TEXT,
  ADD COLUMN "district" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "latitude" DECIMAL(9,6),
  ADD COLUMN "longitude" DECIMAL(9,6);

CREATE TABLE "Branch" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "country" CHAR(2) NOT NULL DEFAULT 'TR',
  "city" TEXT NOT NULL,
  "district" TEXT,
  "address" TEXT NOT NULL,
  "latitude" DECIMAL(9,6),
  "longitude" DECIMAL(9,6),
  "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Branch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Branch_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "Branch_businessId_slug_key" ON "Branch"("businessId", "slug");
CREATE UNIQUE INDEX "Branch_businessId_id_key" ON "Branch"("businessId", "id");
CREATE INDEX "Branch_businessId_isActive_idx" ON "Branch"("businessId", "isActive");

CREATE TABLE "BusinessSettings" (
  "businessId" TEXT NOT NULL PRIMARY KEY,
  "defaultCurrency" CHAR(3) NOT NULL DEFAULT 'TRY',
  "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
  "bookingEnabled" BOOLEAN NOT NULL DEFAULT true,
  "onlinePaymentEnabled" BOOLEAN NOT NULL DEFAULT false,
  "cancellationEnabled" BOOLEAN NOT NULL DEFAULT true,
  "cancellationWindowMinutes" INTEGER NOT NULL DEFAULT 120,
  "appointmentIntervalMinutes" INTEGER NOT NULL DEFAULT 15,
  "customerCanChooseStaff" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BusinessSettings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE
);
INSERT INTO "BusinessSettings" ("businessId", "defaultCurrency", "timezone")
SELECT "id", "currency", "timezone" FROM "Business" ON CONFLICT ("businessId") DO NOTHING;

CREATE TABLE "WorkingHour" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "branchId" TEXT,
  "dayOfWeek" "DayOfWeek" NOT NULL,
  "isOpen" BOOLEAN NOT NULL DEFAULT true,
  "openTime" TEXT,
  "closeTime" TEXT,
  CONSTRAINT "WorkingHour_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkingHour_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE,
  CONSTRAINT "WorkingHour_branch_fkey" FOREIGN KEY ("businessId", "branchId") REFERENCES "Branch"("businessId", "id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "WorkingHour_business_branch_day_key" ON "WorkingHour"("businessId", "branchId", "dayOfWeek");
CREATE UNIQUE INDEX "WorkingHour_business_day_key" ON "WorkingHour"("businessId", "dayOfWeek") WHERE "branchId" IS NULL;
CREATE INDEX "WorkingHour_businessId_branchId_idx" ON "WorkingHour"("businessId", "branchId");
