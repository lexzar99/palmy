#!/usr/bin/env bash
set -euo pipefail

API_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION="$API_DIR/prisma/migrations/20260715203000_durable_customer_notifications/migration.sql"
TMP_DIR="$(mktemp -d "/tmp/viaeats-push-test.XXXXXX")"
DATA_DIR="$TMP_DIR/data"
PORT=$((20000 + ($$ % 20000)))

cleanup() {
  if [[ -d "$DATA_DIR" ]]; then
    pg_ctl -D "$DATA_DIR" -m immediate stop >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

initdb -D "$DATA_DIR" -A trust -U postgres >/dev/null
if ! pg_ctl -D "$DATA_DIR" -o "-F -p $PORT -h '' -k '$TMP_DIR'" -l "$TMP_DIR/postgres.log" -w start >/dev/null; then
  cat "$TMP_DIR/postgres.log" >&2
  exit 1
fi
PSQL=(psql -X -v ON_ERROR_STOP=1 -h "$TMP_DIR" -p "$PORT" -U postgres -d postgres)

"${PSQL[@]}" >/dev/null <<'SQL'
CREATE TABLE "User" ("id" TEXT PRIMARY KEY);
CREATE TABLE "Order" ("id" TEXT PRIMARY KEY);
CREATE TABLE "LaunchEvent" ("id" TEXT PRIMARY KEY, "sessionId" TEXT);
CREATE TABLE "LaunchLead" ("id" TEXT PRIMARY KEY, "sessionId" TEXT, "referrer" TEXT);
CREATE TABLE "Restaurant" ("id" TEXT PRIMARY KEY);
CREATE TABLE "RestaurantPayout" (
  "id" TEXT PRIMARY KEY,
  "restaurantId" TEXT NOT NULL,
  CONSTRAINT "RestaurantPayout_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "User" ("id") VALUES ('u1');
INSERT INTO "Order" ("id") VALUES ('o1');
INSERT INTO "Restaurant" ("id") VALUES ('r1');
INSERT INTO "RestaurantPayout" ("id", "restaurantId") VALUES ('p1', 'r1');
SQL

# Must be safe to retry manually against the unbaselined production schema.
"${PSQL[@]}" -f "$MIGRATION" >/dev/null
"${PSQL[@]}" -f "$MIGRATION" >/dev/null

"${PSQL[@]}" >/dev/null <<'SQL'
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN (
    'DeviceInstallation', 'DeviceOrderSubscription', 'NotificationOutbox', 'NotificationDelivery'
  )) <> 4 THEN
    RAISE EXCEPTION 'durable notification tables missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'DeviceInstallation_tokenHash_key') THEN
    RAISE EXCEPTION 'token hash uniqueness missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'NotificationOutbox_dedupeKey_key') THEN
    RAISE EXCEPTION 'outbox dedupe uniqueness missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'RestaurantPayout' AND c.conname = 'RestaurantPayout_restaurantId_fkey'
      AND c.confdeltype = 'r'
  ) THEN
    RAISE EXCEPTION 'payout restaurant FK is not RESTRICT';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'LaunchEvent') THEN
    RAISE EXCEPTION 'obsolete LaunchEvent table still exists';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'LaunchLead' AND column_name IN ('sessionId', 'referrer')
  ) THEN
    RAISE EXCEPTION 'obsolete LaunchLead tracking columns still exist';
  END IF;
END $$;

INSERT INTO "DeviceInstallation" (
  "id", "userId", "provider", "installationId", "tokenCiphertext", "tokenHash", "updatedAt"
) VALUES ('d1', 'u1', 'FCM_FID', 'phone-1', 'encrypted-not-raw', 'hash-1', NOW());

INSERT INTO "DeviceInstallation" (
  "id", "userId", "provider", "installationId", "tokenCiphertext", "tokenHash", "updatedAt"
) VALUES ('guest-web', NULL, 'WEB_PUSH', 'guest-browser', 'encrypted-web-subscription', 'hash-guest', NOW());

INSERT INTO "DeviceOrderSubscription" (
  "id", "deviceInstallationId", "orderId", "expiresAt", "updatedAt"
) VALUES ('s1', 'd1', 'o1', NOW() + INTERVAL '6 hours', NOW());

INSERT INTO "DeviceOrderSubscription" (
  "id", "deviceInstallationId", "orderId", "expiresAt", "updatedAt"
) VALUES ('guest-s1', 'guest-web', 'o1', NOW() + INTERVAL '7 days', NOW());

INSERT INTO "NotificationOutbox" (
  "id", "dedupeKey", "kind", "userId", "orderId", "title", "body", "updatedAt"
) VALUES ('n1', 'order:o1:accepted', 'ORDER_STATUS', 'u1', 'o1', 'Titel', 'Text', NOW());

INSERT INTO "NotificationOutbox" (
  "id", "dedupeKey", "kind", "userId", "orderId", "title", "body", "updatedAt"
) VALUES ('guest-n1', 'order:o1:guest-ready', 'ORDER_STATUS', NULL, 'o1', 'Redo', 'Text', NOW());

INSERT INTO "NotificationDelivery" (
  "id", "outboxId", "deviceInstallationId", "provider", "attemptNo", "status"
) VALUES ('a1', 'n1', 'd1', 'FCM_FID', 1, 'ACCEPTED');
SQL

if "${PSQL[@]}" -c \
  'INSERT INTO "DeviceInstallation" ("id", "userId", "provider", "installationId", "tokenHash", "updatedAt") VALUES ('\''d2'\'', '\''u1'\'', '\''APNS'\'', '\''phone-2'\'', '\''hash-1'\'', NOW());' \
  >/dev/null 2>&1; then
  echo "Duplicate push token hash unexpectedly passed" >&2
  exit 1
fi

if "${PSQL[@]}" -c 'DELETE FROM "Restaurant" WHERE "id" = '\''r1'\'';' >/dev/null 2>&1; then
  echo "Restaurant with payout was unexpectedly hard-deleted" >&2
  exit 1
fi

if "${PSQL[@]}" -c 'DELETE FROM "Order" WHERE "id" = '\''o1'\'';' >/dev/null 2>&1; then
  echo "Order hard-delete unexpectedly passed" >&2
  exit 1
fi

if "${PSQL[@]}" -c 'DELETE FROM "RestaurantPayout" WHERE "id" = '\''p1'\'';' >/dev/null 2>&1; then
  echo "Payout hard-delete unexpectedly passed" >&2
  exit 1
fi

echo "Customer notification migration: idempotency, encrypted-token schema, outbox and payout guard OK"
