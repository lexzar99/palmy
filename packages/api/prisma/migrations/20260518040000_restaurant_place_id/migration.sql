-- Google Places place_id på Restaurant. Sätts via Places autocomplete i
-- admin-form. Används för djup-länkar till Maps och för att centrera
-- zone-editorns karta på rätt punkt.
ALTER TABLE "Restaurant" ADD COLUMN "placeId" TEXT;
