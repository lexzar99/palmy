# ViaEats launch hardening — 2026-07-15

## Sammanfattning

Kodbasen har härdats för launch över API, admin, webb, Swift, Kotlin,
restaurangappen och kurirappen. Den avslutande P1-granskningen i detta dokument
gäller API, kundwebb och superadmin. Mollie är enda provider för nya
produktionsbetalningar vid launch.

Ingen produktionsdatabas har ändrats, ingen produktionsdeploy har gjorts och
ingen befintlig affärsdata har raderats. Kodändringarna ska inte läggas på en
auto-deployande `main` innan databasstegen i
`docs/LAUNCH_DATABASE_RUNBOOK.md` är genomförda.

Kodläget bygger och de automatiserade kontrakten nedan passerar. Launch är
ändå blockerad tills de manuella produktionskontrollerna längst ned är
genomförda på riktig infrastruktur och fysisk hårdvara.

## Genomförda ändringar

### Order, meny och tenant-isolering

- Servern räknar nu pris från den aktiva restaurangens egna kategorier,
  produkter, valgrupper och tillval. Klientens namn, grupp och pris används
  inte som ekonomisk sanning.
- Menyer, kategorier, produkter, valgrupper och deals isoleras per restaurang.
  Föräldralösa eller felkopplade poster hanteras av den granskade
  tenant-migreringen.
- Negativa tillvalspriser är fortsatt tillåtna, exempelvis reducerat pris för
  barnpizza. Endast serverns sparade pris godtas och en orderrad kan aldrig få
  negativ totalsumma.
- Order-idempotens är databasbaserad med unik klientreferens.
- Nya ordrar fryser betalprovider, moms, rabatt och avgiftskomponenter så
  historik och refund inte ändras när inställningar ändras senare.

### Mollie, betalning och refund

- Mollie är den valda launch-providern. En produktionsprocess vägrar starta
  med testnyckel när Mollie är aktiv.
- PSP-belopp jämförs med den auktoritativa ordersumman innan ordern blir
  `PAID`; avvikelse går till `NEEDS_REVIEW`.
- Betalningsfinalisering är idempotent mellan webhook, retur-URL,
  statuspolling och reconcile.
- Rabattförbrukning, personlig deal och referral-belöning repareras hållbart
  om processen kraschar efter att betalningen blivit `PAID`.
- Reconcile tar äldsta väntande betalningar först och kan inte starta en ny
  överlappande körning medan Mollie eller databasen svarar långsamt.
- Bulk-/krisrefund är permanent avstängd. Refund görs en order i taget;
  Mollies asynkrona refundstatus återhämtas via reconcile utan att en avvisad
  eller avbruten order oavsiktligt återöppnas.
- Varje individuell PSP-refund skrivs i en append-only `PaymentRefund`-ledger
  med oföränderliga ekonomifält, dedupe, RESTRICT och hard-delete-skydd.
  Mollie-intents återupptas med samma idempotensnyckel efter krasch; manuella
  Dashboard-refunds från Mollie/Stripe/Adyen skrivs av reconcile. Historisk
  refund utan exakt PSP-evidens blockerar readiness och payout. Mollies
  individuella refunds läses från hela det paginerade Payment Refunds-API:t
  och måste summera exakt till payment-aggregatet innan lokal synk eller ny
  refund tillåts.
- Payout kräver levererad/färdig order och avstämd betalning, väntar minst 72
  timmar efter periodslut, fryser underlaget och kräver två olika superadmins.
  En sen refund efter en redan betald payout bokas i en separat recovery-ledger
  och dras automatiskt från kommande payouts; restbelopp bärs vidare. Före
  godkännande/betalning PSP-revideras både målperioden och samtliga tidigare
  `PAID`-källperioder utan total cap. En utbetalningsbar rad blockerar hela
  perioden om provider inte är exakt Mollie eller om Mollie-referensen saknas;
  Stripe/Adyen/okänd legacy betalas inte ut utan separat manuell granskning.
  Ett fingerprint av order-id, PSP-referens, status, refundbelopp och lokal
  ekonomirevision måste vara identiskt före och efter hela PSP-svepet och
  jämförs därefter inne i payout-transaktionen/recovery-beräkningen. En ändring
  eller ny rad under svepet ger full retry i stället för ett o-auditerat proof.
