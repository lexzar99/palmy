# viaeats designsystem 2026 — "Tyst premium"

> Så här ser viaeats ut från och med restaurangsidan 2026-09-16. Det här är
> källan att bygga vidare på (kassa, spårning, hem, deals). Tokens och
> primitiver bor i `apps/web/components/restaurant/restaurant.css`; den första
> fullständiga implementationen är `components/restaurant/RestaurantMenu.tsx`,
> `ProductSheet.tsx`, `CartBar.tsx` och den globala `components/Toast.tsx`.

---

## 1. Grundidé

Designen ska kännas som en app Apple hade kunnat skicka: lugn, exakt, dyr.
Inget skriker. Maten är det enda som får vara färgstarkt.

Fem regler som avgör allt:

1. **En färg är text, en färg är yta, en färg är accent.** Bläck (`#1D1D1F`),
   grå sida (`#F5F5F7`) med vita kort, och orange (`#F04F1A`) bara som liten
   signal (rabatt, badge, favorit). Aldrig orange knappar, aldrig orange rubriker.
2. **Hårfina linjer, aldrig ramar.** Avdelare är 0,5 px `rgba(60,60,67,0.10)`
   via `box-shadow: inset`, inte `border`. Kort har ingen kantlinje alls, bara
   en mjuk dubbelskugga.
3. **Grupperat, inte staplat.** Innehåll ligger i vita kort med 20 px radie på
   grå bakgrund (iOS "inset grouped"). Rader inuti kortet har avdelare som
   börjar 16 px in, aldrig kant till kant.
4. **Svart är handling.** Den primära knappen är en svart pill (`#1D1D1F`,
   `border-radius: 9999px`, höjd 52–56 px, vit text 16 px/600). Sekundära
   handlingar är grå fyllning (`rgba(120,120,128,0.10)`). Det finns bara en
   svart knapp synlig åt gången.
5. **Rörelse är fysik, inte effekt.** Fjädrar (spring) på allt som glider,
   `scale(0.985)` på tryck, 160–220 ms på färgbyten. Ingen bounce, ingen
   parallax, ingen glow.

---

## 2. Tokens (`.ve-root`)

Alla värden är CSS-variabler. Byt aldrig en hex-kod inline; lägg till en token.

### Färg

| Token | Värde | Används till |
|---|---|---|
| `--ve-bg` | `#F5F5F7` | Sidbakgrund, ark-bakgrund |
| `--ve-card` | `#FFFFFF` | Kort, rader, segmentets tumme |
| `--ve-card-2` | `#FAFAFB` | Inre fält i kort (adressrad, faktarad), pressad rad |
| `--ve-fill` | `rgba(120,120,128,0.10)` | Sökfält, segmentets spår, sekundära knappar, ikonplattor |
| `--ve-fill-2` | `rgba(120,120,128,0.16)` | Samma, men på glas/starkare kontrast |
| `--ve-ink` | `#1D1D1F` | Primär text, svarta knappar, aktiv chip |
| `--ve-ink-2` | `#6E6E73` | Beskrivningar, sekundär text |
| `--ve-ink-3` | `#8E8E93` | Etiketter, placeholders, ikoner i vila |
| `--ve-line` | `rgba(60,60,67,0.10)` | Hårfina avdelare |
| `--ve-line-2` | `rgba(60,60,67,0.18)` | Radio-/checkbox-ring i vila |
| `--ve-accent` | `#F04F1A` | Rabatt, antalsbadge, favorit, "Visa mer" |
| `--ve-accent-soft` | `#FFF1EB` | Bakgrund bakom accent-text (−34 %) |
| `--ve-success` / `-soft` | `#1F8A3B` / `#E9F6EC` | Öppet, kostmarkörer (Vegan) |
| `--ve-danger` / `-soft` | `#D70015` / `#FDECEE` | Stängt, utanför zon, valideringsfel |
| `--ve-cta` / `--ve-cta-ink` | `#1D1D1F` / `#FFFFFF` | Primär knapp |
| `--ve-glass` | `rgba(245,245,247,0.78)` + `blur(22px) saturate(180%)` | Toppbar, klistrad rad, arkets footer |
| `--ve-glass-strong` | `rgba(255,255,255,0.82)` + `blur(18px)` | Runda glasknappar över bild |

