-- Add English translation columns to HomeCategorySection.
-- null = falla tillbaka på svenska originalet i UI:t.
ALTER TABLE "HomeCategorySection" ADD COLUMN "titleEn" TEXT;
ALTER TABLE "HomeCategorySection" ADD COLUMN "subtitleEn" TEXT;
ALTER TABLE "HomeCategorySection" ADD COLUMN "descriptionEn" TEXT;
