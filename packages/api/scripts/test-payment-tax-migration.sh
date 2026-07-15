#!/usr/bin/env bash
set -euo pipefail

API_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION="$API_DIR/prisma/migrations/20260715150000_payment_tax_snapshots/migration.sql"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/viaeats-tax-migration-test.XXXXXX")"
DATA_DIR="$TMP_DIR/data"

cleanup() {
  if [[ -d "$DATA_DIR" ]]; then
    pg_ctl -D "$DATA_DIR" -m immediate stop >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

initdb -D "$DATA_DIR" -A trust -U postgres >/dev/null
pg_ctl -D "$DATA_DIR" -o "-F -h '' -k '$TMP_DIR'" -w start >/dev/null

psql -X -v ON_ERROR_STOP=1 -h "$TMP_DIR" -U postgres -d postgres >/dev/null <<'SQL'
CREATE TABLE "Product" ("id" TEXT PRIMARY KEY);
CREATE TABLE "Order" (
  "id" TEXT PRIMARY KEY,
  "paymentProvider" TEXT NOT NULL DEFAULT 'stripe',
  "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING'
);
CREATE TABLE "OrderItem" ("id" TEXT PRIMARY KEY);
INSERT INTO "Order" ("id") VALUES ('legacy');
UPDATE "Order" SET "paymentStatus" = 'PAID' WHERE "id" = 'legacy';
SQL

# Must be safe to retry manually in the current unbaselined production setup.
psql -X -v ON_ERROR_STOP=1 -h "$TMP_DIR" -U postgres -d postgres -f "$MIGRATION" >/dev/null
psql -X -v ON_ERROR_STOP=1 -h "$TMP_DIR" -U postgres -d postgres -f "$MIGRATION" >/dev/null

psql -X -v ON_ERROR_STOP=1 -h "$TMP_DIR" -U postgres -d postgres -At >/dev/null <<'SQL'
DO $$
DECLARE provider_default TEXT;
BEGIN
  SELECT column_default INTO provider_default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'Order' AND column_name = 'paymentProvider';
  IF provider_default IS NOT NULL THEN
    RAISE EXCEPTION 'paymentProvider still has unsafe default: %', provider_default;
  END IF;
  IF (SELECT "paymentProvider" FROM "Order" WHERE "id" = 'legacy') <> 'stripe' THEN
    RAISE EXCEPTION 'legacy provider value was rewritten';
  END IF;
  IF (SELECT "paymentEffectsCompletedAt" FROM "Order" WHERE "id" = 'legacy') IS NULL THEN
    RAISE EXCEPTION 'legacy paid row was not protected from effect replay';
  END IF;
  IF (SELECT COUNT(*) FROM pg_constraint WHERE conname IN (
    'Product_vatPercent_check',
    'Order_discount_components_nonnegative_check',
    'Order_foodVatPercent_check',
    'Order_deliveryVatPercent_check',
    'OrderItem_vatPercent_check'
  )) <> 5 THEN
    RAISE EXCEPTION 'tax constraints missing';
  END IF;
END $$;
SQL

if psql -X -v ON_ERROR_STOP=1 -h "$TMP_DIR" -U postgres -d postgres \
  -c 'INSERT INTO "Order" ("id", "paymentProvider") VALUES ('\''bad'\'', '\''mollie'\''); UPDATE "Order" SET "foodDiscountAmount" = -1 WHERE "id" = '\''bad'\'';' \
  >/dev/null 2>&1; then
  echo "Negative discount component unexpectedly passed" >&2
  exit 1
fi

echo "Payment/tax migration: idempotency, legacy preservation and constraints OK"