### Skugga

| Token | Värde | Används till |
|---|---|---|
| `--ve-shadow-card` | `0 1px 2px rgba(0,0,0,.03), 0 10px 30px rgba(0,0,0,.05)` | Alla kort |
| `--ve-shadow-float` | `0 2px 6px rgba(0,0,0,.08), 0 16px 40px rgba(0,0,0,.16)` | Flytande varukorgspill, toast |
| `--ve-shadow-thumb` | `0 3px 8px rgba(0,0,0,.12), 0 3px 1px rgba(0,0,0,.04)` | Segmentkontrollens tumme |

### Radie

| Token | Värde | Används till |
|---|---|---|
| `--ve-radius-xl` | 26 px | Ark (bottom sheet), dialoger |
| `--ve-radius-lg` | 20 px | Kort, logotypplatta |
| `--ve-radius-md` | 14 px | Inre fält, produktbilder (16 px i rad), tillvalskort (18 px) |
| `--ve-radius-sm` | 10 px | Segmentets tumme (12 px spår / 10 px tumme) |
| pill | 9999 px | Knappar, chips, sökfält, steppers, badges |

### Typografi

Typsnitt: **systemets** — `-apple-system, BlinkMacSystemFont, "SF Pro Text",
Inter, "Helvetica Neue", system-ui`. Inte Baloo 2 (den finns kvar på övriga
sajten tills den sidan byggs om). Alltid `-webkit-font-smoothing: antialiased`
och `font-variant-numeric: tabular-nums` (`.ve-tabular`) på **alla** siffror.

| Roll | Storlek / vikt | Spårning | Exempel |
|---|---|---|---|
| Sidtitel | 28 px / 600 | −0,025 em | Restaurangens namn |
| Arktitel | 24 px / 600 | −0,022 em | Produktnamn i arket |
| Sektionstitel | 22 px / 600 | −0,022 em | Kategori ("Pizzor") |
| Grupptitel | 17 px / 600 | −0,015 em | Tillvalsgrupp ("Storlek") |
| Rubrik i rad | 16 px / 600 | −0,015 em | Produktnamn i lista |
| Kropp | 15 px / 400 | −0,005 em | Beskrivningar (ink-2) |
| Pris | 15–19 px / 600 | tabular | `89 kr` |
| Meta | 13–14 px / 400–500 | — | Betyg, kök, faktaetiketter |
| Etikett | 12–12,5 px / 500 | — | "Leverans", "Minsta order" (ink-3) |
| Chip/badge | 11,5–12 px / 600 | — | `−34 %`, `Obligatoriskt` |

Kompakta storlekar (13,5 px kropp i produktrad, 14 px pris i CompactCard) är
tillåtna där ytan kräver det. Under 11 px används aldrig.

### Rytm

- Sidmarginal 16 px (`px-4`), innehållskolumn `max-w-[680px] mx-auto`.
- Kort har 20 px inre padding (`px-5 pt-5 pb-5`), rader 14–16 px vertikalt.
- Sektioner separeras med 32 px (`gap-8`), element inom kort med 16 px (`mt-4`).
- Safe areas respekteras alltid: `env(safe-area-inset-top/bottom)` på fasta
  element, `pb-36` på sidan så flytande pill inte täcker sista raden.

---

## 3. Primitiver (CSS-klasser)

| Klass | Vad |
|---|---|
| `.ve-root` | Sätter tokens, typsnitt, färg och bakgrund. Måste omsluta allt — även portalerade ark får klassen på sin rot. |
| `.ve-card` | Vitt kort: `--ve-card`, radie 20, `--ve-shadow-card`. Sätt `overflow-hidden` när rader ligger inuti. |
| `.ve-glass` / `.ve-glass-btn` | Frostat glas för barer resp. runda 40 px-knappar över bild (`active: scale(.92)`). |
| `.ve-press` | Trycksvar för knappar/kort: `scale(.985)` + opacitet, 180 ms. |
| `.ve-row-press` | Trycksvar för rader i kort: bakgrund → `--ve-card-2`, ingen skalning. |
| `.ve-chip` | Kategorichip: 36 px hög pill; aktiv = svart med vit text, inaktiv = vit med hårfin ring. |
| `.ve-input` | Textfält: 16 px (hindrar iOS-zoom), placeholder i ink-3. |
| `.ve-tabular` | Tabulära siffror. |
| `.ve-skeleton` | Shimmer-platta för laddning. |
| `.ve-fade-in` | Intoning 420 ms av sidinnehåll. **Aldrig på en förälder till `position: fixed`-element** (transform bryter fixed). |
| `.ve-img` | Bildintoning i ren CSS (fungerar även när bilden laddat före hydrering). |
| `.ve-sheet-handle` | Draghandtag 36×5 px överst i ark. |
| `.ve-sticky-top` | `top` för klistrad rad: 52 px + safe-area på mobil, 80 px från md (global Navbar). |
| `.ve-no-scrollbar` | Dold rullningslist på horisontella remsor. |

