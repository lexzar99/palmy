# TV-menyn som video (2026-11-12)

En loop på 12 minuter, stående 1080×1920, 25 bilder/s, H.264 med BT.709. Samma tavla som https://balkangrillburek.se/tv/.
Menyn står cirka 6 minuter mellan annonserna: Beställ i mobilen (5 s) vid 5:57 och loggan (3 s) vid 11:54.
Tallrikarnas varvtider (144, 180 och 240 s, de små 360 s) går jämnt upp i 720 s, så sista bildrutan går rakt över i den första.

Priserna är inbakade. Ändras ett pris i admin måste videon renderas om. Webbsidan /tv/ uppdateras däremot själv.

## Rendera om
1. Bygg sajten (`SITE=balkan npm run build` i `sites/`) och servera `sites/dist` lokalt, till exempel `python3 -m http.server 3170 --directory sites/dist`.
2. `node capture.mjs "http://localhost:3170/tv/?nobreak" <mapp>/cap` fångar tavlan utan tallrikar (`base.png`), annonsernas toning och text
   och tallrikarnas lägen (`layout.json`) i 2160×3840 med Chrome headless.
3. Skala lagren till 1080×1920 (`clips/base1080.png`, `clips/break-*-{grad,text}.png`) och gör tallrikarna med `plate-png.sh`
   (stora 488 px, små 104 px, från originalen eller `sites/balkan/public/img/tv/*.webp`).
4. `breaks.sh <mapp> <degfilm> <grillfilm>` bygger annonsklippen `clips/order.mov` (degfilmen, Pexels 30771191, 4,2–9,2 s) och `clips/brand.mov` (grillfilmen, Pixabay 124830):
   zoom 1,06 → 1 på 3,4 s, texten glider upp 26 px och tonas in, hela klippet tonas in och ut på 0,35 s.
5. `render.sh 720 357 714 ut.mp4` sätter ihop allt. Ändras `layout.json` måste koordinaterna i `render.sh` följa med.

## Filerna (2026-11-12)
Ligger i `~/viaeats/output/balkan-tv/` (inte i git):
- `Balkan-TV-meny-12min-staende-1080x1920.mp4` (450 MB): för skärmar och spelare som visar stående video.
- `Balkan-TV-meny-12min-for-TV-pa-hogkant-1920x1080.mp4` (423 MB): bilden vriden 90° för en vanlig TV som hängts på högkant
  medurs (menyns överkant mot TV:ns vänstra sida). Står den upp och ner: `ffmpeg -i <stående> -vf transpose=clock …`.
Båda: 25 bilder/s, H.264 High 4.1, BT.709, CRF 16, tyst ljudspår (vissa TV-apparater vill ha ett).
