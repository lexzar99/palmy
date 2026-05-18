-- Stad-hierarki (föräldra → barn) + alias-namn.
-- Admin kan manuellt slå ihop t.ex. Arlöv/Oxie under Malmö så kunden ser
-- Storstadens utbud. Lund kan vara separat även om geografiskt nära — det
-- är admin's beslut, inte distans-baserad auto-merge.
ALTER TABLE "City" ADD COLUMN "parentCityId" TEXT;
ALTER TABLE "City" ADD COLUMN "aliases" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "City" ADD CONSTRAINT "City_parentCityId_fkey"
  FOREIGN KEY ("parentCityId") REFERENCES "City"("id") ON DELETE SET NULL;
