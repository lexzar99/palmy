-- Repair legacy shared option groups without deleting customer/order history.
-- Every global ExtraGroup currently linked to a restaurant product is cloned
-- once per restaurant, including all options. Product links are then moved to
-- that restaurant-owned clone. IDs are deterministic so the migration is safe
-- to retry.

INSERT INTO "ExtraGroup" (
  "id", "name", "description", "type", "required", "minSelections",
  "maxSelections", "displayStyle", "allowQuantity", "createdAt", "updatedAt",
  "position", "restaurantId"
)
SELECT DISTINCT
  'scope_' || substr(md5(g."id" || ':' || c."restaurantId"), 1, 24),
  g."name", g."description", g."type", g."required", g."minSelections",
  g."maxSelections", g."displayStyle", g."allowQuantity", NOW(), NOW(),
  g."position", c."restaurantId"
FROM "ExtraGroup" g
JOIN "ProductExtraGroup" peg ON peg."extraGroupId" = g."id"
JOIN "Product" p ON p."id" = peg."productId"
JOIN "Category" c ON c."id" = p."categoryId"
WHERE g."restaurantId" IS NULL
  AND c."restaurantId" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Extra" (
  "id", "name", "priceAddon", "imageUrl", "extraGroupId", "isDefault",
  "isActive", "position", "createdAt", "updatedAt"
)
SELECT DISTINCT
  'scope_extra_' || substr(md5(e."id" || ':' || c."restaurantId"), 1, 20),
  e."name", e."priceAddon", e."imageUrl",
  'scope_' || substr(md5(g."id" || ':' || c."restaurantId"), 1, 24),
  e."isDefault", e."isActive", e."position", NOW(), NOW()
FROM "ExtraGroup" g
JOIN "Extra" e ON e."extraGroupId" = g."id"
JOIN "ProductExtraGroup" peg ON peg."extraGroupId" = g."id"
JOIN "Product" p ON p."id" = peg."productId"
JOIN "Category" c ON c."id" = p."categoryId"
WHERE g."restaurantId" IS NULL
  AND c."restaurantId" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

-- If a previous manual repair already linked the same product to the
-- deterministic clone, remove only the redundant global link before rewiring.
DELETE FROM "ProductExtraGroup" old_peg
USING "ExtraGroup" g, "Product" p, "Category" c
WHERE old_peg."extraGroupId" = g."id"
  AND old_peg."productId" = p."id"
  AND p."categoryId" = c."id"
  AND g."restaurantId" IS NULL
  AND c."restaurantId" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "ProductExtraGroup" existing_peg
    WHERE existing_peg."productId" = old_peg."productId"
      AND existing_peg."extraGroupId" = 'scope_' || substr(md5(g."id" || ':' || c."restaurantId"), 1, 24)
  );

UPDATE "ProductExtraGroup" peg
SET "extraGroupId" = 'scope_' || substr(md5(g."id" || ':' || c."restaurantId"), 1, 24)
FROM "ExtraGroup" g, "Product" p, "Category" c
WHERE peg."extraGroupId" = g."id"
  AND peg."productId" = p."id"
  AND p."categoryId" = c."id"
  AND g."restaurantId" IS NULL
  AND c."restaurantId" IS NOT NULL;

-- Legacy categories without an owner cannot safely be attributed after their
-- restaurant row has already disappeared. Quarantine them instead of deleting
-- them. All current customer/admin menu reads also require restaurant scope.
UPDATE "Category"
SET "isActive" = false, "updatedAt" = NOW()
WHERE "restaurantId" IS NULL;

CREATE INDEX IF NOT EXISTS "ExtraGroup_restaurantId_idx"
ON "ExtraGroup"("restaurantId");

-- Preserve the tenant row and every historical foreign key. The API now
-- archives restaurants; these RESTRICT constraints are a database-level
-- backstop against a future accidental hard delete that would otherwise turn
-- nullable menu/deal/order ownership into global or ownerless data.
ALTER TABLE "Restaurant"
ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Restaurant_archivedAt_idx"
ON "Restaurant"("archivedAt");

ALTER TABLE "Category"
DROP CONSTRAINT IF EXISTS "Category_restaurantId_fkey";
ALTER TABLE "Category"
ADD CONSTRAINT "Category_restaurantId_fkey"
FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExtraGroup"
DROP CONSTRAINT IF EXISTS "ExtraGroup_restaurantId_fkey";
ALTER TABLE "ExtraGroup"
ADD CONSTRAINT "ExtraGroup_restaurantId_fkey"
FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Deal"
DROP CONSTRAINT IF EXISTS "Deal_restaurantId_fkey";
ALTER TABLE "Deal"
ADD CONSTRAINT "Deal_restaurantId_fkey"
FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Order"
DROP CONSTRAINT IF EXISTS "Order_restaurantId_fkey";
ALTER TABLE "Order"
ADD CONSTRAINT "Order_restaurantId_fkey"
FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Checkout retries must be idempotent across API restarts and Railway
-- replicas. Null keeps legacy orders untouched; non-null hashes are unique.
ALTER TABLE "Order"
ADD COLUMN IF NOT EXISTS "clientRequestId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Order_clientRequestId_key"
ON "Order"("clientRequestId");
