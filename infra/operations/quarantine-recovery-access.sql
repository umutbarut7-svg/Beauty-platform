-- Only for a separate, physically isolated recovery database. Never production.
-- Acknowledgements prevent accidents; they do not establish isolation.
BEGIN;
SET LOCAL search_path = pg_catalog, public;
DO $$
BEGIN
  IF current_setting('orzell.restore_quarantine', true) IS DISTINCT FROM 'confirmed-offline'
     OR current_setting('orzell.auth_quarantine', true) IS DISTINCT FROM 'confirmed-offline-reset'
     OR current_setting('orzell.restore_database', true) IS DISTINCT FROM current_database() THEN
    RAISE EXCEPTION 'OFFLINE_RECOVERY_ACKNOWLEDGEMENTS_REQUIRED';
  END IF;
END $$;

LOCK TABLE public."User", public."RefreshSession", public."APICredential",
  public."APIClient", public."APIApplication", public."PushDevice",
  public."WebhookEndpoint", public."WebhookDelivery", public."MvpPhotoConsent",
  public."MvpPhoto", public."MvpPhotoAnalysis", public."MvpPrivacyEvent"
  IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE orzell_previous_revocations ON COMMIT DROP AS
SELECT id, "revokedAt" FROM public."MvpPhotoConsent" WHERE "revokedAt" IS NOT NULL;

-- This marker is deliberately not a bcrypt hash. Existing passwords cannot log in.
UPDATE public."User" SET "passwordHash" = '!orzell-recovery-disabled!', "updatedAt" = CURRENT_TIMESTAMP
WHERE "passwordHash" IS DISTINCT FROM '!orzell-recovery-disabled!';
UPDATE public."RefreshSession" SET "revokedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
WHERE "revokedAt" IS NULL;
UPDATE public."APICredential" SET "revokedAt" = CURRENT_TIMESTAMP WHERE "revokedAt" IS NULL;
UPDATE public."APIClient" SET status = 'REVOKED', "updatedAt" = CURRENT_TIMESTAMP WHERE status <> 'REVOKED';
UPDATE public."APIApplication" SET status = 'REVOKED', "updatedAt" = CURRENT_TIMESTAMP WHERE status <> 'REVOKED';
UPDATE public."PushDevice" SET "isActive" = false, "invalidatedAt" = COALESCE("invalidatedAt", CURRENT_TIMESTAMP),
  "updatedAt" = CURRENT_TIMESTAMP WHERE "isActive" OR "invalidatedAt" IS NULL;
UPDATE public."WebhookEndpoint" SET status = 'REVOKED', "updatedAt" = CURRENT_TIMESTAMP WHERE status <> 'REVOKED';
UPDATE public."WebhookDelivery" SET status = 'FAILED' WHERE status IN ('PENDING', 'RETRYING');

-- The snapshot cannot prove which consents were withdrawn later: invalidate all.
WITH invalidated AS (
  UPDATE public."MvpPhotoConsent" SET "revokedAt" = CURRENT_TIMESTAMP WHERE "revokedAt" IS NULL
  RETURNING id, "ownerId", "auditExpiresAt"
)
INSERT INTO public."MvpPrivacyEvent" (id, "ownerId", "resourceId", action, "correlationId", "expiresAt")
SELECT gen_random_uuid()::text, "ownerId", id, 'photo.restore.invalidated', gen_random_uuid()::text, "auditExpiresAt"
FROM invalidated;
UPDATE public."MvpPhoto" SET "revokedAt" = CURRENT_TIMESTAMP WHERE "revokedAt" IS NULL;
UPDATE public."MvpPhotoAnalysis" SET status = 'REVOKED', output = NULL, intent = '', target = '',
  answers = '[]'::jsonb, "matchingStatus" = NULL, "matchingRequestId" = NULL, "matchingOutput" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE status IS DISTINCT FROM 'REVOKED' OR output IS NOT NULL OR intent <> '' OR target <> ''
  OR answers IS DISTINCT FROM '[]'::jsonb OR "matchingStatus" IS NOT NULL
  OR "matchingRequestId" IS NOT NULL OR "matchingOutput" IS NOT NULL;
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_temp.orzell_previous_revocations p
    JOIN public."MvpPhotoConsent" c ON c.id = p.id WHERE c."revokedAt" IS DISTINCT FROM p."revokedAt") THEN
    RAISE EXCEPTION 'EXISTING_WITHDRAWAL_TIME_CHANGED';
  END IF;
END $$;
COMMIT;
