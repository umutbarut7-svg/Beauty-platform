#!/usr/bin/env bash
set -euo pipefail

# This smoke test is deliberately restricted to the disposable Stage 32 CI
# PostgreSQL service. It must never be pointed at a developer or production DB.
admin_url="${STAGE32_POSTGRES_ADMIN_URL:-postgresql://postgres:postgres@localhost:5432/postgres}"
upgrade_db="beauty_platform_upgrade_ci"

case "$admin_url" in
  postgresql://postgres:postgres@localhost:5432/postgres) ;;
  *)
    echo "Refusing to run the Stage 32 upgrade test outside its disposable CI database." >&2
    exit 64
    ;;
esac

upgrade_url="postgresql://postgres:postgres@localhost:5432/${upgrade_db}"
migrations_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/migrations" && pwd)"
split_migration="20260923235959_appointment_checked_in_enum"

psql "$admin_url" -X -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${upgrade_db}"
psql "$admin_url" -X -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${upgrade_db}"

for migration in "$migrations_dir"/*/migration.sql; do
  if [[ "$migration" == *"/$split_migration/"* ]]; then
    break
  fi
  psql "$upgrade_url" -X -q -v ON_ERROR_STOP=1 -f "$migration"
done

psql "$upgrade_url" -X -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO "User" (id, email, "passwordHash", "updatedAt")
VALUES ('stage32-user', 'stage32@example.test', 'not-a-real-password-hash', CURRENT_TIMESTAMP);
INSERT INTO "Customer" (id, "userId", "updatedAt")
VALUES ('stage32-customer', 'stage32-user', CURRENT_TIMESTAMP);
INSERT INTO "Business" (id, name, slug, "updatedAt")
VALUES ('stage32-business', 'Stage 32 Fixture', 'stage-32-fixture', CURRENT_TIMESTAMP);
INSERT INTO "ServiceCategory" (id, "businessId", name, slug)
VALUES ('stage32-category', 'stage32-business', 'Fixture', 'fixture');
INSERT INTO "Service" (id, "businessId", name, "categoryId", slug)
VALUES ('stage32-service', 'stage32-business', 'Fixture Service', 'stage32-category', 'fixture-service');
INSERT INTO "Appointment" (
  id, "businessId", "customerId", "serviceId", "startsAt", "endsAt", price, currency
) VALUES (
  'stage32-appointment', 'stage32-business', 'stage32-customer', 'stage32-service',
  CURRENT_TIMESTAMP + INTERVAL '1 day', CURRENT_TIMESTAMP + INTERVAL '1 day 30 minutes', 100, 'TRY'
);
SQL

apply_remaining=false
for migration in "$migrations_dir"/*/migration.sql; do
  if [[ "$migration" == *"/$split_migration/"* ]]; then
    apply_remaining=true
  fi
  if [[ "$apply_remaining" == true ]]; then
    psql "$upgrade_url" -X -q -v ON_ERROR_STOP=1 -f "$migration"
  fi
done

preserved="$({ psql "$upgrade_url" -X -A -t -v ON_ERROR_STOP=1 <<'SQL'
SELECT count(*)
FROM "Appointment"
WHERE id = 'stage32-appointment'
  AND "businessId" = 'stage32-business'
  AND "customerId" = 'stage32-customer';
SQL
} | tr -d '[:space:]')"

if [[ "$preserved" != "1" ]]; then
  echo "Representative appointment was not preserved by the migration upgrade." >&2
  exit 1
fi

echo "Stage 32 representative-data migration upgrade passed."
