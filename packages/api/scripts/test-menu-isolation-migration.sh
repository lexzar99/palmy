#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION="$ROOT_DIR/prisma/migrations/20260715103000_isolate_restaurant_menus/migration.sql"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/viaeats-migration-test.XXXXXX")"
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
CREATE TABLE "Restaurant" (
  "id" TEXT PRIMARY KEY
);
CREATE TABLE "Category" (
  "id" TEXT PRIMARY KEY,
  "restaurantId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "Category_restaurantId_fkey" FOREIGN KEY ("restaurantId")
    REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "Product" (
  "id" TEXT PRIMARY KEY,
  "categoryId" TEXT NOT NULL REFERENCES "Category"("id")
);
CREATE TABLE "ExtraGroup" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "type" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL,
  "minSelections" INTEGER NOT NULL,
  "maxSelections" INTEGER NOT NULL,
  "displayStyle" TEXT,
  "allowQuantity" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "position" INTEGER NOT NULL,
  "restaurantId" TEXT,
  CONSTRAINT "ExtraGroup_restaurantId_fkey" FOREIGN KEY ("restaurantId")
    REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "Extra" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "priceAddon" INTEGER NOT NULL,
  "imageUrl" TEXT,
  "extraGroupId" TEXT NOT NULL REFERENCES "ExtraGroup"("id"),
  "isDefault" BOOLEAN NOT NULL,
  "isActive" BOOLEAN NOT NULL,
  "position" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "ProductExtraGroup" (
  "productId" TEXT NOT NULL REFERENCES "Product"("id"),
  "extraGroupId" TEXT NOT NULL REFERENCES "ExtraGroup"("id"),
  PRIMARY KEY ("productId", "extraGroupId")
);
CREATE TABLE "Deal" (
  "id" TEXT PRIMARY KEY,
  "restaurantId" TEXT,
  CONSTRAINT "Deal_restaurantId_fkey" FOREIGN KEY ("restaurantId")
    REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "Order" (
  "id" TEXT PRIMARY KEY,
  "restaurantId" TEXT,
  CONSTRAINT "Order_restaurantId_fkey" FOREIGN KEY ("restaurantId")
    REFERENCES "Restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "Restaurant" ("id") VALUES ('r1'), ('r2');
INSERT INTO "Category" ("id", "restaurantId") VALUES
  ('c1', 'r1'), ('c2', 'r2'), ('orphan-category', NULL);
INSERT INTO "Product" ("id", "categoryId") VALUES
  ('p1', 'c1'), ('p2', 'c2'), ('orphan-product', 'orphan-category');
INSERT INTO "ExtraGroup" (
  "id", "name", "type", "required", "minSelections", "maxSelections",
  "allowQuantity", "createdAt", "updatedAt", "position", "restaurantId"
) VALUES ('shared', 'Dryck', 'SINGLE', true, 1, 1, false, NOW(), NOW(), 0, NULL);
INSERT INTO "Extra" (
  "id", "name", "priceAddon", "extraGroupId", "isDefault", "isActive",
  "position", "createdAt", "updatedAt"
) VALUES ('cola', 'Cola', 0, 'shared', true, true, 0, NOW(), NOW());
INSERT INTO "ProductExtraGroup" ("productId", "extraGroupId") VALUES
  ('p1', 'shared'), ('p2', 'shared');
INSERT INTO "Deal" ("id", "restaurantId") VALUES ('d1', 'r1');
INSERT INTO "Order" ("id", "restaurantId") VALUES ('o1', 'r1');
SQL

"${PSQL[@]}" -f "$MIGRATION" >/dev/null
"${PSQL[@]}" -f "$MIGRATION" >/dev/null

"${PSQL[@]}" >/dev/null <<'SQL'
DO $$
DECLARE
  scoped_groups INTEGER;
  scoped_extras INTEGER;
  bad_links INTEGER;
  orphan_active BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO scoped_groups
  FROM "ExtraGroup" WHERE "restaurantId" IN ('r1', 'r2');
  IF scoped_groups <> 2 THEN
    RAISE EXCEPTION 'expected 2 scoped groups, got %', scoped_groups;
  END IF;

  SELECT COUNT(*) INTO scoped_extras
  FROM "Extra" e
  JOIN "ExtraGroup" g ON g."id" = e."extraGroupId"
  WHERE g."restaurantId" IN ('r1', 'r2');
  IF scoped_extras <> 2 THEN
    RAISE EXCEPTION 'expected 2 scoped extras, got %', scoped_extras;
  END IF;

  SELECT COUNT(*) INTO bad_links
  FROM "ProductExtraGroup" peg
  JOIN "Product" p ON p."id" = peg."productId"
  JOIN "Category" c ON c."id" = p."categoryId"
  JOIN "ExtraGroup" g ON g."id" = peg."extraGroupId"
  WHERE c."restaurantId" IS DISTINCT FROM g."restaurantId";
  IF bad_links <> 0 THEN
    RAISE EXCEPTION 'found % cross-tenant links', bad_links;
  END IF;

  SELECT "isActive" INTO orphan_active
  FROM "Category" WHERE "id" = 'orphan-category';
  IF orphan_active THEN
    RAISE EXCEPTION 'orphan category was not quarantined';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Restaurant' AND column_name = 'archivedAt'
  ) THEN
    RAISE EXCEPTION 'Restaurant.archivedAt missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Order' AND column_name = 'clientRequestId'
  ) THEN
    RAISE EXCEPTION 'Order.clientRequestId missing';
  END IF;

  BEGIN
    DELETE FROM "Restaurant" WHERE "id" = 'r1';
    RAISE EXCEPTION 'restaurant hard-delete unexpectedly succeeded';
  EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN
    NULL;
  END;
END $$;
SQL

echo "Menu-isolation migration: idempotency, tenant scope and delete guards OK"
