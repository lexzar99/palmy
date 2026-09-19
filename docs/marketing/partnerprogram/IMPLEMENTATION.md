# Implementationsstatus — 2026-09-19

## Levererat lokalt

- `/tipsa`: responsiv landningssida, 500+300-erbjudande, interaktiv räknare, framtida uppdrags-/arbetsmöjlighet, FAQ och namn/e-post-formulär.
- `/tipsa/villkor`: programvillkor och särskild integritetsinformation.
- `/tipsa/installation`: förfrågan om installation med manuell bekräftelse.
- `POST /api/partner-applications/interest`: strikt validering, rate limit, honeypot, sparning före bekräftelse och idempotent registrering per typ/e-post. Återförsök kan inte skriva över någon annans anmälan.
- Admin `/partner-applications`: paginerad lista, källa/kampanj/annons, kontaktstatus och radering med bekräftelse. API kräver autentisering och SUPER_ADMIN för läsning/ändring/radering.
- Ingen automatisk utskickning eller anmälan till rabattkampanjer. Formuläret är en kontaktförfrågan, inget bindande uppdragsavtal.
- Befintlig `Note`-tabell används med separat namnrymd `viaeats:partner-inbox:v1`, utan restaurang/order/kundscope. Ingen schemamigrering eller produktionsdatabasändring har gjorts. Äldre anmälningar gallras vid läsning/registrering efter 180 dagar. Avtals-/bokföringsuppgifter måste hanteras separat.
- Kampanjparametrar sparas bara tillsammans med en uttrycklig anmälan; inga nya spårningscookies. Källa kommer från ingångslänken och är inte verifierad cross-device-annonsattribuering. Annonskonto-Lead-event är inte uppsatt här.
- Tre kampanjkoncept: kontakt/lokalt/framtid, vardera 20 sekunder i 1080×1920 och 1080×1350. Sex MP4 och sex PNG. Egen grafisk illustration och syntetiskt komponerat ljud, inga AI-genererade fotografier eller personer.
- Kampanjtexter, budgetförslag, spårade länkar och operativ plan i PLAN-OCH-KAMPANJER.md.

## Kontroller

- Webben: produktionsbygge godkänt, inklusive de tre nya rutterna.
- API: samlingssviten `test:contracts` godkänd före och efter ändring.
- Nytt integrationstest med minneslagring: validering, deduplicering, honeypot, åtkomstgrind och utebliven falsk lyckad respons vid databasfel godkända.
- Webbens relevanta launch-/prelaunch-tester godkända, inklusive exakt ruttavgränsning för `/tipsa`.
- Adminens källkod typkontrollerad utan fel med separat testkonfiguration som utesluter gamla genererade dev-typer. Standardkontrollen träffar en befintlig inaktuell `.next/dev`-referens till `zone-draw-check`.
- Visuell kontroll av landningssidan på dator (1440 px) och mobil (390/320 px). Ingen horisontell overflow i kontrollerade storlekar. Räknaren verifierad med tangentbord; obligatoriska formulärfält stoppar ofullständiga inskick.
- Ingen riktig person eller produktionsanmälan har skapats under test. Testerna verifierar routens beteende mot minneslagring; ett riktigt test av lagring och admin krävs efter driftsättning.
- Videofiler avkodade utan fel; bildrutor granskade. Kontrollera respektive annonsapps överlägg före publicering.

## Inte publicerat

Inget pushat, inga annonser startade, ingen produktionsdatabas ändrad. Lokal webbförhandsvisning på port 3104 visar designen, inte en driftsatt ny backend.

Backendens fullständiga typkontroll stannar på två befintliga fel i lokalt ändrad `packages/api/src/routes/payouts.ts`, rad 496 (`providerFees` saknas) och 638 (`targetProviderFees` saknas). Dessa hör till pågående utbetalningsarbete. De har inte ändrats i denna uppgift. Lokal Prisma-klient regenererades för att utesluta gamla genererade typer; kvarvarande fel ligger i utbetalningskoden, inte partnerprogrammet.

## Före publicering

1. Avsluta/fixa det separata utbetalningsarbetet eller gör ett isolerat deployunderlag med enbart dessa ändringar. Push till main deployar automatiskt och kräver användarens begäran enligt repo-instruktionerna.
2. Bekräfta ersättningsupplägget. Utkastet använder faktura via F-skatt/egenanställning, 800 kr före skatt/avgifter: 500 kr direkt efter godkänt avtal och 300 kr senast inom 30 dagar, med underlag ordnat före godkännandet. Privat finansiering ändrar inte ersättningens skattemässiga karaktär. Detta är ett utkast till affärsvillkor, inte juridiskt godkännande.
3. Kontrollera verkligt bolagsnamn, organisationsnummer, support-/integritetsadress i plattformens inställningar. Sidan hämtar samma uppgifter som befintliga villkorssidor; fallback är varumärkesnamn och plattformens standardadresser.
4. Gör ett auktoriserat riktigt test: skicka anmälan med testkontakt, kontrollera raden i admin, markera kontaktad, radera testet.
5. Bestäm och godkänn annonsbudget/kategori i respektive annonskonto. Börja med en begränsad pilot enligt planen.
