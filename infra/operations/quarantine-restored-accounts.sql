-- Offline-only restore quarantine. This is not a user deletion request.
BEGIN;
DO $$
BEGIN
  IF current_setting('orzell.restore_quarantine', true) IS DISTINCT FROM 'confirmed-offline'
     OR current_setting('orzell.restore_database', true) IS DISTINCT FROM current_database()
  THEN RAISE EXCEPTION 'Offline restore acknowledgement and exact target database are required'; END IF;
END $$;
UPDATE "User" SET "restoreQuarantinedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
WHERE "restoreQuarantinedAt" IS NULL;
UPDATE "RefreshSession" SET "revokedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
WHERE "revokedAt" IS NULL;
COMMIT;
