BEGIN;

ALTER TABLE "BusinessCustomer"
    ALTER COLUMN "firstName" DROP NOT NULL,
    ALTER COLUMN "lastName" DROP NOT NULL,
    ADD COLUMN "bookingProfile" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "alternateEmail" TEXT;

-- One canonical booking profile per tenant and account. Keep legacy rows and
-- their historical links intact, including deliberately archived profiles.
CREATE UNIQUE INDEX "BusinessCustomer_booking_profile_key"
    ON "BusinessCustomer" ("businessId", "userCustomerId")
    WHERE "bookingProfile";

-- Reuse a profile only when identity evidence is consistent. Never infer
-- identity from a name, a tenant-entered email, or a shared phone number.
WITH candidates AS (
    SELECT profile.id, profile."businessId",
           COALESCE(profile."userCustomerId", evidence.customer_id) AS customer_id,
           profile."archivedAt", profile."createdAt"
    FROM "BusinessCustomer" AS profile
    LEFT JOIN LATERAL (
        SELECT min(appointment."customerId") AS customer_id,
               count(DISTINCT appointment."customerId") AS customer_count
        FROM "Appointment" AS appointment
        WHERE appointment."businessId" = profile."businessId"
          AND appointment."businessCustomerId" = profile.id
    ) AS evidence ON true
    WHERE profile."mergedIntoId" IS NULL
      AND evidence.customer_count <= 1
      AND (profile."userCustomerId" IS NULL OR evidence.customer_id IS NULL
           OR profile."userCustomerId" = evidence.customer_id)
),
canonical AS (
    SELECT DISTINCT ON ("businessId", customer_id) id, "businessId", customer_id
    FROM candidates
    WHERE customer_id IS NOT NULL
    ORDER BY "businessId", customer_id, ("archivedAt" IS NOT NULL), "createdAt", id
)
UPDATE "BusinessCustomer" AS profile
SET "userCustomerId" = canonical.customer_id, "bookingProfile" = true
FROM canonical
WHERE profile.id = canonical.id AND profile."businessId" = canonical."businessId";

-- Backfill existing real accounts only. Unknown names and contact details
-- remain null. Existing non-null appointment links are never rewritten.
INSERT INTO "BusinessCustomer"
    (id, "businessId", "userCustomerId", "bookingProfile", source, "updatedAt")
SELECT gen_random_uuid()::text, booked."businessId", booked."customerId",
       true, 'BOOKING', CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT "businessId", "customerId"
    FROM "Appointment" WHERE "businessCustomerId" IS NULL
) AS booked
WHERE NOT EXISTS (
    SELECT 1 FROM "BusinessCustomer" AS profile
    WHERE profile."businessId" = booked."businessId"
      AND profile."userCustomerId" = booked."customerId"
      AND profile."bookingProfile"
);

UPDATE "Appointment" AS appointment
SET "businessCustomerId" = profile.id
FROM "BusinessCustomer" AS profile
WHERE appointment."businessCustomerId" IS NULL
  AND appointment."businessId" = profile."businessId"
  AND appointment."customerId" = profile."userCustomerId"
  AND profile."bookingProfile";

COMMIT;
