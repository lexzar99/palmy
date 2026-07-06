-- 2026-07-04: Product.note — valfri admin-notering som visas längst ner i
-- produktmodalen i appen (skild från description). Additiv, nullable, inga drops.
-- Speglad i packages/api + packages/db prisma-scheman. Applicerad mot DIRECT_URL.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "note" TEXT;
