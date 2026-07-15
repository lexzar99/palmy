#!/usr/bin/env bash
set -euo pipefail

API_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT_DIR="$(cd "$API_DIR/../.." && pwd)"
BASELINE="$ROOT_DIR/docs/database/baseline/20260715_schema.sql"
SCHEMA="$API_DIR/prisma/schema.prisma"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/viaeats-baseline-test.XXXXXX")"
DATA_DIR="$TMP_DIR/data"

cleanup() {
  if [[ -d "$DATA_DIR" ]]; then
    pg_ctl -D "$DATA_DIR" -m immediate stop >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if [[ ! -s "$BASELINE" ]]; then
  echo "Baseline SQL saknas: $BASELINE" >&2
  exit 1
fi

initdb -D "$DATA_DIR" -A trust -U postgres >/dev/null
pg_ctl -D "$DATA_DIR" -o "-F -h '' -k '$TMP_DIR'" -w start >/dev/null

psql -X -v ON_ERROR_STOP=1 -h "$TMP_DIR" -U postgres -d postgres -f "$BASELINE" >/dev/null

ENCODED_SOCKET="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$TMP_DIR")"
DATABASE_URL="postgresql://postgres@localhost/postgres?host=$ENCODED_SOCKET"

DATABASE_URL="$DATABASE_URL" DIRECT_URL="$DATABASE_URL" \
  pnpm --dir "$API_DIR" exec prisma migrate diff \
    --from-url "$DATABASE_URL" \
    --to-schema-datamodel "$SCHEMA" \
    --exit-code >/dev/null

DATABASE_URL="$DATABASE_URL" DIRECT_URL="$DATABASE_URL" \
  pnpm --dir "$API_DIR" db:readiness >/dev/null

# Historical refund rows are a data-readiness concern, not something the
# structural migration may fabricate. Prove readiness fails until exact
# individual PSP evidence exists and then recovers when the ledger matches.
psql -X -v ON_ERROR_STOP=1 -h "$TMP_DIR" -U postgres -d postgres >/dev/null <<'SQL'
INSERT INTO "Order" (
  "id", "orderNumber", "type", "customerName", "customerPhone", "total",
  "paymentProvider", "paymentStatus", "refundAmount", "updatedAt"
) VALUES (
  'historical-refund-order', 'HIST-REF-1', 'PICKUP', 'Historisk kund',
  '0700000000', 100, 'mollie', 'REFUNDED', 100, NOW()
);
SQL

if DATABASE_URL="$DATABASE_URL" DIRECT_URL="$DATABASE_URL" \
  pnpm --dir "$API_DIR" db:readiness >/dev/null 2>&1; then
  echo "Readiness accepterade historisk refund utan PSP-ledger" >&2
  exit 1
fi

psql -X -v ON_ERROR_STOP=1 -h "$TMP_DIR" -U postgres -d postgres >/dev/null <<'SQL'
INSERT INTO "PaymentRefund" (
  "id", "orderId", "provider", "paymentRef", "refundRef", "idempotencyKey",
  "amount", "cumulativeAmount", "status", "source", "completedAt", "updatedAt"
) VALUES (
  'historical-refund-ledger', 'historical-refund-order', 'mollie', 'tr_hist',
  're_hist', 've-remote-ref-historical', 100, 100, 'REFUNDED',
  'REFUND_RECONCILE', NOW(), NOW()
);
SQL

DATABASE_URL="$DATABASE_URL" DIRECT_URL="$DATABASE_URL" \
  pnpm --dir "$API_DIR" db:readiness >/dev/null

# The consistency check is symmetric. A crash after writing PSP evidence but
# before updating Order must fail readiness even if the stale order still says
# PAID. An off-by-one local amount must fail as well.
psql -X -v ON_ERROR_STOP=1 -h "$TMP_DIR" -U postgres -d postgres >/dev/null <<'SQL'
UPDATE "Order"
SET "paymentStatus" = 'PAID'
WHERE "id" = 'historical-refund-order';
SQL

if DATABASE_URL="$DATABASE_URL" DIRECT_URL="$DATABASE_URL" \
  pnpm --dir "$API_DIR" db:readiness >/dev/null 2>&1; then
  echo "Readiness accepterade PAID-order med slutförd refund-ledger" >&2
  exit 1
fi

psql -X -v ON_ERROR_STOP=1 -h "$TMP_DIR" -U postgres -d postgres >/dev/null <<'SQL'
UPDATE "Order"
SET "paymentStatus" = 'REFUNDED', "refundAmount" = 99
WHERE "id" = 'historical-refund-order';
SQL

if DATABASE_URL="$DATABASE_URL" DIRECT_URL="$DATABASE_URL" \
  pnpm --dir "$API_DIR" db:readiness >/dev/null 2>&1; then
  echo "Readiness accepterade refundbelopp som avvek från ledgern" >&2
  exit 1
fi

psql -X -v ON_ERROR_STOP=1 -h "$TMP_DIR" -U postgres -d postgres >/dev/null <<'SQL'
UPDATE "Order"
SET "refundAmount" = 100
WHERE "id" = 'historical-refund-order';

INSERT INTO "Order" (
  "id", "orderNumber", "type", "customerName", "customerPhone", "total",
  "paymentProvider", "paymentStatus", "updatedAt"
) VALUES (
  'active-refund-order', 'ACTIVE-REF-1', 'PICKUP', 'Aktiv kund',
  '0700000001', 100, 'mollie', 'PAID', NOW()
);

INSERT INTO "PaymentRefund" (
  "id", "orderId", "provider", "paymentRef", "idempotencyKey",
  "amount", "cumulativeAmount", "status", "source", "updatedAt"
) VALUES (
  'active-refund-ledger', 'active-refund-order', 'mollie', 'tr_active',
  've-ref-active-readiness', 100, 100, 'UNKNOWN', 'ADMIN', NOW()
);
SQL

if DATABASE_URL="$DATABASE_URL" DIRECT_URL="$DATABASE_URL" \
  pnpm --dir "$API_DIR" db:readiness >/dev/null 2>&1; then
  echo "Readiness accepterade PAID-order med aktiv/UNKNOWN refund-ledger" >&2
  exit 1
fi

psql -X -v ON_ERROR_STOP=1 -h "$TMP_DIR" -U postgres -d postgres >/dev/null <<'SQL'
UPDATE "Order"
SET "paymentStatus" = 'REFUNDING'
WHERE "id" = 'active-refund-order';
SQL

DATABASE_URL="$DATABASE_URL" DIRECT_URL="$DATABASE_URL" \
  pnpm --dir "$API_DIR" db:readiness >/dev/null

echo "Schema-baseline: Prisma matchar; readiness kräver exakt och symmetrisk Order/PaymentRefund-konsistens"
