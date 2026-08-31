-- Kupongkoder: "gäller inte på redan rabatterade varor".
--
-- Additiv, default false → alla befintliga koder behåller sitt beteende
-- (procent på hela subtotalen). När flaggan är true räknar servern rabatten
-- bara på de orderrader som INTE redan är nedsatta av menypris-rea,
-- produkt-/kategorideal eller BOGO. Se orders.ts (server-sanning) och
-- /api/discount/validate (förhandsvisning i kassan).
ALTER TABLE "DiscountCode"
  ADD COLUMN IF NOT EXISTS "excludeDiscountedItems" BOOLEAN NOT NULL DEFAULT false;

-- Kännedomskoden VIAEATS30: 30 % på ej rabatterade varor, obegränsat antal
-- användningar, ingen miniorder, gäller alla restauranger och plattformar.
-- Skapas som en vanlig rad så den går att se och redigera i admin (Kuponger).
INSERT INTO "DiscountCode" (
  "id", "code", "description", "type", "value", "minOrder", "isActive",
  "maxUsages", "usageCount", "applicableCategoryIds", "applicableRestaurantIds",
  "createdAt", "updatedAt", "freeDelivery", "platform", "excludeDiscountedItems"
) VALUES (
  'discount_viaeats30', 'VIAEATS30', '30 % rabatt på ej rabatterade varor — kännedomskod',
  'PERCENTAGE', 30, 0, true,
  NULL, 0, '[]', '[]',
  NOW(), NOW(), false, 'ALL', true
)
ON CONFLICT ("code") DO UPDATE SET
  "type" = EXCLUDED."type",
  "value" = EXCLUDED."value",
  "minOrder" = EXCLUDED."minOrder",
  "isActive" = EXCLUDED."isActive",
  "maxUsages" = EXCLUDED."maxUsages",
  "excludeDiscountedItems" = EXCLUDED."excludeDiscountedItems",
  "updatedAt" = NOW();
