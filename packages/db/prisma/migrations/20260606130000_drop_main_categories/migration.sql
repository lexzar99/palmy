-- Ta bort MainCategory-konceptet helt. Menyn visas nu platt (kategorier +
-- produkter direkt). Kategorier behålls; bara kopplingen till huvudkategori och
-- själva MainCategory-tabellen tas bort. IF EXISTS → idempotent.

-- DropForeignKey (Category → MainCategory)
ALTER TABLE "Category" DROP CONSTRAINT IF EXISTS "Category_mainCategoryId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "Category_mainCategoryId_idx";

-- AlterTable: ta bort FK-kolumnen från Category
ALTER TABLE "Category" DROP COLUMN IF EXISTS "mainCategoryId";

-- DropTable: MainCategory (FK till Restaurant försvinner med tabellen)
DROP TABLE IF EXISTS "MainCategory";
