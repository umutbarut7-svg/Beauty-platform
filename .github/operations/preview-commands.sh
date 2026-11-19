#!/bin/bash
set -euo pipefail
# The acceptance screenshots bound the upload and withdrawal on 19 November
# (Istanbul UTC+3). Only an aggregate status leaves the preview database.
docker exec -i beauty-preview-postgres-1 psql -XAtq -v ON_ERROR_STOP=1 -U beauty -d beauty_preview <<'SQL'
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';
SET LOCAL TIME ZONE 'UTC';
WITH candidates AS (
  SELECT p.id, p."ownerId", p."deletedAt", p."revokedAt"
  FROM "MvpPhoto" p
  JOIN "MvpPhotoConsent" c ON c.id = p."consentId" AND c."ownerId" = p."ownerId"
  WHERE p."createdAt" >= timestamp '2026-11-19 07:19'
    AND p."createdAt" < timestamp '2026-11-19 07:23'
    AND c."revokedAt" >= p."createdAt"
    AND c."revokedAt" < timestamp '2026-11-19 07:38'
    AND p."revokedAt" IS NOT NULL
    AND EXISTS (SELECT 1 FROM "MvpPrivacyEvent" e
      WHERE e."ownerId" = p."ownerId" AND e."resourceId" = c.id
        AND e.action = 'photo.consent.withdrawn')
)
SELECT CASE
  WHEN count(*) = 0 THEN 'NO_MATCH'
  WHEN count(*) > 1 THEN 'AMBIGUOUS'
  WHEN count(*) FILTER (WHERE p."deletedAt" >= p."revokedAt" AND EXISTS (
    SELECT 1 FROM "MvpPrivacyEvent" e
    WHERE e."ownerId" = p."ownerId" AND e."resourceId" = p.id
      AND e.action = 'photo.object.erased'
  )) = 1 THEN 'ERASURE_RECORDED'
  ELSE 'ERASURE_UNCONFIRMED'
END
FROM candidates p;
COMMIT;
SQL
