# Swift-appen, nattens arbete (2026-07-01)

Fokus: rewards-, profil- och tracking-sidorna. Allt byggt i Release och
installerat på "Jalle Iphone" (bundle se.delivera.swift). Backup av hela repot
togs först: `/Users/jalle/delivera-testa-backup-2026-07-01.tar.gz` (182 MB, källa
inkl. de git-ospårade Swift/RN-apparna, exkl. node_modules/build).

## Klart och verifierat (varje steg byggt grönt + installerat)

### Säkerhet (P0)
- **Auth-token flyttad från UserDefaults/plist till Keychain.** Ny
  `KeychainService` + delad `SessionStore` + drop-in `@AuthToken`-wrapper i
  `App/DeliveraSwiftApp.swift`. Migrerar tyst gammal token första gången. Alla
  läsare (Home/Cart/Profile) bytte bara en rad. Token ligger inte längre i klartext.

### Rewards-sidan
- Fel sväljs inte längre: nätverksfel visar en felruta med "Försök igen" i
  stället för att visa 0 poäng. Behåller redan laddad data.
- Saldo är optionellt under laddning (produkter låses tills saldot är hämtat,
  inte "unaffordable" av misstag).
- Låsta produkter visar "saknas X p" (hur nära man är).
- Dubbelklick-skydd på välkomstbonus.
- Platt design: tog bort de eviga TimelineView-animationerna och glow-skuggorna
  på hero-korten (både inloggad och gäst). Behåller den mörka→orange identiteten.

### Profil-sidan
- **401 vs nätverksfel:** kunden loggas bara ut vid riktig auth-miss (401), inte
  vid en tillfällig nätverksblink. Restore-vyn har nu felläge + "Försök igen".
- Riktig telefonvalidering (svenskt mobilnummer 7XXXXXXXX, E.164), tydligt fel.
- Fixade en osäker force-cast (`as! T`) i Supabase-nätverkslagret.
- Tog bort den döda "Fortsätt med Google"-knappen och dess stub-copy (byggs klart
  senare, ingen död knapp kvar). Copy uppdaterad.
- Panel-race: `.task(id: activePanel)` avbryter förra laddningen vid snabbt byte.
- Platt: tog bort animerade cirklar + glow på profil-hero, mildare skuggor.

### Tracking-sidan
- **Polling smart:** 2s-loopen blev adaptiv. 5s medan ordern är aktiv, 20s i
  terminalt läge (levererad/hämtad), exponentiell backoff vid upprepade fel.
  Slutar tömma batteriet efter leverans.
- Vänliga svenska felmeddelanden i stället för råa API-fel ("Beställningen
  hittades inte." / "Dålig anslutning. Vi försöker igen.").
- Tog bort dummy-telefonen `0700000000` (fanns kvar för testordrar som nu är borta).
- Mildare skuggor (radie 30/34 → platt neutral).
- **Platt klart:** alla 9 eviga pulser/shimmer i tracking-vyerna borttagna
  (banner, arc, progress-strip, kartnål, pickup-celebration). Byggt grönt i en
  ren build. Krävde en liten Swift 6-fix: `@MainActor` på `SessionStore` +
  `AuthToken` (matchar användningen, endast från vyer).

### Deals-motorn (från tidigare, ligger kvar)
- Mall + variant-motor (DealCampaign), admin-styrd, se `DEALS_ENGINE_PLAN.md`.
  Kräver fortfarande den additiva SQL:en i prod innan den funkar end-to-end.

## Kvar att göra (prioriterat) — bör tas härnäst

### Tracking, medel
- Review-prompten bör bekräftas mot 2 terminala pollar innan den visas (undvik
  att den blinkar fram om servern studsar tillbaka till "levereras").
- Self-delivery auto-"levererad" borde ha en liten debounce (2 min) innan den
  markerar automatiskt.
- Kartnålar: större/tydligare budnål; behåll platt (ingen puls).
- Gissade koordinater (restaurang saknar lat/lng → +600 m norr; kund saknar →
  hårdkodad Malmö) bör ersättas med ett tydligt "plats saknas"-läge.
- VoiceOver-labels på kartnålarna.

### Profil, lågt
- Paginering på orderhistoriken (laddar allt idag).
- Kvitto-PDF: guarda mot dubbeltryck under generering.

### Push (P0 för att slå Foodora på tracking)
- Appen saknar `aps-environment`-entitlement och `UIBackgroundModes`. Live
  Activity faller tillbaka till lokal uppdatering, så tracking dör i bakgrunden.
  Lägg till push-entitlement + APNs så live-tracking funkar på låsskärmen. Detta
  är den enskilt största "wow"-funktionen och är nästan färdigkodad.

### Checkout — KLART (2026-07-01, morgon)
- Stabil idempotensnyckel per kassa-session (inte slumpad per försök).
- Retry efter avbruten betalning återanvänder samma order (`reopenAdyenPayment`)
  i stället för att skapa en dubblett.
- Varukorgsändring nollar kassa-sessionen och släpper ev. väntande order.
- Kvar (backend): föräldralösa awaiting-payment-ordrar städas redan av API:ts
  5-min expiry-jobb; klienten släpper nu sin vid avbrott/ändring.

## Grov plan för resten (1 vecka)
1. **Swift klart:** push-entitlement + de medel-punkterna ovan, sen checkout-
   idempotens. (1-2 dagar)
2. **Deals live:** kör prod-SQL, testa mall+kampanj-flödet skarpt. (0,5 dag)
3. **Web + admin:** verifiera deals-UI mot skarp data, städa. (1 dag)
4. **RN-appen:** porta samma deals-kort + Keychain-token-mönster. (1-2 dagar)
5. **Buffert/QA:** end-to-end på riktig enhet, TestFlight. (1 dag)

Inget committat/pushat i natt: Swift-appen är git-ospårad (ligger bara på enheten
+ i backupen), och deals-backend/admin väntar på ditt OK för prod-SQL + push.
