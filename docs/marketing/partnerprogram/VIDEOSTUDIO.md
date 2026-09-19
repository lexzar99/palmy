# Videostudio, 2026-09-19

Lokalt visningsrum: `/tipsa/studio`. Ingen publicering eller push utförd.

## Leveranser

- Promo 30 sekunder, stående 1080 × 1920.
- Produktgenomgång 40 sekunder, stående 1080 × 1920.
- Introduktion för restaurangkontakter 60 sekunder, stående 1080 × 1920.
- Varje film med egen ljudmatta: en version utan tal och en svensk syntetisk provröst (macOS Alva). Ingen människa har filmats. Berättarmanus finns i `output/marketing/studio/` för senare egen inspelning.
- Tre responsiva restaurangkoncept i visningsrummet. STACK och GRÖN är fiktiva. Deras klickbara demo använder en separat visuell prototyp, inte den riktiga kassan.
- Animerad terminalvisualisering i CSS, baserad på användarens fotografier. Detta är inte en tekniskt måttriktig CAD-modell. Bilden av terminalskärmen är ett designexempel.

## Filmernas verkliga produktmaterial

Meny, produktmodal, storlek/sås, varukorg och betalningsval spelades in på `https://www.viaeats.se/restaurants/palmyra-pizzeria-lund` och `/cart` genom webbläsaren. De är inte en egen påhittad kassa.

Palmyra var stängt vid inspelningen. GET-svaret för restaurangen simulerades som öppet endast i inspelningsfliken. Produktionsdata och öppettider ändrades inte. Två rätter lades i flikens vanliga varukorg och togs bort efter inspelningen.

Ordervyn `/order/viaeats-film-demo-1042` fick ett helt lokalt simulerat API-svar, innan begäran nådde servern. Ingen order eller betalning skapades. `marketingPurchase` var null, så demoordern skickade inget Meta Purchase-event. Testorderns lokala historik/cache rensades efteråt och fliken stängdes. Filmerna märker orderklippet som demonstration.

Produktskärmarna visar avhämtning. Priserna är exempel från inspelningsdagen och ska ses över inför senare kampanjer. Betalningsalternativ kan bero på aktivering, enhet och leverantörens villkor.

## Ersättning

Sidan förklarar Swish normalt direkt när betalningen skickas, kontoöverföring normalt 1–3 arbetsdagar. Detta är betalningssätt, inte undantag från skatte- eller redovisningsregler. Vid egenanställning betalas avtalsparten och dennes utbetalningstider gäller. Minderårigas separata upplägg kvarstår.

## Produktion

`tools/marketing/partnerprogram/render-studio.py` komponerar verkliga UI-klipp i telefonramar, originaltypografi, diskreta rörelser, övergångar och egen ljudmatta. Inga nya AI-bilder har genererats. Matbilder i designexemplen återanvänds från befintligt viaeats-material; detta innebär inte ett påstående om att tidigare bilder är fotograferade.

## Verifiering och begränsning

- Produktionsbygget av webben passerar.
- Alla sex MP4-filer avkodades i sin helhet utan fel. Originalen är 1080 × 1920, 24 fps, H.264 + AAC.
- Mobilkontroll vid 390 px: inga sidledes överflöden, alla konceptbilder laddade.
- Produktfilmen öppnades och spelades i QuickTime; tidslinjen gick framåt normalt.
- Codex inbyggda webbläsare kraschade vid uppspelningsstart, även med alternativt WebM-format. Uppspelning i just den miljön är därför inte verifierad. Använd de nedladdade MP4-filerna i QuickTime för granskning. Problemet är inte bekräftat som ett fel i själva filerna.
- WebM-förhandsvisningar i 720 × 1280 finns som första källa i galleriet, MP4 som reserv. Export: `tools/marketing/partnerprogram/export-studio-preview.py` efter slutmixen.


## Uppdatering: text istället för berättarröst
På användarens begäran visar studion nu endast filmer med musik och inbränd text. WebM-förhandsvisningarna genereras från musikversionerna. Filmpaketet innehåller tre filmer utan berättarröst och deras omslagsbilder. Tidigare röstversioner är arbetsmaterial, inte längre länkade i studion.
