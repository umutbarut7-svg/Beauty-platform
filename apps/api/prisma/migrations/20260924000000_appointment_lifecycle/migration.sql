-- Preserve PENDING/IN_PROGRESS for API compatibility; they represent BOOKED/IN_SERVICE.
-- CHECKED_IN is added by the preceding committed enum migration.

ALTER TABLE "Appointment"
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "checkedInAt" TIMESTAMP(3),
  ADD COLUMN "serviceStartedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "noShowAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Appointment_businessId_id_key"
  ON "Appointment"("businessId", "id");

CREATE TABLE "AppointmentStatusHistory" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessId" TEXT NOT NULL,
  "appointmentId" TEXT NOT NULL,
  "fromStatus" "AppointmentStatus",
  "toStatus" "AppointmentStatus" NOT NULL,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "changedById" TEXT NOT NULL,
  "reason" TEXT,
  CONSTRAINT "AppointmentStatusHistory_appointment_fkey"
    FOREIGN KEY ("businessId", "appointmentId")
    REFERENCES "Appointment"("businessId", "id") ON DELETE CASCADE,
  CONSTRAINT "AppointmentStatusHistory_changedBy_fkey"
    FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT
);
CREATE INDEX "AppointmentStatusHistory_business_appointment_changed_idx"
  ON "AppointmentStatusHistory"("businessId", "appointmentId", "changedAt", "id");

-- CHECKED_IN occupies a staff slot, just like the other operational states.
ALTER TABLE "Appointment" DROP CONSTRAINT IF EXISTS "Appointment_no_staff_overlap";
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_no_staff_overlap"
EXCLUDE USING gist (
  "businessId" WITH =,
  "staffMemberId" WITH =,
  tsrange("startsAt", "endsAt", '[)') WITH &&
)
WHERE ("staffMemberId" IS NOT NULL AND "status" IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS'));
