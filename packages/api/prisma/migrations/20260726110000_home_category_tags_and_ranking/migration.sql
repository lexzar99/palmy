-- Additiv hemskärms-/taggmigration.
-- Körs endast genom den ordinarie, granskade migrationsrunbooken.

ALTER TABLE "HomeCategorySection"
  ADD COLUMN "presentation" TEXT NOT NULL DEFAULT '{}',
  ADD COLUMN "ranking" TEXT NOT NULL DEFAULT '{}';

ALTER TABLE "Restaurant"
  ADD COLUMN "homeBoost" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "homeBoostStartsAt" TIMESTAMP(3),
  ADD COLUMN "homeBoostEndsAt" TIMESTAMP(3);

ALTER TABLE "Restaurant"
  ADD CONSTRAINT "Restaurant_homeBoost_range_check"
  CHECK ("homeBoost" >= 0 AND "homeBoost" <= 100);

ALTER TABLE "Restaurant"
  ADD CONSTRAINT "Restaurant_homeBoost_window_check"
  CHECK (
    ("homeBoost" = 0 OR "homeBoostEndsAt" IS NOT NULL)
    AND (
      "homeBoostStartsAt" IS NULL
      OR "homeBoostEndsAt" IS NULL
      OR (
        "homeBoostEndsAt" >= "homeBoostStartsAt"
        AND "homeBoostEndsAt" <= "homeBoostStartsAt" + INTERVAL '31 days'
      )
    )
  );

CREATE TABLE "RestaurantTag" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nameEn" TEXT,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "color" TEXT NOT NULL DEFAULT '#FF6B00',
  "icon" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RestaurantTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RestaurantTagAssignment" (
  "restaurantId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RestaurantTagAssignment_pkey" PRIMARY KEY ("restaurantId", "tagId"),
  CONSTRAINT "RestaurantTagAssignment_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RestaurantTagAssignment_tagId_fkey"
    FOREIGN KEY ("tagId") REFERENCES "RestaurantTag"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RestaurantTag_slug_key" ON "RestaurantTag"("slug");
CREATE INDEX "RestaurantTag_isActive_sortOrder_idx" ON "RestaurantTag"("isActive", "sortOrder");
CREATE INDEX "RestaurantTagAssignment_tagId_position_idx" ON "RestaurantTagAssignment"("tagId", "position");

-- Backfill från den gamla JSON-arrayen. Sluggen får en kort hash-suffix så
-- namn som normaliseras lika aldrig kolliderar. Legacy-kolumnen lämnas orörd.
CREATE OR REPLACE FUNCTION pg_temp.viaeats_safe_jsonb(value TEXT)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN value::jsonb;
EXCEPTION WHEN OTHERS THEN
  RETURN '[]'::jsonb;
END;
$$;

WITH legacy_names AS (
  SELECT DISTINCT ON (lower(trim(tag_name)))
    trim(tag_name) AS name,
    lower(trim(tag_name)) AS normalized
  FROM "Restaurant" r
  CROSS JOIN LATERAL jsonb_array_elements_text(pg_temp.viaeats_safe_jsonb(r."tags")) AS legacy_tag(tag_name)
  WHERE jsonb_typeof(pg_temp.viaeats_safe_jsonb(r."tags")) = 'array'
    AND trim(tag_name) <> ''
  ORDER BY lower(trim(tag_name)), trim(tag_name)
)
INSERT INTO "RestaurantTag" (
  "id", "name", "slug", "color", "isActive", "sortOrder", "createdAt", "updatedAt"
)
SELECT
  'legacy-tag-' || substr(md5(normalized), 1, 20),
  name,
  COALESCE(
    NULLIF(trim(BOTH '-' FROM regexp_replace(normalized, '[^a-z0-9]+', '-', 'g')), ''),
    'tag'
  ) || '-' || substr(md5(normalized), 1, 6),
  '#FF6B00',
  true,
  row_number() OVER (ORDER BY name)::integer * 10,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM legacy_names
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "RestaurantTagAssignment" ("restaurantId", "tagId", "position", "createdAt")
SELECT
  r."id",
  t."id",
  tag_row.ordinality::integer - 1,
  CURRENT_TIMESTAMP
FROM "Restaurant" r
CROSS JOIN LATERAL jsonb_array_elements_text(pg_temp.viaeats_safe_jsonb(r."tags"))
  WITH ORDINALITY AS tag_row(tag_name, ordinality)
JOIN "RestaurantTag" t
  ON lower(t."name") = lower(trim(tag_row.tag_name))
WHERE jsonb_typeof(pg_temp.viaeats_safe_jsonb(r."tags")) = 'array'
  AND trim(tag_row.tag_name) <> ''
ON CONFLICT ("restaurantId", "tagId") DO NOTHING;
