# Delivera WOW-plan — appen ska leva

> Mål: kunden öppnar Swift-appen och känner wow, väljer Delivera alla dagar i veckan.
> Regel 1: INGENTING hårdkodat. Allt som syns i appen ska gå att skapa/ändra i admin.
> Regel 2: allt autonomt som händer ska synas i admin (händelselogg).
> Status: PLAN — inget byggs förrän ägaren säger kör.

## A. Direkta fel som fixas först (grund i verifierad kod/DB)

1. **Dpoints-copy är fel OCH hårdkodad.** DB: perKr=0.1 (1 p per 10 kr), valuePerKr=10.
   Fix: klienten hämtar perKr/valuePerKr från API:t och räknar fram all text
   ("Du får tillbaka ~2 % i poäng", "128 p = 12 kr att handla för"). Inga siffror i kod.
2. **Claim som utloggad känns trasigt.** Fix: tap på deal som gäst öppnar en
   inloggnings-sheet DIREKT i flödet (telefon-OTP + Apple), och efter lyckad login
   auto-claimas dealen man tryckte på. Felmeddelanden visas alltid.
3. **App-deals saknar admin-yta** (fliken togs bort av tidigare agent). Fix: ny flik
   "App-deals" i Deals-huben: lista med placering/audience/claims/inlösta, skapa-knapp
   med appfälten främst, badge i Kampanjer-tabellen på deals som är app-aktiva.
   Fri leverans-dealen och uppdraget blir fullt redigerbara där.
4. **Dubblerade uppdrag.** Earn-reglerna (order_streak, new_restaurant, review...) och
   missions är två system som säger samma sak. Fix: EN uppdragslista i appen, driven av
   admin. Earn-reglerna blir admin-skapade uppdragskort med samma motor (progress,
   belöning, cooldown). Admin: skapa/pausa/schemalägg uppdrag, se completion-rate.

## B. Design: rebuild eller polish, per skärm

Ägarbeslut: REBUILD på Onboarding, Rewards och Sponsorkorten. Hård polish på övriga.

### B1. Onboarding 2.0 (REBUILD)
- 3 fullskärms-scener med djup: lager som rör sig i parallax + 3D-tilt på gyro
  (enheten lutas → scenen svarar). Mat-bilder/video från riktiga partners (admin-styrt
  innehåll, fallback-gradienter).
- **Logga in direkt i onboardingen**: Apple-knapp + telefonnummer på sista scenen,
  "fortsätt som gäst" diskret under. Adressval direkt efter.
