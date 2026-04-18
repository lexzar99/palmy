# Projekt: MatGo UI/UX Facelift ("The Silk Redesign")

Detta dokument fungerar som en teknisk och konceptuell masterplan för nästa iteration av utvecklingen. Målet är att höja appens visuella och tekniska nivå till absolut världsklass – *bort* från ett "rörigt och pizeria-bygge" mot ett extremt professionellt, luftigt och premium "Tech food-delivery" gränssnitt likt de mest moderna versionerna av Uber Eats, Wolt och Apple.

---

## 1. Det nya färgtemat ("Silk / Light Luxury")
Vi frångår den tunga, klubb-mörka Obsidian/Guld-looken till förmån för en ljust, krispigt och inbjudande palett. 

### Varför?
Psykologiskt ser mat alltid bättre (godare, fräschare) ut mot vita och ljusa bakgrunder. Större leveransappar använder sig uteslutande av light-modes i sina huvudflöden av en anledning: den vita bakgrunden får restaurangernas foton att lysa, vilket direkt leder till högre konvertering per visning (Click-Through-Rate).

### Hur det implementeras:
1. **Design Tokens:** 
   * **Bakgrund:** Byt ren svart (`#171513`) till en mjuk off-white / silkesfärg (ex. `#FCFCF9` eller `#F8F9FA`).
   * **Paneler/Kort:** Rent vit bakgrund (`#FFFFFF`) med extremt mjuka droppskuggor (ex. `box-shadow: 0px 8px 24px rgba(0,0,0,0.04)`).
   * **Textfärger:** Byt inverterad vit text mot "Soft Black" (ex. `#1C1C1E` för rubriker, `#6E6E73` för subtitlar).
   * **Accentfärg:** Behåll vårt "Gold" (Guld) som primär action-färg för att bevara "Premium"-känslan. Grönt (`#34C759`) används sparsamt enbart för "ÖPPET"-status, lila/orange för Deals-ribbons.
2. **React Native (`src/constants/theme.ts`):** Ändra palette-objektet generiskt. Existerande textkomponenter ska automatiskt ta åt sig ändringen. 
3. **Web (`globals.css` & Tailwind):** Byt ut `text-zinc-100 bg-[#171513]` till ljusa standarder. Ta bort/invertera dark-mode CSS-klasser i `page.tsx`.

### Att tänka på:
* **Kontrast:** Var extremt noggrann (WCAG-reglering) med kontrasten på ljusgrå text (muted) mot en krämvit bakgrund för att inte tappa läsbarheten.
* **Skeletons:** Skeleton-laddarna måste uppdateras från Obsidian-pulse till dämpade ljusgrå/vita vågor (`#EAEAEA` -> `#F5F5F5`).

---

## 2. Pagemodifiering: "Swimlanes" / Horisontella kategorier
Istället för en överväldigande och monoton rullgardin av alla restauranger (likt vi har under "Alla Restauranger"), inspireras vi av Foodora/Uber Eats uppdelning av skärmen i separata horisontella rader.

### Varför?
För att minska användarens kognitiva belastning. När allt är en lista vet hjärnan inte var den ska landa. Swimlanes skapar kurering. ("Favoriter jag kan lita på", "Nya grejer", "Grejer på rea").

### Hur det implementeras:
1. **Dataspridning:** Huvudkällan av restauranger bryts ner lokalt på klientsidan (både RN och Web) via `useMemo` filter:
   * **"Dina Senaste" ("Köp Igen"):** Filtrera på restauranger användaren beställt från nyligen (kräver eventuellt ny profil/order-historia hook).
   * **"Fri Leverans":** En swimlane med `deliveryFee === 0`.
   * **"Snabba val" (Snabbast just nu):** Filtrerad på de med `etaMinutes < 30`.
2. **Layoutstruktur (RN & Web):** 
   Dessa rullas ut som 2-3 horisontella listor på högst *1.5 skärmlängds höjd* innan den konventionella vertikala "Utforska nära dig"-listan tar vid.

### Att tänka på:
* **Scroll-Utmattning:** Gör aldrig för många horisontella listor. Max 3-4 st. Användaren måste ganska snabbt nå "botten"-flödet för att fortsätta dyka.
* **Prestanda:** Varje horizontal lista innebär nesting av `FlatList` i RN och scroll-containrar i Web. Bygg dem med optimerade keys och `memo`. Skapa snygga "See all"-knappar till höger om swimlane-titeln.

---

## 3. Mikro-UI & Taktik
I modern UI-utveckling bygger vi mikrointeraktioner som driver engagemang (klick, favoriter, filtrering).

### A. The "Heart" (Favoritmarkering)
**Varför:** Skapar en omedveten vana ("Habit Loop") för användaren att återvända till appen för att se sina kuraterade listor. Det ökar LTV (Lifetime Value).
**Hur:** En absolut-positionerad ikonknapp i övre högra hörnet på varje RestaurantCard (direkt på bilden). Tryck genererar en mikroanimation (skalnade hjärta som fylls med färg). State sparas (om inloggad via API, annars Async/localStorage).
**Viktigt:** Hitboxen på mobilen (`hitSlop`) måste vara stor (minst 44x44px padding) så användaren inte råkar klicka på hela kortet när de menade att hjärta.

### B. Sticky Quick-Filters
**Varför:** De vanliga "Kategorier / Cuisines"-bubblorna (Sushi, Pizza) är bra för *typ av mat*, men användare sorterar ofta per logiska attribut: "Har Deals", "Över 4.0", "Kortast tid".
**Hur:**
1. Inför ett scrollable horisontellt chip-fält direkt ovanför "Utforska" (den stora listan). 
2. Exempelchips: `[ Justerings-ikon ]`, `[ Betyg 4.0+ ]`, `[ Snabbt (Under 30m) ]`, `[ Erbjudanden ]`.
3. Tryck på dessa sätter direkta lokala state-filters som manipulerar arrayen som skickas ned till den vertikala listan.

### C. Tät Men Tydlig Metadata (Kortfot)
Foodora misslyckas då deras text blir plottrig och billig. Vi tar det bästa och förfinar det:
* Avsluta varje restaurangkort rent:
  * Exempelrad: `[Stjärnikon] 4.6 (100+)  •  25-30 min  •  $$`
  * Exempelrad 2: `Fri leverans via MatGo Pro` (eller `Snitt 35kr`)
Håll marginaler och spacing luftiga (padding: 16px runt metadatan). Använd San Francisco / Inter som font och satsa tungt på olika font-vikter (Heavy/Black för belopp, Medium/Regular för metadata) istället för svärta färger.

---

## Sammanfattningens Checklist för AI:n som tar över:
1. [ ] Sätt upp ljus/vit färgpalett och implementera den över `theme.ts` (RN) och `globals.css` (Web).
2. [ ] Redesigna `RestaurantCard` med ljus bakgrund, skuggor, mörk text och nytt Heart-ikon state.
3. [ ] Konvertera den stora Main-layouten i `HomeScreen.tsx` (RN) och `page.tsx` (Web) till att bestå av dedikerade Swimlanes (Köp igen / Snabb leverans).
4. [ ] Introducera lokala *Quick-Filters* (Sticky chips ovanför stora listan) och bygg logiken för dem.
5. [ ] Ta bort allt "skrik" från UI:t. Vi ska vara "Apples take on Food Delivery". Minimal noise, maximum clarity, outstanding pictures.
