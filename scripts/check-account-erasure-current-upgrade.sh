#!/usr/bin/env bash
set -euo pipefail

# Only the disposable CI PostgreSQL service is accepted. This does not inspect
# or migrate the live database. Start with the actual 1151 delivery migrations,
# then apply the four earlier-dated account-erasure migrations as pending work.
test "${CI:-}" = true
test "${DATABASE_URL:-}" = 'postgresql://postgres:postgres@localhost:5432/beauty_platform_ci?schema=public'
baseline=9c487dc425d157a2a5bb1de9bc48beab63eda90c
upgrade_url='postgresql://postgres:postgres@localhost:5432/beauty_erasure_upgrade_ci'
admin_url='postgresql://postgres:postgres@localhost:5432/postgres'
test "$(git rev-parse "$baseline^{commit}")" = "$baseline"
upgrade_root=$(mktemp -d)
trap 'rm -rf "$upgrade_root"' EXIT
git archive "$baseline" apps/api/prisma | tar -x -C "$upgrade_root"
psql "$admin_url" -X -v ON_ERROR_STOP=1 -c 'CREATE DATABASE beauty_erasure_upgrade_ci'
DATABASE_URL="$upgrade_url" pnpm --filter @beauty-platform/api exec prisma migrate deploy --schema "$upgrade_root/apps/api/prisma/schema.prisma"

psql "$upgrade_url" -X -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO "User" (id, email, "passwordHash", "updatedAt")
VALUES ('erasure-upgrade-user', 'erasure-upgrade@example.test', 'synthetic-not-a-login-hash', CURRENT_TIMESTAMP);
INSERT INTO "Customer" (id, "userId", "updatedAt")
VALUES ('erasure-upgrade-customer', 'erasure-upgrade-user', CURRENT_TIMESTAMP);
INSERT INTO "Business" (id, name, slug, "updatedAt") VALUES
('erasure-upgrade-buyer', 'Synthetic buyer', 'erasure-upgrade-buyer', CURRENT_TIMESTAMP),
('erasure-upgrade-supplier', 'Synthetic supplier', 'erasure-upgrade-supplier', CURRENT_TIMESTAMP);
INSERT INTO "CatalogProduct" (id, "businessId", sku, name, price, currency, unit, "stockQuantity", "updatedAt")
VALUES ('erasure-upgrade-product', 'erasure-upgrade-supplier', 'FIXTURE', 'Synthetic product', 20, 'TRY', 'UNIT', 10, CURRENT_TIMESTAMP);
INSERT INTO "InventoryOperation" (id, "businessId", "actorId", "keyHash", "requestHash", type, response)
VALUES ('erasure-upgrade-operation', 'erasure-upgrade-supplier', 'erasure-upgrade-user', 'synthetic-key', 'synthetic-request', 'MOVEMENT', '{"kind":"APPOINTMENT_CONSUMPTION","syntheticReceipt":true}');
INSERT INTO "InventoryMovement" (id, "businessId", "productId", "operationId", direction, quantity, "quantityAfter", reason)
VALUES ('erasure-upgrade-movement', 'erasure-upgrade-supplier', 'erasure-upgrade-product', 'erasure-upgrade-operation', 'OUT', 2, 10, 'Synthetic material fixture');
INSERT INTO "B2BQuoteRequest" (id, "buyerBusinessId", "supplierBusinessId", "productId", "productName", sku, unit, quantity, "buyerNote", "requestedBy", "respondedBy", "keyHash", "requestHash", "updatedAt")
VALUES ('erasure-upgrade-quote', 'erasure-upgrade-buyer', 'erasure-upgrade-supplier', 'erasure-upgrade-product', 'Synthetic product', 'FIXTURE', 'UNIT', 2, 'Synthetic note', 'erasure-upgrade-user', 'erasure-upgrade-user', 'synthetic-key', 'synthetic-request', CURRENT_TIMESTAMP);
INSERT INTO "MvpPhotoConsent" (id, "ownerId", "policyVersion", "noticeHash", "expiresAt", "auditExpiresAt")
VALUES ('erasure-upgrade-consent', 'erasure-upgrade-user', 'synthetic-policy', repeat('0',64), CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP + INTERVAL '90 days');
INSERT INTO "MvpPhoto" (id, "ownerId", "consentId", "objectKey", mime, bytes, "uploadExpiresAt", "expiresAt")
VALUES ('erasure-upgrade-photo', 'erasure-upgrade-user', 'erasure-upgrade-consent', 'synthetic-not-a-storage-object', 'image/png', 1, CURRENT_TIMESTAMP - INTERVAL '1 hour', CURRENT_TIMESTAMP + INTERVAL '1 day');
INSERT INTO "MvpPhotoAnalysis" (id, "ownerId", "photoId", intent, target, answers, status, output, "matchingStatus", "matchingRequestId", "matchingOutput", "expiresAt", "updatedAt")
VALUES ('erasure-upgrade-analysis', 'erasure-upgrade-user', 'erasure-upgrade-photo', 'synthetic', 'synthetic', '[]', 'PLAN', '{"steps":["synthetic"]}', 'READY', 'synthetic-request', '[{"businessId":"erasure-upgrade-buyer"}]', CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP);
CREATE TABLE erasure_upgrade_before AS
SELECT 'User'::text AS model, to_jsonb(r) AS record FROM "User" r WHERE id='erasure-upgrade-user'
UNION ALL SELECT 'CatalogProduct', to_jsonb(r) FROM "CatalogProduct" r WHERE id='erasure-upgrade-product'
UNION ALL SELECT 'InventoryOperation', to_jsonb(r) FROM "InventoryOperation" r WHERE id='erasure-upgrade-operation'
UNION ALL SELECT 'InventoryMovement', to_jsonb(r) FROM "InventoryMovement" r WHERE id='erasure-upgrade-movement'
UNION ALL SELECT 'B2BQuoteRequest', to_jsonb(r) FROM "B2BQuoteRequest" r WHERE id='erasure-upgrade-quote'
UNION ALL SELECT 'MvpPhotoAnalysis', to_jsonb(r) FROM "MvpPhotoAnalysis" r WHERE id='erasure-upgrade-analysis';
SQL

