CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

CREATE TABLE "StaffWorkingHour" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "businessMemberId" TEXT NOT NULL,
  "dayOfWeek" "DayOfWeek" NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "StaffWorkingHour_member_fkey" FOREIGN KEY ("businessId", "businessMemberId") REFERENCES "BusinessMember"("businessId", "id") ON DELETE CASCADE,
  CONSTRAINT "StaffWorkingHour_range_check" CHECK ("startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "startTime" < "endTime")
);
CREATE UNIQUE INDEX "StaffWorkingHour_member_day_range_key" ON "StaffWorkingHour"("businessMemberId", "dayOfWeek", "startTime", "endTime");
CREATE INDEX "StaffWorkingHour_business_member_day_active_idx" ON "StaffWorkingHour"("businessId", "businessMemberId", "dayOfWeek", "isActive");

CREATE TABLE "StaffTimeOff" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "businessMemberId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffTimeOff_member_fkey" FOREIGN KEY ("businessId", "businessMemberId") REFERENCES "BusinessMember"("businessId", "id") ON DELETE CASCADE,
  CONSTRAINT "StaffTimeOff_range_check" CHECK ("startsAt" < "endsAt")
);
CREATE INDEX "StaffTimeOff_business_member_range_idx" ON "StaffTimeOff"("businessId", "businessMemberId", "startsAt", "endsAt");

ALTER TABLE "Appointment"
  ADD COLUMN "staffMemberId" TEXT,
  ADD COLUMN "endsAt" TIMESTAMP(3),
  ADD COLUMN "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "customerNote" TEXT,
  ADD COLUMN "internalNote" TEXT,
  ADD COLUMN "price" DECIMAL(12,2),
  ADD COLUMN "currency" CHAR(3),
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledById" TEXT,
  ADD COLUMN "cancellationReason" TEXT;

UPDATE "Appointment" a
SET "staffMemberId" = bm."id"
FROM "Staff" s
JOIN "BusinessMember" bm ON bm."businessId" = s."businessId" AND bm."userId" = s."userId"
WHERE a."staffId" = s."id" AND a."businessId" = s."businessId";
UPDATE "Appointment" a
SET "endsAt" = a."startsAt" + make_interval(mins => s."durationMinutes"),
    "price" = s."price",
    "currency" = s."currency"
FROM "Service" s
WHERE s."id" = a."serviceId" AND s."businessId" = a."businessId";

ALTER TABLE "Appointment" ALTER COLUMN "endsAt" SET NOT NULL;
ALTER TABLE "Appointment" ALTER COLUMN "price" SET NOT NULL;
ALTER TABLE "Appointment" ALTER COLUMN "currency" SET NOT NULL;
ALTER TABLE "Appointment" DROP CONSTRAINT IF EXISTS "Appointment_staffId_fkey";
ALTER TABLE "Appointment" DROP CONSTRAINT IF EXISTS "Appointment_serviceId_fkey";
DROP INDEX IF EXISTS "Appointment_businessId_startsAt_idx";
DROP INDEX IF EXISTS "Appointment_staffId_startsAt_idx";
ALTER TABLE "Appointment" DROP COLUMN "staffId";
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_staffMember_fkey" FOREIGN KEY ("businessId", "staffMemberId") REFERENCES "BusinessMember"("businessId", "id") ON DELETE RESTRICT;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_service_fkey" FOREIGN KEY ("businessId", "serviceId") REFERENCES "Service"("businessId", "id") ON DELETE RESTRICT;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_cancelledBy_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_range_check" CHECK ("startsAt" < "endsAt");
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_price_check" CHECK ("price" >= 0);
CREATE INDEX "Appointment_business_start_status_idx" ON "Appointment"("businessId", "startsAt", "status");
CREATE INDEX "Appointment_business_staff_range_idx" ON "Appointment"("businessId", "staffMemberId", "startsAt", "endsAt");

-- PostgreSQL exclusion is the final defense against concurrent double booking.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_no_staff_overlap"
EXCLUDE USING gist (
  "businessId" WITH =,
  "staffMemberId" WITH =,
  tsrange("startsAt", "endsAt", '[)') WITH &&
)
WHERE ("staffMemberId" IS NOT NULL AND "status" IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS'));