- Legacykod för äldre providerreferenser finns kvar för befintliga poster;
  den innebär inte att launch har bytt bort Mollie.

### Auth, åtkomst och API-säkerhet

- Orderns Socket.IO-rum och webbpush kräver ett signerat, orderspecifikt bevis
  med fem minuters livslängd. Telefonnummer är inte orderbehörighet.
- Referralprofil för gäst kräver färdig order plus orderns hemliga
  åtkomsttoken. Inloggat konto använder sin egen auth.
- Webbläsaren växlar sin engångshemlighet till en HttpOnly-ordersession och
  använder därefter ett signerat femminutersbevis. Native-kompatibilitet får
  tills app-etappen använda råbeviset högst 30 minuter för pushregistrering;
  det kopplar aldrig en gästinstallation till ett helt konto.
- Pushinstallationer lagras per enhet med AES-GCM-krypterade provider-token.
  Durable outbox, retry/backoff, lease, statusdedupe, kraschåterhämtning och
  leveransstatistik gör provideracceptans mätbar utan att påstå att kunden
  faktiskt läste notisen.
- Web Push-ingress tillåter endast kända HTTPS-providerhosts, begränsar antal
  enheter och serialiserar samma fysiska subscription över API-repliker.
  Utskick serialiseras dessutom per order och kontrollerar aktuell status under
  lås, så en långsam äldre status aldrig kan ersätta en nyare notis.
- Kundinloggning är endast verifierad telefon-SMS, Google eller Apple. Gamla
  kundlösenords-/reset-/e-postverifieringsrutter svarar 410 och deras sex
  credentialkolumner tas bort. Adminlösenord och 2FA är ett separat system.
- Adminwebben använder HttpOnly-cookie i stället för JWT i `localStorage`.
  Inloggningssvaret lämnar inte tillbaka browserns admin-token.
- “Logga ut överallt” respekterar sessionsversion även för äldre tokens.
- Socket.IO-admin läser samma säkra cookie som HTTP-lagret.
- Generell JSON-gräns är 1 MB. Den större leveransbilden har en separat,
  avgränsad gräns.
- Endast exakta betalwebhook-rutter får undantas från generiska limiters.
- Dev-testordrar är hårt avstängda i produktion även om miljövariabeln råkar
  sättas.

### Prelaunch-lås

- `PRELAUNCH_MODE=1` blockerar direkt skapande av order och betalning på API:t
  om anropet inte kommer via den upplåsta webben.
- Webb och API verifierar ett HMAC-bevis skapat från samma
  `LAUNCH_ACCESS_COOKIE_SECRET`.
- Launchkoden sparas inte i source eller cookie. En riktig 64-teckens SHA-256
  rekommenderas i `LAUNCH_ACCESS_CODE_SHA256`; den tidigare konfigurationen
  där exempelvis `7970` låg direkt i samma variabel stöds också och hashades
  vid runtime.
- Kodförsök begränsas och den upplåsta cookien är `HttpOnly`, `Secure` i
  produktion och `SameSite=Lax`.

### Webb

- En påbörjad Mollie-order återupptas efter omladdning eller avbruten retur.
- Redan betald replay behandlas idempotent i stället för som ny order.
- Utloggning rensar lokala orderbevis och offline-cache så nästa användare på
  enheten inte ärver orderåtkomst.
- Referraltext kommer från serverns aktiva erbjudande och skiljer tydligt på
  kontoåtkomst och gästorderbevis.
- Launch-checklistan beskriver Mollie, inte Stripe.
- Launch-sidan skriver ingen anonym eller pseudonym besöks-/klickmätning.
  Namn, e-post och uttryckligt samtycke krävs innan en lead skapas; policy,
  villkor och kontakt är nåbara även när launchgaten är låst.
- En lead får en unik 30 %-kupong som skapas inaktiv och reserveras i databasen.
  Ingen automatisk e-post sker. Admin markerar manuellt när kontakten är gjord,
  och statusen auditloggas så statistiken aldrig blir falskt grön.
- En enkel `viaeats_launch_interest`-cookie och lokal fallback gör att en
  återvändande besökare ser tackmeddelandet i stället för formuläret.
- Gästordern växlas till en orderspecifik HttpOnly-cookie. Push, historik och
  tracking använder ren `/order/{id}` utan token i URL eller ny JavaScript-
  lagring. En vanlig kontosessionsrefresh bevarar orderhistorik, adress och
  påbörjad betalningsåterställning.