---

## 4. Komponentmönster

### Hero + kollapsande toppbar (mobil)
- Hero `min(50vw, 320px)` hög, kant till kant, mörk gradient bara i toppen
  (28 % → 0 vid 40 %) så glasknapparna läses.
- Huvudkortet överlappar heron med `-mt-7`; logotypen (68 px, radie 20, vit
  3 px-ring) sticker upp `-top-9` ur kortet.
- En **fast** toppbar (52 px + safe-area) ligger över allt. Över heron är den
  osynlig med tre vita glasknappar (tillbaka · info · favorit). När heron
  glider bakom baren (`collapse` 0 → 1 över 64 px scroll) tonar glaset och
  restaurangens namn in, och knapparna byter till grå fyllning. Styrs av en
  rAF-throttlad scroll-lyssnare, inte IntersectionObserver.
- Från md ligger knapparna i heron och toppbaren är dold (Navbaren tar över).

### Status- och metarad
`★ 5.0 (2) · Pizza · ● Öppen · 11:00–00:00`. Stjärnan är ifylld i bläck (inte
gul). Statuspunkten är 7 px och bär färgen (success/danger/accent för pausad).

### Segmentkontroll (Leverans / Avhämtning)
Grått spår (`--ve-fill`, radie 12, padding 3), vit tumme (radie 10,
`--ve-shadow-thumb`) som glider med `layoutId` + spring (500/40). Ikon 15 px +
text 14 px; aktiv 600, inaktiv 500 i ink-2.

### Adressrad och faktarad
Inre fält i kortet (`--ve-card-2`, hårfin ring). Adressraden: 32 px ikonplatta,
titel 15/500, undertext 12,5 i ink-3 (röd vid utanför zon), chevron höger.
Faktaraden: 2–3 lika kolumner med hårfina lodräta avdelare; värdet 15/600
överst, etiketten 12 i ink-3 under.

### Klistrad sök + kategorier
Sticky under toppbaren. Sökfält = 40 px pill i `--ve-fill` (mörkare `--ve-fill-2`
när raden fastnat), chips i horisontell remsa som auto-centrerar aktiv
kategori. När raden fastnat: glas + hårfin underkant.

### Produktrad (FULL)
Text vänster (namn 16/600, beskrivning 13,5 ink-2 max 2 rader, pris + `−34 %`-
chip + kostmarkörer), bild 88 px radie 16 höger med en 28 px vit plus-knapp i
hörnet. Utan bild: 32 px grå plus-platta. "från" skrivs i ink-3 bara när ett
obligatoriskt val kan höja priset. Inaktiverad (stängt/utanför zon) = 45 %
opacitet, aldrig gråskala.

### CompactCard (2 per rad)
Kvadratisk bild överst (radie 18, hårfin ring, plus-knapp och `−%`-badge i
hörnen), namn 14/600 och pris under. Ligger i 2-kolumnsgrid inuti kortet.

### Produktark (ProductSheet)
- Mobil: bottenark, 94 dvh, radie 26 bara upptill, draghandtag, glasknapp
  stäng uppe till höger. Desktop: centrerad dialog `max-w-[560px]`, radie 26.
- Bild i 16:10 kant till kant med tonad övergång till arkets bakgrund.
- Titel 24/600, pris 19/600 + genomstruket + accent-chip, beskrivning 15 ink-2,
  kostmarkörer som gröna pills.