- Avslut: personlig deal-reveal — kortet vänds med flip-animation ("Din första deal
  väntar"). Dealen = admin-styrd welcome-deal, inte hårdkodad.
- Copy skrivs kort och mänskligt, poängtext beräknad från serverns värden.

### B2. Sponsorkort 2.0 (REBUILD, admin-byggaren är kärnan)
Sponsorkorten blir en innehållsyta med KORTTYPER, alla byggs i admin med live-preview:
- **RESTAURANG**: hjältebild/video + logga + text + CTA → restaurangsidan.
  Tier-visualisering: Huvudpartner får större kort + guld-detalj, "Utvald partner"-badge.
- **DEAL**: koppla en Deal → kortet visar värdet och claim-knapp DIREKT i kortet.
- **ANNONS**: extern annonsör, bild/video + länk, "Annons"-märkning.
- **TEXT/KAMPANJ**: rubrik + budskap + valfri CTA (nyheter, "nu i Lund", högtider).
- Schemaläggning per kort (start/slut, dygnsfönster), sortering, A/B-vikt.
- Swift renderar typerna med olika layouts; video finns redan, resten byggs.

### B3. Rewards 1000× (REBUILD)
- Saldo som **3D-mynt** (SceneKit-nod, roterar långsamt, speglar ljus; enda äkta
  3D-modellen tillsammans med onboardingen — resten spring-fysik, för prestanda).
- **Progress-ring till nästa belöning**: "38 p kvar till gratis pommes hos Palmyra"
  (närmaste reward-produkt räknas ut automatiskt).
- Uppdragsflik: kort med progress, tidsfönster, belöning; confetti + haptik vid klart.
- Historik som tidslinje med ikoner i stället för lista.
- "Bjud in en vän" får eget hjältekort med delningsanimation.
- Gäst-läge: visa exakt vad man missar ("du hade haft ~34 p nu") → login-CTA.

### B4. Homescreen (polish + nya sektioner, alla server-styrda)
- **Dygnspuls**: sektioner och hälsning styrs av tidsfönster från servern
  (frukost/lunch/fredagskväll-läge). Admin skapar fönstren.
- **"Mest beställt just nu"**: räls driven av riktig orderdata (7 dagar, per stad).
- **Utvalda partners**: tier-systemet visualiseras — guldkant, badge, förtur i sortering.
- **Deal-countdown-kort**: personliga deals med nedräkning (skapar urgency, ärligt:
  riktig expiry). Flip/shine-animation vid claim.
- Skeleton-shimmer vid laddning, staggered entrance (finns delvis, förfinas).

### B5. Restaurangsidan (polish, Foodora-nivå)
- **Deal-banner inuti sidan** när restaurangen har aktiva deals (auto — ingen extra
  admin-handling): "20 % idag" överst, claim/appliceras direkt.
- **Bestseller-badges** per produkt ("Mest beställd") från orderdata.
- "Beställs ofta tillsammans"-rad i produktmodalen (samma data, enkel co-occurrence).
- Tier-partners får rikare header (video-stöd i hero).

### B6. Cart (polish)
- "Du tjänar ~X p på det här köpet"-rad (server-beräknad).
- Deal-raden tydligare (grönt när aktiv, ett tap för att byta deal).
- Smartare upsell: "beställs ofta tillsammans" i stället för statiska rekommendationer.

### B7. Profil (polish)
- Hjältekort med namn + nivå + poäng + aktiva deals i ett svep.
- Vänkod som delbart "biljett-kort" (samma design som kompisen ser i sin kassa).

## C. Autonoma motorer — appen lever av sig själv
Alla motorer: PÅ/AV + parametrar i admin, allt de gör loggas på ny admin-sida
**"Motorn"** (vad hände, varför, utfall). Inga tysta beslut.

1. **Auto-merchandising**: när admin skapar en deal på en restaurang med tier ≤ tröskel
   → deal-kort genereras automatiskt på hemskärmen (snyggt kort av mallen, ingen extra
   handling). Regel: tier-tröskel + max antal samtidiga i admin.
2. **Bestseller-motorn**: nattligt jobb räknar toppsäljare (per restaurang + plattform)
   → badges, "mest beställt"-räls, co-occurrence för upsell. Ingen admin-handling alls.
3. **Coming soon-hype**: kund klickar på coming soon-restaurang → "Psst. Du är tidig.
   Välj din öppningspresent": fri leverans första ordern ELLER slumpad gratisprodukt
   (värde-tak admin-styrt, t.ex. 50 kr). Sparas som UserDeal som aktiveras när
   restaurangen öppnar + push då. Admin ser intresse-listan per restaurang (säljdata
   mot nya partners!).
4. **Utjämnaren**: restaurang säljer under sitt rullande 4-veckorssnitt → motorn
   föreslår en reasonable deal (10–20 %, aldrig under marginalgolv som admin satt).
   Två lägen: "föreslå" (admin godkänner med ett klick) eller "auto" (skapas direkt,
   loggas). Restaurangen står för sin deal enligt avtal — syns i förslaget.
5. **Favorit-motorn (personalisering)**: mest köpta produkt per kund → personligt
   countdown-kort ("Vi älskar också King Kong. 10 % extra på din favorit till söndag").
   Frekvensregler: max 1 aktiv/kund, cooldown, budgettak per månad. Byggs på
   kampanjmotorns UserDeal-spine + nya segment (vilande, prisjagare = hög
   deal-användningsgrad, storbeställare) — beteendedata vi redan har (ordrar,
   inlösta deals). Transparens: korten säger alltid vad de är ("din favorit",
   "vi saknar dig") — personligt, aldrig fult.
6. **Dygnspulsen**: tidsfönster styr hem-layout, sponsorkort och copy (B4).
7. **Deal-berättaren**: när en ny deal skapas genereras kortet med rätt mall/färg/badge
   automatiskt (finns delvis) + valfri push till matchande segment med ETT klick i admin.

## C+. Motorkatalogen — alla autonoma funktioner (utökad)

### C+0. Tema-rotationsmotorn (infrastruktur för ALLT nedan)
Varje auto-genererat kort får sitt utseende ur en pool, deterministiskt roterande:
`hash(kortets id + veckonummer)` väljer TEMA (blå/grön/solnedgång/midnatt/guld...),
LAYOUT (hero/kompakt/split/diagonal) och COPY-VARIANT (admin skriver 2–3 rubriker).
Samma King Kong-deal är blå denna vecka, grön nästa — stabil hela veckan (ingen
slump per render), ny känsla varje cykel. Admin kurerar temapoolen per korttyp och
kan låsa tema på enskilda kort. Gäller deal-rälsen, sponsorkort, hero-kort, uppdrag.

### Hemskärmen (dyker upp och roterar av sig själva)
1. **Champion-motorn**: restaurangen som genererat flest ordrar/omsättning senaste
   7 dagarna får automatiskt "Veckans favorit"-herokort med badge och eget tema.
   Topp 3 roterar dag för dag. Belönar partners som levererar → de säljer mer → vi
   tjänar mer. Allt utan handpåläggning.
2. **Hetast just nu (live)**: räls driven av senaste 60 minuternas ordrar.
   "12 beställer härifrån just nu" — social proof i realtid.
3. **Dagens drop**: motorn väljer varje dag EN produkt (bestseller hos partner med
   hög tier) → tidsbegränsat kort 17–21 med countdown. Imorgon en annan produkt,
   annat tema. Skapar en anledning att öppna appen varje dag.
4. **Ny-i-stan**: nyöppnad restaurang får automatiskt "Ny"-räls i 14 dagar +
   valfri första-order-deal. Coming soon-hypen (C3) matar direkt in hit.
5. **Nytt på menyn**: partner lägger till en produkt → "Nytt hos Palmyra"-kort
   genereras automatiskt (med produktbilden). Menyarbete blir marknadsföring gratis.
6. **Comeback-kort**: gillade du en restaurang (5 stjärnor / flera ordrar) men inte
   beställt på 3+ veckor → "Palmyra saknar dig"-kort, valfritt med liten deal.
7. **Snabbast just nu**: restauranger med kort kötid i realtid lyfts med
   "Framme om ~20 min"-badge. Utjämnar trycket OCH känns som service.
8. **Trendar-badge**: produkt/restaurang med störst ordertillväxt denna vecka får
   "Trendar"-märke automatiskt.
9. **Väder-pulsen**: regn/snö (väder-API) → comfort food-räls + valfri
   leveransboost. "Regnar ute. Vi kör."
10. **Occasions-kalendern**: admin skapar återkommande tillfällen (fredagsmys,
    lönehelg den 25:e, söndagsfika, storhelger) → rälsar och teman aktiveras
    automatiskt de dagarna, år efter år.
11. **Stänger snart-knuffen**: din favorit stänger om 45 min → diskret kort
    "Hinn beställa". Ärlig urgency (riktiga öppettider).
12. **Nästan framme-kortet**: "120 p kvar till gratis pommes hos Palmyra" —
    poängmålet närmast dig visas på hemskärmen när du är nära (goal gradient:
    folk accelererar nära mål).
13. **Streak-kortet**: pågående uppdrag visas på home ("2 av 3 — 300 p väntar").

### Restaurang-motorer (höja partnernas omsättning = vår omsättning)
14. **Utjämnaren** (från C4): under rullande snitt → reasonable deal-förslag/auto.
15. **Prispartner-lyftet**: partner som själv kör kampanj/sänker pris får automatiskt
    extra synlighet. Belönar investering, lockar fler partners att köra deals.
16. **Betygsraketen**: snittbetyg som stiger snabbt → "På väg upp"-badge.
17. **Kapacitetsvakten**: restaurang med långa kötider dämpas tillfälligt i
    sorteringen (skyddar kundupplevelsen) och kompenseras med boost efteråt.
18. **Partnerrapporten**: automatiskt veckomejl till varje restaurang: ordrar,
    trend, bestsellers, "så låg du mot snittet" + vad motorn gjorde för dem.
    Gör partners lojala mot OSS (Foodora ger dem knappt något).
19. **Lågtrafik-fönster**: motorn identifierar döda timmar per restaurang
    (tis 14–17) → föreslår automatiska happy hour-deals just då. Fyller köken
    när de ändå står stilla — lätt för partnern att säga ja till.

### Cart-motorer (höja snittordern ärligt)
20. **Tröskel-knuffen**: "23 kr kvar till fri leverans" / "till din deal" + förslag
    på produkt som fyller exakt gapet (co-occurrence-data). Klassikern som funkar.
21. **Poäng-rådgivaren**: "Använd 200 p nu = 20 kr billigare" ELLER "1 order till
    så räcker poängen till gratis X" — motorn räknar vilket som gynnar kunden och
    säger det. Ärlighet bygger förtroendet som får folk att stanna.
22. **Glömde du-raden**: din beställning innehåller nästan alltid dryck men inte nu →
    "Glömde du drycken?" med din vanliga.
23. **Tålamodsbonusen**: ovanligt lång ETA vid tryck → automatiskt +X p på köpet
    ("Det är tryck ikväll. Tack för tålamodet."). Vänder besvikelse till lojalitet.

### Rewards-motorer (variable rewards, gjort ärligt)
24. **Uppdrags-generatorn**: motorn skapar veckans uppdrag per segment automatiskt
    ur en admin-kurerad pool (ny kund: "första ordern" · aktiv: "prova en ny
    restaurang" · vilande: "välkommen tillbaka" · utforskare: "beställ frukost").
    Roterar så det aldrig är samma uppdrag två veckor i rad.
25. **Överraskningen**: slumpad liten poängbonus efter vissa ordrar ("Palmyra bjöd
    på 25 p!") — variabel belöning är den starkaste vanebyggaren som finns.
    Budget-cappad per månad, loggas i Motorn.
26. **Dubbelpoäng-fönster**: automatiska poäng-happy-hours på plattformens svagaste
    timmar (motorn hittar dem själv). Fyller lågtrafik i stället för att rabattera
    rusningen.
27. **Milstolparna**: 5:e, 10:e, 25:e ordern firas automatiskt (konfetti + bonus +
    delbart kort "Jag har beställt 25 gånger på Delivera").

### Styrningen (din kontroll över allt)
28. **Motorn-sidan i admin**: varje motor har PÅ/AV, parametrar, månadsbudget-tak
    och en händelselogg (vad, varför, utfall i kronor och ordrar). Dashboard:
    kostnad vs genererad omsättning per motor. Inget händer som du inte kan se.

Psykologin bakom (ärligt använd): social proof (2), scarcity på riktigt (3, 11),
goal gradient (12, 20), variable reward (25), reciprocitet (23, 25), vana genom
daglig förändring (C+0, 3). Aldrig fejkade lager, aldrig påhittad brådska — allt
bygger på riktig data, för det är det som håller när kunderna blir stammisar.

## D. Ekonomi (grov modell, räknas skarpt i admin-dashboard)
Antaganden: 15 restauranger i Lund, varav ~3 kedjor med self-delivery.
Provision 15 % (10 % vid self-delivery). Snittorder ~180 kr → intäkt 18–27 kr/order.

- **Dpoints** (0.1 p/kr, 10 p = 1 kr) = max ~1 % cashback → ~1,80 kr/order, betalas
  ur plattformens marginal, taket (2500 p) begränsar exponering.
- **Plattformsdeals** (välkomst, fri leverans): CAC-verktyg. Fri leverans ~29–39 kr
  styck — motsvarar en billig kundanskaffning om den konverterar en Foodora-kund
  (LTV på 2 ordrar/mån × 22 kr snittintäkt ≈ 530 kr/år).
- **Restaurangdeals** (utjämnaren, favorit-motorn på restaurangens produkter): kostnaden
  ligger enligt avtal hos restaurangen; plattformens 15 % räknas på rabatterat pris →
  vi avstår ~15 % av rabatten. En 20 %-deal på 180 kr kostar oss ~5,40 kr men höjer
  ordervolym.
- **Admin-dashboard "Motorn" visar per motor**: kostnad (rabattkronor uppdelat
  plattform/restaurang), genererade ordrar, snittorder före/efter, netto. Varje motor
  får ett månadsbudget-tak i admin. Då ser du svart på vitt vad varje krona ger.

## E. Etapper (varje etapp levereras byggd + installerad på Jalle Iphone)

| Etapp | Innehåll | Effekt |
|---|---|---|
| 1 | A1–A4 (dpoints-copy, claim+login-sheet, App-deals-flik, uppdrag enas) | Det trasiga känns helt |
| 2 | B1 Onboarding + B2 Sponsorkort 2.0 (admin-byggare + Swift-rendering) | Första intrycket + din innehållsyta |
| 3 | B3 Rewards-rebuild + B4 Home-sektioner + B5 Restaurangsidan | Wow i vardagsflödet |
| 4 | C2 Bestsellers + C1 Auto-merchandising + C7 Deal-berättaren + "Motorn"-sidan | Appen börjar leva |
| 5 | C3 Coming soon-hype + C4 Utjämnaren + C6 Dygnspulsen | Autonomt utbud |
| 6 | C5 Favorit-motorn + segment + D-dashboarden | Personligt + mätbart |

Tekniska principer genom allt: pengavärden i öre i DB, copy server-driven, additiv SQL,
allt admin-styrt, Swift-filer registreras via Scripts/add_file_to_project.py,
3D används där det bär (mynt + onboarding), spring-fysik överallt annars så appen
förblir blixtsnabb.