- Logout är fail-closed även offline: service workerns push stoppas före
  nätanrop, exakt browserinstallation återkallas och alla kundbundna order-,
  deal-, favorit-, kvitto- och offlinecachar rensas. Saknad eller annan tidigare
  identitet behandlas som kontobyte; verifierbar same-user-refresh bevaras.
- Sparade erbjudanden har en riktig `/deals/{id}`-sida som bara visar aktiva,
  kundsynliga deals och deras tillåtna restauranger.

### Admin

- Tillfälligt nätfel eller 5xx loggar inte längre ut administratören.
- Menyeditorn kräver explicit, validerad restaurang och kan inte falla tillbaka
  till poster från en annan restaurang.
- Referralvyn har paginering, tomläge och tydliga fel.
- Kundsidan är responsiv för registrerade kunder, gästkunder och
  konverteringar.
- Restaurang-, enhets- och övriga berörda mobilvyer har säkrare brytpunkter
  och textlayout.
- Ny sida `Tillväxt → Launch-kampanj` visar endast samtyckta leads och deras
  manuella kupongstatus. Den visar inga pseudonyma besökare, klick eller
  referrerbaserade funnels.
- Leadkön använder stabil cursorpaginering över hela historiken; inget tyst
  100-tak kan gömma manuella kontakter.
- Godkända/betalda payouts visar och skriver ut sina frysta snapshots och
  sparade belopp, aldrig nuvarande provision som om den gällde historiken.

### Seed- och repositorysäkerhet

- Destruktiva/emergency-seeds vägrar produktion före första databasanropet,
  kräver en exakt lokal opt-in och starka `SUPER_ADMIN_*`-miljövariabler.
- Kända adminlösenord/fasta identiteter är borttagna. Lokala SQLite-databaser
  med utvecklingshashar är ignorerade och ska avspåras från Git utan att den
  lokala arbetskopian raderas.

### Swift kundapp

- Påbörjad betalning återupptas endast när varukorgens fingeravtryck matchar;
  gammal betalning kan inte återanvändas för en ändrad varukorg.
- Betald order behåller sitt säkra orderbevis för tracking och historik.
- Notisbadgen och routing hanteras vid kallstart, varmstart och notistryck.
- Gäster kan registrera APNs efter order med samma säkra 30-minutersbevis som
  Android.
- Simulator-Debug och osignerad fysisk Release-build passerar.

### Kotlin kundapp

- Notis- och deeplink-intent hanteras även när appen redan är varm.
- Påbörjad betalning kan återställas appövergripande.
- Referral-/kupongflödet har samma regler som webb och iOS.
- Gästhistorik visar de 20 senaste relevanta ordrarna.
- Tester, lint och assemble passerar.

### Flutter restaurangapp och kurirapp

- Restaurangutskrift är serialiserad och deduplicerad så samma order inte
  skrivs ut flera gånger parallellt.
- Sunmis retry återupptar bara saknade kvittokopior efter partiellt fel.
- Kurirpolling är single-flight och gamla svar kan inte skriva över en ny
  session.
- Push, badge, plats och polling stoppas korrekt vid logout och generationsbyte.
- Release-APK får inte längre tyst signeras med debugnyckel när release-signing
  saknas.
- Sunmi V2-overlay och accept-resultat har fått kortare, samlade animationer
  och färre dubbelrenderingar. Den första utskriften startar efter första
  renderingen så ny order och accept känns snabbare på 2 GB RAM.
- Test-APK:er byggdes lokalt:
  `mobile_apps/Delivera flutter business/build/app/outputs/flutter-apk/app-sunmi-v2-debug.apk`
  och `.../app-universal-debug.apk`.

## Databas

Aktiv modell är `packages/api/prisma/schema.prisma`.

- Full baseline för tom PostgreSQL:
  `docs/database/baseline/20260715_schema.sql`.
- Idempotent tenant-patch:
  `20260715103000_isolate_restaurant_menus/migration.sql`.
- Idempotent betalnings-/momspatch:
  `20260715150000_payment_tax_snapshots/migration.sql`.
- Idempotenta patchar för launchleads, durable push/outbox, kundtombstones,
  borttagna kundcredentials och payout-recovery finns därefter i ordningen
  `20260715180000`, `20260715203000`, `20260715210000`, `20260715213000` och
  `20260715220000` och den append-only refund-ledgern `20260715223000`. Exakt
  körordning finns i databas-runbooken.
