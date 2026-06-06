-- Perf-index för hot read-queries. Rent additiva (ingen data påverkas, samma
-- funktionalitet). Bästa tidpunkten att skapa dem är nu medan tabellerna är
-- små → snabb, lås-fri skapning.

-- Restaurant: publika listan sorterar på featuredClass, filtrerar på city och
-- joinar city_relation (cityId).
CREATE INDEX IF NOT EXISTS "Restaurant_featuredClass_idx" ON "Restaurant"("featuredClass");
CREATE INDEX IF NOT EXISTS "Restaurant_city_idx" ON "Restaurant"("city");
CREATE INDEX IF NOT EXISTS "Restaurant_cityId_idx" ON "Restaurant"("cityId");

-- Category: meny-queryn hämtar kategorier per restaurang, ordnade på position.
CREATE INDEX IF NOT EXISTS "Category_restaurantId_position_idx" ON "Category"("restaurantId", "position");

-- Product: meny-queryn filtrerar isActive + ordnar position inom categoryId.
-- Ersätt det smalare categoryId-indexet med ett sammansatt som täcker båda.
DROP INDEX IF EXISTS "Product_categoryId_idx";
CREATE INDEX IF NOT EXISTS "Product_categoryId_isActive_position_idx" ON "Product"("categoryId", "isActive", "position");