DATABASE_URL="$upgrade_url" pnpm --filter @beauty-platform/api prisma:migrate
DATABASE_URL="$upgrade_url" pnpm --filter @beauty-platform/api exec prisma migrate status
psql "$upgrade_url" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE changed integer;
BEGIN
  IF (SELECT count(*) FROM erasure_upgrade_before) <> 6 THEN RAISE EXCEPTION 'Incomplete baseline fixtures'; END IF;
  WITH after_records AS (
    SELECT 'User'::text AS model, to_jsonb(r) - 'restoreQuarantinedAt' AS record FROM "User" r WHERE id='erasure-upgrade-user'
    UNION ALL SELECT 'CatalogProduct', to_jsonb(r) FROM "CatalogProduct" r WHERE id='erasure-upgrade-product'
    UNION ALL SELECT 'InventoryOperation', to_jsonb(r) FROM "InventoryOperation" r WHERE id='erasure-upgrade-operation'
    UNION ALL SELECT 'InventoryMovement', to_jsonb(r) FROM "InventoryMovement" r WHERE id='erasure-upgrade-movement'
    UNION ALL SELECT 'B2BQuoteRequest', to_jsonb(r) FROM "B2BQuoteRequest" r WHERE id='erasure-upgrade-quote'
    UNION ALL SELECT 'MvpPhotoAnalysis', to_jsonb(r) FROM "MvpPhotoAnalysis" r WHERE id='erasure-upgrade-analysis'
  )
  SELECT count(*) INTO changed FROM (
    (SELECT * FROM erasure_upgrade_before EXCEPT SELECT * FROM after_records)
    UNION ALL
    (SELECT * FROM after_records EXCEPT SELECT * FROM erasure_upgrade_before)
  ) differences;
  IF changed <> 0 THEN RAISE EXCEPTION 'Existing delivered records changed during account-erasure upgrade'; END IF;
  IF EXISTS (SELECT 1 FROM "User" WHERE "restoreQuarantinedAt" IS NOT NULL)
    OR EXISTS (SELECT 1 FROM "AccountDeletionRequest")
    OR EXISTS (SELECT 1 FROM "AccountDeletionEvidence")
  THEN RAISE EXCEPTION 'Schema upgrade must not quarantine or erase accounts'; END IF;
END $$;
SQL
echo 'PASS: actual 1151 migrations upgraded; account, saved matches, inventory operation/movement, product and B2B quote unchanged.'