- Historiska betalda order backfillas som redan färdigbehandlade; nya order
  använder `paymentEffectsCompletedAt` för hållbar reparation.
- Databasdefault för `paymentProvider` tas bort så applikationen fryser korrekt
  provider explicit.

Kör inte `prisma db push`, `migrate dev`, `migrate reset` eller `migrate
deploy` mot produktion innan permanent Prisma-baseline är genomförd. Följ den
separata databas-runbooken ordagrant.

## Verifiering som passerar

- Komplett `pnpm build`: API, webb, admin och kurir.
- API TypeScript: `tsc --noEmit`.
- API-kontrakt: backend, orderstatus, refund, Mollie-rader, orderåtkomst,
  orderprissättning/tillval, kundnotiser, deviceåtkomst, Hermes, referrals,
  readiness, request security och prelaunch-bevis.
- Kundwebbens samtliga 30 kontrakt passerar.
- Databas: baseline på tom PostgreSQL samt idempotens/integritetskontroll för
  alla åtta produktionspatcherna.
- Webbens produktionsbuild och HTTP-smoke i låst/upplåst prelaunchläge passerar.
- Admin: lint, typer och produktion-build.
- Swift: Debug för simulator och osignerad Release för fysisk iPhone.
- Kotlin: tester, lint och assemble.
- Flutter restaurangapp: åtta affärstester.
- Flutter kurirapp: fem tester och ren analyze.

## Manuella blockerare före offentlig launch

1. Ta verifierad backup/PITR och kör de åtta SQL-patcherna i rätt ordning enligt
   databas-runbooken **före** API-deploy.
2. Sätt `PAYMENT_PROVIDER=mollie`, riktig `MOLLIE_API_KEY=live_...` och publik
   HTTPS-webhook. Genomför en riktig lågprisorder och full refund.
3. Under smoke test: sätt `PRELAUNCH_MODE=1` på API och samma starka
   `LAUNCH_ACCESS_COOKIE_SECRET` på webb och API. Öppna först därefter webben
   med launchkoden. Vid offentlig öppning sätts `PRELAUNCH_MODE=0`.
4. Kontrollera `/ready`: databas, Supabase, Maps, FCM, APNs, VAPID och separat
   push-tokenkrypteringsnyckel måste vara gröna. Sätt även Sentry. Om Redis
   saknas får exakt en API-replika köras. Launchkuponger följs upp manuellt och
   kräver ingen Gmailtransport.
   `checks.databaseSchema` måste också vara `ok`; kör därefter
   `EXPECT_PRELAUNCH_MODE=1 pnpm launch:verify-live` före den riktiga testordern.
5. Skapa och säkerhetskopiera permanent Android release-keystore. De gamla
   leverantörs-APK:erna är testartefakter och ska inte behandlas som slutlig
   signerad release.
6. Skapa signerat iOS-arkiv och verifiera production APNs-entitlement,
   universal links, kallstart och badge på riktig iPhone.
7. Kör fysisk Sunmi V2-test: kallstart, inkommande order, ljud, accepterande,
   två kvittokopior, pappersslut mitt i utskrift, omstart, offline/online och
   kinesisk VPN-latens.
8. Kör ett äkta end-to-end-flöde för delivery och pickup: order, Mollie,
   restaurangpush, accept, bud/egen leverans, kundpush, levererad/hämtad,
   adminhistorik och refund.
9. Kontrollera loggar och Sentry efter smoke test. Öppna inte checkout om
   någon betalning ligger i `NEEDS_REVIEW`, någon refund fastnar i
   `REFUNDING`, tenantkontrollen avviker eller `/ready` har ett fel.

## Medvetet inte gjort

- Ingen flytt från Mollie till Stripe. Refund-initiering via Stripe/Adyen är
  också blockerad tills legacyflödena har en komplett verifierad livscykel.
- Ingen produktionsdeploy eller produktionsdatabasskrivning.
- Ingen radering av orelaterade legacytabeller eller befintlig affärsdata.
- Ingen ny release-signingnyckel skapad utan beslutad säker lagringsplats.
- Ingen garanti om fysisk push, skrivare eller riktig betalning utan ovanstående
  end-to-end-test på produktionslik miljö.
