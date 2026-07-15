#!/usr/bin/env bash
set -euo pipefail

API_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOFT_DELETE_MIGRATION="$API_DIR/prisma/migrations/20260715210000_customer_soft_delete/migration.sql"
CREDENTIAL_DROP_MIGRATION="$API_DIR/prisma/migrations/20260715213000_remove_customer_password_credentials/migration.sql"
TMP_DIR="$(mktemp -d "/tmp/viaeats-customer-auth-migration.XXXXXX")"
DATA_DIR="$TMP_DIR/data"

cleanup() {
  if [[ -d "$DATA_DIR" ]]; then
    pg_ctl -D "$DATA_DIR" -m immediate stop >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

initdb -D "$DATA_DIR" -A trust -U postgres >/dev/null
if ! pg_ctl -D "$DATA_DIR" -o "-F -h '' -k '$TMP_DIR'" -l "$TMP_DIR/postgres.log" -w start >/dev/null; then
  cat "$TMP_DIR/postgres.log" >&2
  exit 1
fi
PSQL=(psql -X -v ON_ERROR_STOP=1 -h "$TMP_DIR" -U postgres -d postgres)

"${PSQL[@]}" >/dev/null <<'SQL'
CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "password" TEXT,
  "passwordResetToken" TEXT,
  "passwordResetExpiresAt" TIMESTAMP(3),
  "emailVerificationToken" TEXT,
  "emailVerificationExpiresAt" TIMESTAMP(3),
  "emailVerifiedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "User_passwordResetToken_key" ON "User"("passwordResetToken");
CREATE UNIQUE INDEX "User_emailVerificationToken_key" ON "User"("emailVerificationToken");

CREATE TABLE "AdminUser" (
  "id" TEXT PRIMARY KEY,
  "password" TEXT NOT NULL
);

CREATE TABLE "Courier" (
  "id" TEXT PRIMARY KEY,
  "passwordHash" TEXT NOT NULL
);

INSERT INTO "User" (
  "id", "password", "passwordResetToken", "emailVerificationToken"
) VALUES ('customer-1', 'legacy-customer-hash', 'reset-token', 'verify-token');
INSERT INTO "AdminUser" ("id", "password")
VALUES ('admin-1', 'admin-hash-must-survive');
INSERT INTO "Courier" ("id", "passwordHash")
VALUES ('courier-1', 'courier-hash-must-survive');
SQL

# Both production patches are intentionally retry-safe because the production
# database is not yet baselined in Prisma migration history.
for _attempt in 1 2; do
  "${PSQL[@]}" -f "$SOFT_DELETE_MIGRATION" >/dev/null
  "${PSQL[@]}" -f "$CREDENTIAL_DROP_MIGRATION" >/dev/null
done

"${PSQL[@]}" >/dev/null <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'deletedAt'
  ) THEN
    RAISE EXCEPTION 'User.deletedAt is missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'User' AND column_name IN (
      'password',
      'passwordResetToken',
      'passwordResetExpiresAt',
      'emailVerificationToken',
      'emailVerificationExpiresAt',
      'emailVerifiedAt'
    )
  ) THEN
    RAISE EXCEPTION 'legacy customer credential columns still exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname IN (
      'User_passwordResetToken_key',
      'User_emailVerificationToken_key'
    )
  ) THEN
    RAISE EXCEPTION 'legacy customer credential indexes still exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'AdminUser' AND column_name = 'password'
  ) OR (SELECT "password" FROM "AdminUser" WHERE "id" = 'admin-1') <> 'admin-hash-must-survive' THEN
    RAISE EXCEPTION 'AdminUser.password was removed or changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Courier' AND column_name = 'passwordHash'
  ) OR (SELECT "passwordHash" FROM "Courier" WHERE "id" = 'courier-1') <> 'courier-hash-must-survive' THEN
    RAISE EXCEPTION 'Courier.passwordHash was removed or changed';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = 'customer-1') THEN
    RAISE EXCEPTION 'customer row was unexpectedly deleted';
  END IF;
END $$;
SQL

echo "Customer auth migrations: double-run idempotency, tombstone and scoped credential removal OK"