- Tillvalsgrupper: rubrik 17/600 + `Obligatoriskt`-pill (grå; röd vid fel) +
  räknare `1 / 3` höger. **LIST** = vitt kort med rader (22 px radio-cirkel
  eller 7 px-rundad checkbox, fyllda i bläck med vit prick/bock; pris `+20 kr`
  i ink-3 höger). **BOX_IMAGE** = 2–3-kolumnsgrid av vita kort radie 18;
  valt = 2 px bläckring + svart bockbadge i hörnet. Grupper utan bilder
  reserverar ingen bildyta.
- Steppers: pill i `--ve-fill`, 44 px (footer) eller 32 px (i rad).
- Footer: glas med hårfin överkant, stepper vänster + svart pill
  `Lägg till · 199 kr` (text vänster, pris höger, båda 16/600).
- Validering: röd mjuk platta överst + 1,5 px röd ring runt gruppen +
  `scrollIntoView` till gruppen.

### Flytande varukorg (CartBar)
Svart pill 56 px, 16 px från kanterna, `--ve-shadow-float`. Vänster: 40 px
rund ikonplatta (`rgba(255,255,255,.12)`) med orange antalsbadge som fjädrar
vid varje ändring. Text `Gå till varukorg` 16/600, summa höger tabulär.
Fjädrar in/ut (420/34). Ligger **utanför** alla element med transform.

### Toast
Mörk glaspill (`rgba(29,29,31,.92)`, blur 20) högst upp under safe-area,
ikon i 32 px rund platta (grön `#30D158` success, röd `#FF453A` fel, vit 22 %
info) med mörk ikon, vit text 15/600 max 2 rader. Fjädrar ner (520/34), stängs
efter 2,6 s eller vid tryck. En toast i taget — en ny ersätter den gamla.

### Infoark
Samma ark-skal som produktarket. Beskrivning i eget kort, sedan ett kort med
rader adress → karta, telefon, e-post (36 px ikonplatta, titel 15/500,
undertext 13 ink-3, chevron), sedan öppettider (dagens dag i 600), sist juridisk
rad i 12,5 ink-3.

### Tomt/fel/laddning
Laddning = skelett med samma geometri som den färdiga sidan (hero, kort,
chips, rader). Fel = 64 px rund röd mjuk platta med ✕, titel 22/600, text 15
ink-2, svart pill `Gå hem`. Inga träffar = 56 px grå platta med lupp, titel
17/600, sökordet citerat.

---

## 5. Rörelse

| Vad | Värde |
|---|---|
| Ark in/ut | `spring(stiffness 380, damping 38, mass 0.9)`, `y: 100% → 0` |
| Segmenttumme | `spring(500, 40)`, `layoutId` |
| Varukorgspill | `spring(420, 34)`, `y 24 → 0`, `scale .98 → 1` |
| Antalsbadge | `spring(700, 20)`, `scale .4 → 1` |
| Toast | `spring(520, 34)` |
| Tryck | `scale(.985)` 180 ms `cubic-bezier(.2,.8,.2,1)`; glasknapp `scale(.92)` |
| Färg/glas | 200–220 ms `ease` |
| Kollaps toppbar | Steglös med scroll (0 → 1 över 64 px), titel `translateY 8 → 0` |
| Bildintoning | 360 ms `ease` opacitet |

`prefers-reduced-motion: reduce` stänger av intoningar och trycktransitioner.

---

## 6. Gör / gör inte

**Gör**
- Låt bilder vara de enda mättade ytorna. Kortet runt dem är alltid vitt.
- Håll siffror tabulära och högerställda i rader.
- Använd pills för allt tryckbart som inte är en rad i ett kort.
- Skriv kort: "Vi levererar hit", "Klar om", "Hämta hos". Ingen utropstecken.
- Visa öppettider och status i samma rad som betyg — kunden ska inte leta.

**Gör inte**
- Inga orange knappar, orange rubriker eller orange understrykningar.
- Inga `border: 1px solid` runt kort. Inga skuggor på rader.
- Inga emojis, ingen versal-italic, inga "✨"-badges.
- Ingen `transform`-animation på element som innehåller `position: fixed`
  eller `position: sticky` (`.ve-fade-in` animerar därför bara opacitet).
