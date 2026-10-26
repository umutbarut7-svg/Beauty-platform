-- Offline recovery only. This intentionally invalidates EVERY restored photo
-- consent; it cannot distinguish later withdrawals missing from the snapshot.
-- Call with psql -X -v ON_ERROR_STOP=1. Never use on a serving database.
BEGIN;
DO $$
BEGIN
  IF current_setting('orzell.restore_quarantine', true) IS DISTINCT FROM 'confirmed-offline'
     OR current_setting('orzell.restore_database', true) IS DISTINCT FROM current_database() THEN
    RAISE EXCEPTION 'RESTORE_QUARANTINE_REQUIRES_OFFLINE_DATABASE_ACKNOWLEDGEMENT';
  END IF;
END
$$;

LOCK TABLE "MvpPhotoConsent", "MvpPhoto", "MvpPhotoAnalysis", "MvpPrivacyEvent"
  IN SHARE ROW EXCLUSIVE MODE;

WITH invalidated AS (
  UPDATE "MvpPhotoConsent"
  SET "revokedAt" = CURRENT_TIMESTAMP
  WHERE "revokedAt" IS NULL
  RETURNING id, "ownerId", "auditExpiresAt"
)
INSERT INTO "MvpPrivacyEvent"
  (id, "ownerId", "resourceId", action, "correlationId", "expiresAt")
SELECT gen_random_uuid()::text, "ownerId", id, 'photo.restore.invalidated',
       gen_random_uuid()::text, "auditExpiresAt"
FROM invalidated;

UPDATE "MvpPhoto"
SET "revokedAt" = CURRENT_TIMESTAMP
WHERE "revokedAt" IS NULL;

UPDATE "MvpPhotoAnalysis"
SET status = 'REVOKED', output = NULL, intent = '', target = '',
    answers = '[]'::jsonb, "updatedAt" = CURRENT_TIMESTAMP
WHERE status IS DISTINCT FROM 'REVOKED' OR output IS NOT NULL
   OR intent <> '' OR target <> '' OR answers IS DISTINCT FROM '[]'::jsonb;
COMMIT;
