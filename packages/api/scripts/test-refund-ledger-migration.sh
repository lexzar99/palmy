#!/usr/bin/env bash
set -euo pipefail

API_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION="$API_DIR/prisma/migrations/20260715223000_durable_refund_ledger/migration.sql"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/viaeats-refund-ledger.XXXXXX")"
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
CREATE TABLE "Order" ("id" TEXT PRIMARY KEY);
INSERT INTO "Order" ("id") VALUES ('order-1'), ('order-2');
SQL

"${PSQL[@]}" -f "$MIGRATION" >/dev/null
"${PSQL[@]}" -f "$MIGRATION" >/dev/null

"${PSQL[@]}" >/dev/null <<'SQL'
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'PaymentRefund') <> 19 THEN
    RAISE EXCEPTION 'refund ledger columns missing';
  END IF;
  IF (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = current_schema() AND indexname IN (
    'PaymentRefund_idempotencyKey_key',
    'PaymentRefund_provider_refundRef_key',
    'PaymentRefund_orderId_createdAt_idx',
    'PaymentRefund_provider_status_lastSeenAt_idx'
  )) <> 4 THEN
    RAISE EXCEPTION 'refund ledger indexes missing';
  END IF;
  IF (SELECT COUNT(*) FROM pg_trigger WHERE tgname IN (
    'PaymentRefund_validate_update', 'PaymentRefund_block_hard_delete'
  ) AND NOT tgisinternal) <> 2 THEN
    RAISE EXCEPTION 'refund ledger guards missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PaymentRefund_orderId_fkey'
      AND conrelid = '"PaymentRefund"'::regclass
      AND confdeltype = 'r'
  ) THEN
    RAISE EXCEPTION 'refund ledger restrict FK missing';
  END IF;
END $$;

INSERT INTO "PaymentRefund" (
  "id", "orderId", "provider", "paymentRef", "refundRef", "idempotencyKey",
  "amount", "cumulativeAmount", "status", "source", "actorAdminId", "reason", "updatedAt"
) VALUES (
  'ledger-1', 'order-1', 'mollie', 'tr_1', NULL, 've-ref-one',
  2500, 2500, 'REQUESTED', 'ADMIN', 'admin-1', 'Kundärende', NOW()
);

-- The only allowed enrichments are lifecycle state/timestamps and attaching
-- the previously unknown PSP reference/timestamp once.
UPDATE "PaymentRefund"
SET "refundRef" = 're_1', "providerCreatedAt" = NOW(), "status" = 'PENDING',
    "lastSeenAt" = NOW(), "updatedAt" = NOW()
WHERE "id" = 'ledger-1';
UPDATE "PaymentRefund"
SET "status" = 'REFUNDED', "completedAt" = NOW(), "lastSeenAt" = NOW(), "updatedAt" = NOW()
WHERE "id" = 'ledger-1';
SQL

expect_failure() {
  local label="$1"
  local sql="$2"
  if "${PSQL[@]}" -c "$sql" >/dev/null 2>&1; then
    echo "$label unexpectedly passed" >&2
    exit 1
  fi
}

expect_failure "Duplicate idempotency key" \
  "INSERT INTO \"PaymentRefund\" (\"id\", \"orderId\", \"provider\", \"paymentRef\", \"idempotencyKey\", \"amount\", \"cumulativeAmount\", \"status\", \"source\", \"updatedAt\") VALUES ('ledger-dup-key', 'order-1', 'mollie', 'tr_1', 've-ref-one', 100, 2600, 'REQUESTED', 'ADMIN', NOW());"

expect_failure "Duplicate PSP refund reference" \
  "INSERT INTO \"PaymentRefund\" (\"id\", \"orderId\", \"provider\", \"paymentRef\", \"refundRef\", \"idempotencyKey\", \"amount\", \"cumulativeAmount\", \"status\", \"source\", \"completedAt\", \"updatedAt\") VALUES ('ledger-dup-ref', 'order-1', 'mollie', 'tr_1', 're_1', 've-ref-two', 100, 2600, 'REFUNDED', 'WEBHOOK', NOW(), NOW());"

expect_failure "Economic amount mutation" \
  "UPDATE \"PaymentRefund\" SET \"amount\" = 2499, \"updatedAt\" = NOW() WHERE \"id\" = 'ledger-1';"

expect_failure "Order reassignment" \
  "UPDATE \"PaymentRefund\" SET \"orderId\" = 'order-2', \"updatedAt\" = NOW() WHERE \"id\" = 'ledger-1';"

expect_failure "PSP reference replacement" \
  "UPDATE \"PaymentRefund\" SET \"refundRef\" = 're_other', \"updatedAt\" = NOW() WHERE \"id\" = 'ledger-1';"

expect_failure "PSP timestamp replacement" \
  "UPDATE \"PaymentRefund\" SET \"providerCreatedAt\" = NOW() + INTERVAL '1 second', \"updatedAt\" = NOW() WHERE \"id\" = 'ledger-1';"

expect_failure "Completed lifecycle regression" \
  "UPDATE \"PaymentRefund\" SET \"status\" = 'PENDING', \"updatedAt\" = NOW() WHERE \"id\" = 'ledger-1';"

"${PSQL[@]}" >/dev/null <<'SQL'
DO $$
DECLARE
  original_completed_at TIMESTAMP(3);
BEGIN
  SELECT "completedAt" INTO original_completed_at
  FROM "PaymentRefund" WHERE "id" = 'ledger-1';
  UPDATE "PaymentRefund"
  SET "completedAt" = original_completed_at + INTERVAL '1 second', "updatedAt" = NOW()
  WHERE "id" = 'ledger-1';
  IF (SELECT "completedAt" FROM "PaymentRefund" WHERE "id" = 'ledger-1')
     IS DISTINCT FROM original_completed_at THEN
    RAISE EXCEPTION 'completion timestamp changed after it became final';
  END IF;
END $$;
SQL

expect_failure "Invalid cumulative amount" \
  "INSERT INTO \"PaymentRefund\" (\"id\", \"orderId\", \"provider\", \"paymentRef\", \"idempotencyKey\", \"amount\", \"cumulativeAmount\", \"status\", \"source\", \"updatedAt\") VALUES ('ledger-bad-amount', 'order-1', 'mollie', 'tr_1', 've-ref-bad', 500, 499, 'REQUESTED', 'ADMIN', NOW());"

expect_failure "Refund hard delete" \
  "DELETE FROM \"PaymentRefund\" WHERE \"id\" = 'ledger-1';"

expect_failure "Order delete with refund evidence" \
  "DELETE FROM \"Order\" WHERE \"id\" = 'order-1';"

echo "Refund ledger migration: retry, dedupe, exact amounts, one-time reference attach, immutability, RESTRICT and hard-delete guards OK"