- Ingen `next/image` för bildvärdar som inte är konfigurerade — använd
  `PlainImage` (vanlig `<img>` + `optimizedImageUrl`).
- Blanda inte Baloo 2 och systemtypsnittet på samma yta.

---

## 7. Så håller sig embedden i synk (utan hårdkodning)

Partner-embedden (`/embed/[slug]`, laddad i iframe på t.ex. palmyrapizzeria.se)
har **ingen egen styling och inga partnerspecifika värden**:

- Den renderar exakt samma `RestaurantMenu` som `/restaurants/[slug]`, bara
  med `embedMode`. Kassan är samma `/cart`-sida med `?embed=1`.
- `restaurant.css` importeras **av komponenterna själva** (RestaurantMenu,
  ProductSheet), inte av sidorna. Alla routes som använder komponenterna får
  tokens automatiskt.
- Färger utanför React (body-bakgrund i overscroll/safe-area) läses från
  token `--ve-bg` via `useDesignBackground()` — inga hex-koder i TSX.
- Tider, stad för avhämtning och namn kommer från restaurangens data i API:t.
  Tillåtna partnerursprung ägs av `lib/embedPartner.ts`.

Regel: **ändra tokens i `restaurant.css` eller mönster i komponenterna — aldrig
i embed-routen.** Då följer partnerns sajt med av sig själv vid deploy.

## 8. Att bygga vidare (kassan, spårning, hem)

1. Omslut sidan i `.ve-root` och importera `restaurant.css`.
2. Sätt `document.body.style.backgroundColor = "#F5F5F7"` medan sidan är
   monterad (så overscroll/safe-area matchar).
3. Bygg upp sidan som **kort på grå bakgrund**: ett kort per ämne (Leverans,
   Dina uppgifter, Betalning), rader med hårfina avdelare, inre fält i
   `--ve-card-2`.
4. En svart pill längst ned för huvudhandlingen (`Betala 288 kr`), i glas-
   footer med safe-area. Betalval (Swish, kort) som rader i ett kort med
   radio-cirkel, inte som stora färgade knappar.
5. Fel och varningar som mjuka plattor (`--ve-danger-soft`), aldrig röda ramar
   runt hela fält.
6. Återanvänd `Segmented`, `Stepper`, `PriceLine`, `CartBar`-mönstret och
   toasten i stället för att rita nya varianter.

### Kassan (`apps/web/app/cart/page.tsx`, renderlagret från "Delade render-block")
Byggd 2026-09-16 enligt punkterna ovan: en kolumn (680 px), rubrikrad med
rund tillbaka-knapp + `Varukorg` 26/600 + restaurang · leveranssätt, sedan
kort i ordning: **varor** (60 px bild, namn 16/600 + tillval 13, pris tabulärt
+ liten stepper-pill, sist raden "Lägg till mer"), **"Har du glömt något?"**-
rail (128 px-kort), **leverans/avhämtning** (ikonplatta, titel + tid, adress,
grön bock/loader), **Dina uppgifter** (grupperade rader Namn/Telefon/E-post
utan hjälptexter — inga "du handlar som gäst"-banners), **Mer** (kollapsade
rader: meddelande, dricks-pills, rabattkod & erbjudanden), min-order-kort med
iOS-toggle, **summering** (rader i ink-2, total 22/600 i bläck) och **Betala
med**: ett kort med två rader — Swish (logga i vit 44 px-platta, "Betala
direkt") och Kort och mer (kortikon, undertext, varumärkesrad Apple Pay ·
Klarna · VISA · Mastercard · G Pay) med chevron. Blockerat läge = grå
inaktiv pill med orsaken. Betalsteget använder samma kort och en svart pill
`Öppna Swish`. Redigering av rad öppnar `ProductSheet`.

