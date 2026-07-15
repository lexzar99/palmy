#!/usr/bin/env bash
set -euo pipefail

API_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION="$API_DIR/prisma/migrations/20260715220000_payout_late_refund_recovery/migration.sql"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/viaeats-payout-recovery.XXXXXX")"
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
PSQL=(psql -X -v ON_ERROR_STOP=1 -h "$TMP_DIR" -U postgres -d postgres)

"${PSQL[@]}" >/dev/null <<'SQL'
CREATE TABLE "Restaurant" ("id" TEXT PRIMARY KEY);
CREATE TABLE "RestaurantPayout" (
  "id" TEXT PRIMARY KEY,
  "restaurantId" TEXT NOT NULL REFERENCES "Restaurant"("id"),
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "adjustmentAmount" INTEGER NOT NULL DEFAULT 0,
  "payoutAmount" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'DRAFT'
);
INSERT INTO "Restaurant" ("id") VALUES ('r1'), ('r2');
INSERT INTO "RestaurantPayout" (
  "id", "restaurantId", "periodStart", "periodEnd", "adjustmentAmount", "payoutAmount", "status"
) VALUES
  ('source', 'r1', '2026-06-01', '2026-06-30', 2500, 100000, 'PAID'),
  ('target', 'r1', '2026-07-01', '2026-07-31', 0, 80000, 'APPROVED'),
  ('other-target', 'r2', '2026-07-01', '2026-07-31', 0, 50000, 'APPROVED');
SQL

"${PSQL[@]}" -f "$MIGRATION" >/dev/null
"${PSQL[@]}" -f "$MIGRATION" >/dev/null

"${PSQL[@]}" >/dev/null <<'SQL'
DO $$
BEGIN
  IF (SELECT "manualAdjustmentAmount" FROM "RestaurantPayout" WHERE "id" = 'source') <> 2500 THEN
    RAISE EXCEPTION 'legacy adjustment was not preserved';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'RestaurantPayout' AND column_name = 'adjustmentAmount'
  ) THEN
    RAISE EXCEPTION 'ambiguous legacy adjustment column remains';
  END IF;
  IF (SELECT COUNT(*) FROM pg_indexes WHERE indexname IN (
    'PayoutRecoveryAllocation_sourcePayoutId_targetPayoutId_key',
    'PayoutRecoveryAllocation_sourcePayoutId_status_idx',
    'PayoutRecoveryAllocation_targetPayoutId_status_idx'
  )) <> 3 THEN
    RAISE EXCEPTION 'recovery indexes missing';
  END IF;
  IF (SELECT COUNT(*) FROM pg_trigger WHERE tgname IN (
    'PayoutRecoveryAllocation_validate',
    'PayoutRecoveryAllocation_block_hard_delete'
  ) AND NOT tgisinternal) <> 2 THEN
    RAISE EXCEPTION 'recovery guards missing';
  END IF;
END $$;

INSERT INTO "PayoutRecoveryAllocation" (
  "id", "sourcePayoutId", "targetPayoutId", "amount", "status", "updatedAt"
) VALUES ('allocation', 'source', 'target', 15000, 'RESERVED', NOW());
SQL

if "${PSQL[@]}" -c \
  'INSERT INTO "PayoutRecoveryAllocation" ("id", "sourcePayoutId", "targetPayoutId", "amount", "status", "updatedAt") VALUES ('\''cross-restaurant'\'', '\''source'\'', '\''other-target'\'', 100, '\''RESERVED'\'', NOW());' \
  >/dev/null 2>&1; then
  echo "Cross-restaurant recovery unexpectedly passed" >&2
  exit 1
fi

"${PSQL[@]}" >/dev/null <<'SQL'
UPDATE "RestaurantPayout" SET "status" = 'PAID' WHERE "id" = 'target';
UPDATE "PayoutRecoveryAllocation" SET "status" = 'APPLIED', "appliedAt" = NOW() WHERE "id" = 'allocation';
SQL

if "${PSQL[@]}" -c \
  'UPDATE "PayoutRecoveryAllocation" SET "amount" = 14999 WHERE "id" = '\''allocation'\'';' \
  >/dev/null 2>&1; then
  echo "Applied recovery amount unexpectedly changed" >&2
  exit 1
fi

if "${PSQL[@]}" -c \
  'DELETE FROM "PayoutRecoveryAllocation" WHERE "id" = '\''allocation'\'';' \
  >/dev/null 2>&1; then
  echo "Recovery allocation hard-delete unexpectedly passed" >&2
  exit 1
fi

echo "Payout recovery migration: retry, legacy copy, tenant guard, APPLIED immutability and hard-delete guard OK"
