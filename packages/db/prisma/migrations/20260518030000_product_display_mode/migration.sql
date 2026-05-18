-- Visningsläge per produkt: FULL (1-per-rad med beskrivning + stor VARUKORG-knapp)
-- eller COMPACT (2-per-rad, kompakt — drycker, sidor, chili cheese etc).
ALTER TABLE "Product" ADD COLUMN "displayMode" TEXT NOT NULL DEFAULT 'FULL';
ALTER TABLE "Product" ADD COLUMN "hideDescription" BOOLEAN NOT NULL DEFAULT false;
