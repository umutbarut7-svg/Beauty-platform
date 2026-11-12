SELECT NOT EXISTS (SELECT FROM public."User" WHERE "passwordHash" <> '!orzell-recovery-disabled!')
 AND NOT EXISTS (SELECT FROM public."RefreshSession" WHERE "revokedAt" IS NULL)
 AND NOT EXISTS (SELECT FROM public."APICredential" WHERE "revokedAt" IS NULL)
 AND NOT EXISTS (SELECT FROM public."APIClient" WHERE status <> 'REVOKED')
 AND NOT EXISTS (SELECT FROM public."APIApplication" WHERE status <> 'REVOKED')
 AND NOT EXISTS (SELECT FROM public."PushDevice" WHERE "isActive" OR "invalidatedAt" IS NULL)
 AND NOT EXISTS (SELECT FROM public."WebhookEndpoint" WHERE status <> 'REVOKED')
 AND NOT EXISTS (SELECT FROM public."WebhookDelivery" WHERE status IN ('PENDING', 'RETRYING'))
 AND NOT EXISTS (SELECT FROM public."MvpPhotoConsent" WHERE "revokedAt" IS NULL)
 AND NOT EXISTS (SELECT FROM public."MvpPhoto" WHERE "revokedAt" IS NULL)
 AND NOT EXISTS (SELECT FROM public."MvpPhotoAnalysis" WHERE status <> 'REVOKED'
   OR output IS NOT NULL OR intent <> '' OR target <> '' OR answers IS DISTINCT FROM '[]'::jsonb
   OR "matchingStatus" IS NOT NULL OR "matchingRequestId" IS NOT NULL OR "matchingOutput" IS NOT NULL);