### Sök, Profil, hemsidans taggar och emblemet
`app/search/page.tsx`: rubrik 28/600, sökfält som vit pill med **orange
lupp** (den lilla detaljen), kategorikort 132×108 med foto och 2 px orange
ring när valt, resultat som vita kort med 112 px bild, `−%`- och
"Fri"-pills i vitt glas, statuspunkt i grönt/grått.
`app/profile/page.tsx`: utloggad = emblem + rubrik + svart pill (PhoneAuth),
inloggad = profilkort med bläckavatar och grön "Verifierad"-pill, radlista
med ikonplattor (Mina deals får orange platta), röd textknapp för utloggning.
Hemsidan behåller sin struktur men taggarna på restaurang- och Aktuellt-
korten är vita glaspills (`rgba(255,255,255,.92)`) med ikon: krona i amber
för Utvald, tagg/gåva i orange för rabatt, cykel i grönt för fri leverans.
"viaeats deals"-kortet ligger under första rälsen som vitt kort med orange
taggplatta. Emblemet är det **breda lockupet** `public/brand/viaeats-lockup.png`
(ren orange smiley + ordmärket "viaeats" i navy, transparent bakgrund,
komponerat ur varumärkespaketet) via `components/ViaEatsWordmark.tsx`;
`mark` ger bara smileyn (`viaeats-smiley-mark.png`). Den utfasade
symbolvarianten med bil och påse används aldrig.

### Orderspårning (`app/order/[id]/page.tsx`)
Sidan öppnar med en **scen**: ett fält i fasens gradient som täcker toppen,
med glasknapp tillbaka, restaurang · leveranssätt och ordernummer överst.
I mitten en 200 px **progressring** (vit på vit/22 %-spår, 11 px, rundade
ändar) som fylls efter hur långt ordern kommit, med ETA:n stor i mitten
("21" + "min", "Nu" vid avhämtning, bock när klart, kryss vid avbruten).
Under aktiva faser pulserar två "sonar"-ringar utåt och en tunn streckad
ring roterar långsamt. Därunder faspill, titel 26/600 i vitt, beskrivning i
vit/78 % och **tidslinjen som piller**: klara = vita med bock, aktiv = vit
ring med pulserande punkt, kommande = vit/10 %. Gradienter per fas:
skickad/bekräftad indigo, tillagas orange, klar amber, på väg blå, klar att
hämta/levererad grön, avbruten röd, väntar på betalning grå. Stegen är olika
per flöde (avhämtning: Bekräftad · Tillagas · Klar · Hämtad; leverans:
Bekräftad · Tillagas · Klar · På väg/Kör ut · Levererad).
Innehållet ligger i ett grått ark (radie 28) som överlappar scenen med 12 px
sidmarginal: live-karta bara när ett viaeats-bud är på väg, recension,
hämtnings-/leveranskort, **"Din beställning" hopfälld** (rad med antal,
betalsätt och total; expanderar till rader, summering och kvitto), notiser,
leveransbevis, verifiera nummer och hjälp. Kvittot är ett helsidesöverlägg.
Startsidans **pågående-order-kort** (`components/OrderTrackingCard.tsx`,
kompakt variant) är samma idé i miniatyr: fasens gradient, 64 px ring med
ETA:n i mitten, restaurang · leveranssätt · ordernummer, fastitel och
tidslinjen som små piller.

### Flikrad (BottomNav) och Deals
`components/BottomNav.tsx`: frostat glas (`ve-glass`), hårfin topplinje, fem
lika breda flikar (ikon 22 px + etikett 10 px), aktiv i bläck, övriga i ink-3,
antalsbadge i accent. Glider ner (translateY 110 %) när ett textfält har fokus
så den aldrig hamnar ovanpå tangentbordet, och på sidor med egen bottenyta.
`app/deals/page.tsx`: rubrik 28/600 + antal, kampanjkort 248 px (16:9-bild,
badge, titel, belöningspills) och per restaurang en rad logga · namn ·
kök/stad · "Se menyn" följt av produktkort 156 px (4:3-bild, `−%`-badge,
namn, pris + genomstruket).

Filkarta: `apps/web/components/restaurant/` (RestaurantMenu, ProductSheet,
CartBar, PlainImage, restaurant.css), `apps/web/components/Toast.tsx`,
`apps/web/app/restaurants/[slug]/page.tsx`, `apps/web/app/embed/[slug]/page.tsx`
(samma RestaurantMenu med `embedMode`), `apps/web/app/cart/page.tsx`.
`components/MenuContent.tsx`, `ProductModal.tsx` och `FloatingCartButton.tsx`
är kvar bara som referens/testunderlag och används inte längre av någon route.
