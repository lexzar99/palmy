#!/usr/bin/env bash
set -euo pipefail

API_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION="$API_DIR/prisma/migrations/20260807120000_platform_discount_funding/migration.sql"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/viaeats-discount-funding-test.XXXXXX")"
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
CREATE TABLE "UserDeal" (
  "id" TEXT PRIMARY KEY,
  "type" TEXT NOT NULL
);
CREATE TABLE "Deal" (
  "id" TEXT PRIMARY KEY,
  "isPersonalTemplate" BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE "Order" (
  "id" TEXT PRIMARY KEY,
  "foodDiscountAmount" INTEGER NOT NULL DEFAULT 0,
  "deliveryDiscountAmount" INTEGER NOT NULL DEFAULT 0,
  "userDealId" TEXT,
  "appliedDealId" TEXT
);
INSERT INTO "UserDeal" ("id", "type") VALUES
  ('ud-welcome', 'WELCOME'),
  ('ud-referral', 'REFERRAL_INVITEE'),
  ('ud-campaign', 'CAMPAIGN');
INSERT INTO "Deal" ("id", "isPersonalTemplate") VALUES
  ('deal-welcome', TRUE),
  ('deal-public', FALSE);
INSERT INTO "Order" (
  "id", "foodDiscountAmount", "deliveryDiscountAmount", "userDealId", "appliedDealId"
) VALUES
  ('legacy', 5000, 2000, NULL, NULL),
  ('bad', 5000, 2000, NULL, NULL),
  ('welcome-user-deal', 2500, 500, 'ud-welcome', NULL),
  ('referral-user-deal', 3000, 0, 'ud-referral', NULL),
  ('campaign-user-deal', 1500, 0, 'ud-campaign', NULL),
  ('automatic-welcome', 2000, 1000, NULL, 'deal-welcome'),
  ('public-deal', 1200, 0, NULL, 'deal-public'),
  ('orphan-user-deal', 1800, 200, 'ud-missing', NULL),
  ('orphan-deal', 1600, 0, NULL, 'deal-missing');
SQL

# The production patch must be retry-safe in the current manually baselined DB.
psql -X -v ON_ERROR_STOP=1 -h "$TMP_DIR" -U postgres -d postgres -f "$MIGRATION" >/dev/null
psql -X -v ON_ERROR_STOP=1 -h "$TMP_DIR" -U postgres -d postgres -f "$MIGRATION" >/dev/null

psql -X -v ON_ERROR_STOP=1 -h "$TMP_DIR" -U postgres -d postgres -At >/dev/null <<'SQL'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Order"
    WHERE "id" IN ('legacy', 'orphan-user-deal', 'orphan-deal')
      AND (
        "platformFundedFoodDiscountAmount" <> 0 OR
        "platformFundedDeliveryDiscountAmount" <> 0
      )
  ) THEN
    RAISE EXCEPTION 'unclassified or orphan legacy funding was guessed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "Order"
    WHERE "id" IN ('welcome-user-deal', 'referral-user-deal', 'automatic-welcome')
      AND (
        "platformFundedFoodDiscountAmount" <> "foodDiscountAmount" OR
        "platformFundedDeliveryDiscountAmount" <> "deliveryDiscountAmount"
      )
  ) THEN
    RAISE EXCEPTION 'durable platform-funded sources were not backfilled';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "Order"
    WHERE "id" IN ('campaign-user-deal', 'public-deal')
      AND ("platformFundedFoodDiscountAmount" <> 0 OR "platformFundedDeliveryDiscountAmount" <> 0)
  ) THEN
    RAISE EXCEPTION 'restaurant/unknown discounts were misclassified as platform-funded';
  END IF;
  IF (SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Order'
        AND column_name IN ('platformFundedFoodDiscountAmount', 'platformFundedDeliveryDiscountAmount')
        AND is_nullable = 'NO' AND column_default = '0') <> 2 THEN
    RAISE EXCEPTION 'funding columns/defaults are incomplete';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Order_platform_funded_discount_components_check'
      AND contype = 'c' AND convalidated
  ) THEN
    RAISE EXCEPTION 'validated funding constraint is missing';
  END IF;
END $$;
SQL

# Removing a durable source after backfill must neither erase nor re-guess the
# frozen order snapshot. Readiness, not the migration, is responsible for
# detecting the orphan and blocking launch until a two-person audit repairs it.
psql -X -v ON_ERROR_STOP=1 -h "$TMP_DIR" -U postgres -d postgres \
  -c 'DELETE FROM "UserDeal" WHERE "id" = '\''ud-welcome'\'';' >/dev/null
psql -X -v ON_ERROR_STOP=1 -h "$TMP_DIR" -U postgres -d postgres -f "$MIGRATION" >/dev/null
psql -X -v ON_ERROR_STOP=1 -h "$TMP_DIR" -U postgres -d postgres -At >/dev/null <<'SQL'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Order" o
    LEFT JOIN "UserDeal" ud ON ud."id" = o."userDealId"
    WHERE o."id" = 'welcome-user-deal'
      AND (
        o."platformFundedFoodDiscountAmount" <> o."foodDiscountAmount" OR
        o."platformFundedDeliveryDiscountAmount" <> o."deliveryDiscountAmount"
      )
  ) THEN
    RAISE EXCEPTION 'source deletion rewrote the frozen funding snapshot';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM "Order" o
    LEFT JOIN "UserDeal" ud ON ud."id" = o."userDealId"
    WHERE o."id" = 'welcome-user-deal'
      AND o."userDealId" IS NOT NULL
      AND ud."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'deleted source is not observable as an orphan';
  END IF;
END $$;
SQL

if psql -X -v ON_ERROR_STOP=1 -h "$TMP_DIR" -U postgres -d postgres \
  -c 'UPDATE "Order" SET "platformFundedFoodDiscountAmount" = -1 WHERE "id" = '\''bad'\'';' \
  >/dev/null 2>&1; then
  echo "Negative platform funding unexpectedly passed" >&2
  exit 1
fi
if psql -X -v ON_ERROR_STOP=1 -h "$TMP_DIR" -U postgres -d postgres \
  -c 'UPDATE "Order" SET "platformFundedFoodDiscountAmount" = 5001 WHERE "id" = '\''bad'\'';' \
  >/dev/null 2>&1; then
  echo "Food funding above discount unexpectedly passed" >&2
  exit 1
fi
if psql -X -v ON_ERROR_STOP=1 -h "$TMP_DIR" -U postgres -d postgres \
  -c 'UPDATE "Order" SET "platformFundedDeliveryDiscountAmount" = 2001 WHERE "id" = '\''bad'\'';' \
  >/dev/null 2>&1; then
  echo "Delivery funding above discount unexpectedly passed" >&2
  exit 1
fi

psql -X -v ON_ERROR_STOP=1 -h "$TMP_DIR" -U postgres -d postgres \
  -c 'UPDATE "Order" SET "platformFundedFoodDiscountAmount" = 5000, "platformFundedDeliveryDiscountAmount" = 2000 WHERE "id" = '\''bad'\'';' \
  >/dev/null

echo "Platform discount funding migration: idempotency, source backfill and constraints OK"
