-- "Slut idag"-toggle på produkter (#36, agent A6 Fredrik-fynd).
-- Auto-resettar genom att tiden passerar — admin slipper komma ihåg att
-- aktivera igen nästa morgon.

ALTER TABLE "Product" ADD COLUMN "soldOutUntil" TIMESTAMP(3);
