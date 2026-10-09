-- A location is optional for legacy appointments, but is required by the booking API.
ALTER TABLE "Appointment" ADD COLUMN "locationId" TEXT;

CREATE INDEX "Appointment_businessId_locationId_startsAt_idx"
  ON "Appointment"("businessId", "locationId", "startsAt");

ALTER TABLE "Appointment"
  ADD CONSTRAINT "Appointment_businessId_locationId_fkey"
  FOREIGN KEY ("businessId", "locationId")
  REFERENCES "Location"("businessId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
