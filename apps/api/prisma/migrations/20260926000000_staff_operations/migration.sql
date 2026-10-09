CREATE TYPE "StaffTimeOffType" AS ENUM ('BREAK', 'TIME_OFF', 'BLOCKED', 'OTHER');

ALTER TABLE "Staff"
  ADD COLUMN "title" TEXT,
  ADD COLUMN "acceptsBookings" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "Staff_business_active_booking_sort_idx" ON "Staff"("businessId", "isActive", "acceptsBookings", "sortOrder");
DROP INDEX IF EXISTS "Staff_businessId_isActive_idx";

ALTER TABLE "StaffProfileService"
  ADD COLUMN "customPrice" DECIMAL(12,2),
  ADD COLUMN "customDurationMinutes" INTEGER,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "StaffProfileService" ADD CONSTRAINT "StaffProfileService_price_check" CHECK ("customPrice" IS NULL OR "customPrice" >= 0);
ALTER TABLE "StaffProfileService" ADD CONSTRAINT "StaffProfileService_duration_check" CHECK ("customDurationMinutes" IS NULL OR "customDurationMinutes" > 0);
CREATE INDEX "StaffProfileService_business_service_active_idx" ON "StaffProfileService"("businessId", "serviceId", "isActive");
DROP INDEX IF EXISTS "StaffProfileService_businessId_serviceId_idx";

ALTER TABLE "StaffWorkingHour"
  ALTER COLUMN "businessMemberId" DROP NOT NULL,
  ADD COLUMN "staffId" TEXT;
ALTER TABLE "StaffWorkingHour" ADD CONSTRAINT "StaffWorkingHour_staff_fkey" FOREIGN KEY ("businessId", "staffId") REFERENCES "Staff"("businessId", "id") ON DELETE CASCADE;
ALTER TABLE "StaffWorkingHour" ADD CONSTRAINT "StaffWorkingHour_owner_check" CHECK (("staffId" IS NOT NULL) <> ("businessMemberId" IS NOT NULL));
CREATE UNIQUE INDEX "StaffWorkingHour_staff_day_range_key" ON "StaffWorkingHour"("staffId", "dayOfWeek", "startTime", "endTime");
CREATE INDEX "StaffWorkingHour_business_staff_day_active_idx" ON "StaffWorkingHour"("businessId", "staffId", "dayOfWeek", "isActive");

ALTER TABLE "StaffTimeOff"
  ALTER COLUMN "businessMemberId" DROP NOT NULL,
  ADD COLUMN "staffId" TEXT,
  ADD COLUMN "type" "StaffTimeOffType" NOT NULL DEFAULT 'TIME_OFF',
  ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "StaffTimeOff" ADD CONSTRAINT "StaffTimeOff_staff_fkey" FOREIGN KEY ("businessId", "staffId") REFERENCES "Staff"("businessId", "id") ON DELETE CASCADE;
ALTER TABLE "StaffTimeOff" ADD CONSTRAINT "StaffTimeOff_createdBy_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "StaffTimeOff" ADD CONSTRAINT "StaffTimeOff_owner_check" CHECK (("staffId" IS NOT NULL) <> ("businessMemberId" IS NOT NULL));
CREATE INDEX "StaffTimeOff_business_staff_range_idx" ON "StaffTimeOff"("businessId", "staffId", "startsAt", "endsAt");

ALTER TABLE "Appointment" ADD COLUMN "staffId" TEXT;
UPDATE "Appointment" a SET "staffId" = s."id"
FROM "BusinessMember" bm JOIN "Staff" s ON s."businessId" = bm."businessId" AND s."userId" = bm."userId"
WHERE a."businessId" = bm."businessId" AND a."staffMemberId" = bm."id";
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_staff_fkey" FOREIGN KEY ("businessId", "staffId") REFERENCES "Staff"("businessId", "id") ON DELETE RESTRICT;
CREATE INDEX "Appointment_business_staffProfile_range_idx" ON "Appointment"("businessId", "staffId", "startsAt", "endsAt");

ALTER TABLE "Appointment" DROP CONSTRAINT IF EXISTS "Appointment_no_staff_overlap";
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_no_staff_overlap"
EXCLUDE USING gist ("businessId" WITH =, "staffId" WITH =, tsrange("startsAt", "endsAt", '[)') WITH &&)
WHERE ("staffId" IS NOT NULL AND "status" IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'));
