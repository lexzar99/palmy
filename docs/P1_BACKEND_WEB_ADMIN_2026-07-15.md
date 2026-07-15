# ViaEats P1 — backend, webb och admin

Datum: 2026-07-15
Omfattning: API/backend, kundwebb och superadmin. Native kundappar,
restaurangapp och kurirapp tas i nästa etapp.

## Låsta produktbeslut

- Kundinloggning är endast verifierad telefon-SMS, Google eller Apple.
  ViaEats har inget kundlösenord och ingen kundinloggning via e-postlänk.
- Admin behåller sitt separata lösenord och 2FA. Kurirens separata
  personalinloggning påverkas inte av kundbeslutet.
- Mollie är enda provider för nya produktionsbetalningar och refunds i API:t.
  Stripe och Adyen får bara finnas kvar för read-only avstämning av historiska
  poster tills hela deras legacyflöden har härdats.
- Order och ekonomiska poster får inte hard-deletas.
- Bulk-/krisrefund finns inte. Refund görs manuellt, en order i taget.
- Restaurangpublicering blockeras inte av en automatisk onboarding-checklista;
  ViaEats granskar detta manuellt.
- Launchkuponger kontaktas och markeras manuellt. Ingen automatisk e-post utger
  sig för att vara skickad.

## Vad betyder "token"?

Token betyder här en teknisk nyckel eller adress. Det är inte poäng, pengar
eller en rabattvaluta.

| Typ | Enkel förklaring | Varför den behövs | Livslängd/lagring |
| --- | --- | --- | --- |
| Orderhemlighet | En slumpad växlingsnyckel till exakt en order | Ger äldre klienter ett tidsbegränsat bevis för exakt den ordern | Ny webb får aldrig rånyckeln: servern sätter ordersessionen direkt. En gammal redan sparad webbnyckel kan växlas och förbrukas en gång. Native-kompatibilitet är tillfälligt högst 48 timmar; pushregistrering med rånyckeln högst 30 minuter |
| Ordersession | En signerad `HttpOnly`-cookie för exakt en order | Låter samma webbläsare öppna ren `/order/{id}` utan synlig hemlighet | Sju dagar, kan inte läsas av sidans JavaScript |
| Orderbevis | Ett kort signerat bevis som skapas från konto/ordersession | Används för Socket.IO och registrering av orderspecifik push | Fem minuter |
| Push-token | Adressen som APNs, FCM eller webbläsaren ger en fysisk installation | Talar om för pushleverantören vilken enhet som ska få notisen | En per installation; krypterad med AES-GCM i databasen och återkallas vid logout/ogiltig token |
| PSP-referens | Mollies betalnings-id | Gör att API:t kan fråga Mollie om belopp/status och göra en kontrollerad refund | Bokföringsreferens, inte kortdata |
| Idempotensnyckel | Ett stabilt unikt namn på ett enda order-, betalnings- eller refundförsök | Gör att en retry efter nätfel återupptar samma åtgärd i stället för att skapa en dubbeldebitering/refund | Sparas för revision och får inte återanvändas för ett annat belopp |
| Kundsession | Signerad servernyckel efter godkänd SMS/Google/Apple-inloggning | Håller kunden inloggad utan ViaEats-lösenord | Webben använder säker cookie; explicit logout återkallar lokal åtkomst |
| Adminsession | Separat signerad session efter adminlösenord och 2FA | Skyddar superadmin | `HttpOnly`-cookie och sessionsversion för "logga ut överallt" |
| Outbox-id/dedupe-nyckel | Internt jobb-id, inte kundbehörighet | Ser till att samma orderstatus inte köas eller levereras dubbelt efter retry/serverstart | Ligger server-side och kan aldrig användas för att öppna en order |

Viktig skillnad: en push-token bevisar inte att någon äger en order. Därför
kräver registreringen dessutom kontoägarskap eller ett kort orderspecifikt
bevis. En orderhemlighet i en pushlänk hade varit som att skriva en nyckel på
utsidan av kuvertet och används därför inte.

## Före och efter — konkreta scenarier

### 1. Kundauth

**Före:** lösenordsreset, e-postverifiering, egna token och Supabase-länkar
överlappade. En gammal väg kunde ge olika förväntningar på nästa endpoint.

**Efter:** gamla kundrutter svarar permanent `410`. Databasfälten för
kundlösenord/reset/e-postverifiering tas bort. Endast verifierad SMS-session
eller Google/Apple accepteras. Google/Apple-identitet hämtas ur den verifierade
provider-sessionen, aldrig ur e-post/provider-id som klienten själv skickar.

**Exempel:** Lisa trycker "Fortsätt med Google". API:t verifierar Googles eller
Supabases signerade identitet och länkar en befintlig e-post endast om den är
verifierad. Ett skript som postar `email=lisa@example.com` utan giltig
provider-session får ingen session.

### 2. Länka telefon till Google/Apple-konto

**Före:** ett OAuth-inloggat konto kunde skicka ett telefonnummer i request-body
utan att endpointen själv verifierade SMS-sessionen för just numret.

**Efter:** backend kräver ett separat verifierat Supabase-telefonbevis och
kontrollerar att dess nummer exakt matchar numret som ska länkas. En säker
kontosammanslagning bevarar order, deals, adresser och enheter och tombstonar
dubbletten.

**Exempel:** en angripare är inloggad med sitt Google-konto men skickar Annas
nummer. Utan Annas aktuella SMS-session blir svaret `401`; konton slås inte ihop.

### 3. Gäst trycker på ordernotis

**Före:** notisen öppnade `/order/{id}` utan ordertoken och gästen kunde få
"Order hittades inte". Att lägga token i URL hade i stället läckt en
bearer-hemlighet till historik, skärmbilder och loggar.

**Efter:** lyckad webbcheckout sätter en orderspecifik `HttpOnly`-cookie direkt;
ny webb får aldrig den råa orderhemligheten. En gammal lokalt sparad webbnyckel
kan växlas och förbrukas exakt en gång. Pushen innehåller bara ren
`/order/{id}`. Samma webbläsare kan öppna ordern utan att JavaScript eller URL
känner till hemligheten.

**Exempel:** Amir beställer som gäst, tillåter webbpush och stänger fliken.
Notisen "Maten är på väg" öppnar samma order direkt. Ett annat konto eller en
annan webbläsare som bara gissar order-id får ett neutralt nekande svar.

### 4. Vanlig sessionsrefresh

**Före:** en stale profilsession kunde köra samma fulla rensning som explicit
logout och därmed ta bort lokal orderhistorik eller en påbörjad
betalningsåterställning.

**Efter:** credential-refresh för samma kund rensar bara den gamla
kontosessionen. Ordercookie, orderreferenser, adressdata och pending payment
bevaras. Explicit logout eller ett verifierat byte till en annan kund rensar
däremot den föregående kundens lokala data och pushägarskap.

**Exempel:** Saras Google-session behöver bytas medan en Mollie-retur väntar.
Efter refresh fortsätter betalningsåterställningen; efter att Sara själv väljer
"Logga ut" rensas däremot lokala kundbevis.

### 5. Launchdata och samtycke

**Före:** launchklick kunde spara beständig sessionidentifierare, referrer och
user-agent efter analyticssamtycke. Det var pseudonym mätning och policylänkarna
var inte alltid nåbara genom launchgaten.

**Efter:** ingen separat launchbesökare, klickhistorik, referrer eller
sessionsidentifierare lagras. Först när personen skickar namn, e-post och ett
uttryckligt kontaktsamtycke skapas en `LaunchLead`. Integritet, villkor och
kontakt är alltid åtkomliga när gaten är låst.

**Exempel:** en person besöker sidan och lämnar den utan formuläret: ingen
launchrad skapas. En person som fyller i formuläret: endast namn, e-post,
samtyckestid och kupongstatus sparas.

### 6. Manuell launchkupong

**Före:** gränssnittet kunde säga att kupongen mejlats trots att SMTP saknades
och backend bara hade loggat ett meddelande.

**Efter:** en unik, inaktiv 30-procentskod reserveras atomiskt. Admin visar
"Väntar på manuell kontakt" tills en admin uttryckligen markerar den som
manuellt skickad; åtgärden kan ångras och auditloggas. Ingen automatisk e-post
sker.

**Exempel:** SMTP är helt okonfigurerat. Kunden ser bara att intresset är
registrerat, och admin får aldrig en falsk grön "mejl skickat"-status.

### 7. Sparade erbjudanden

**Före:** ett sparat erbjudande länkade till `/deals/{id}`, som saknades.

**Efter:** sidan finns, hämtar dealens tillåtna restauranger och avvisar
inaktiva, utgångna eller interna mall-deals.

**Exempel:** kunden öppnar en aktiv pizzadeal och ser vilka restauranger som
kan ta emot den. En gammal utgången länk blir inte en beställningsbar rabatt.

### 8. Refund

**Före:** ett krisflöde kunde tolka slutdatum som midnatt, tyst stanna efter
100 order och ändå visa "klar". Ett felklick kunde därför bli både ekonomiskt
farligt och ofullständigt.

**Efter:** bulk-/krisrefund-rutter är fail-closed med `410` och knapparna är
borttagna. Refund initieras en order i taget, mot Mollies faktiska status och
belopp. Reconcile fångar även refunds som skapats direkt hos PSP:n.

**Exempel:** 140 order påverkas av ett avbrott. Admin pausar nya order men får
inte en knapp som återbetalar 100 av dem och glömmer 40. Varje verklig refund
granskas och kan stämmas av mot ordern.

### 9. Restaurangpublicering

**Före och efter:** publicering blockeras inte automatiskt på konto, 2FA, meny,
öppettider, zon, bank, printer eller testorder. Detta är ett uttryckligt
produktbeslut och måste därför täckas av ViaEats manuella launchchecklista.

**Exempel:** en restaurang kan tekniskt publiceras utan printer. Den manuella
ansvariga måste kontrollera den före launch; readiness påstår inte att denna
affärskontroll är automatiserad.

### 10. Mollie som enda launchprovider

**Före:** flera providergrenar kunde användas för nya betalningar och vissa
legacyvägar var inte tillräckligt tydligt avgränsade.

**Efter:** produktion vägrar starta med annan aktiv provider än Mollie, och nya
legacy-checkoutvägar nekas. Stripe/Adyen-kod får bara läsa och reconcila
historiska referenser; klientverifiering och refund-initiering är fail-closed.

**Exempel:** `PAYMENT_PROVIDER=stripe` i produktion gör readiness/start röd i
stället för att tyst ta nya Stripe-betalningar.

### 11. Radering av order och ekonomi

**Före:** adminrutter, wipe-script eller seeds kunde hard-deleta order, och en
restaurangrelation kunde kaskadradera payoutspår.

**Efter:** order-delete/wipe svarar `410`, destruktiva seeds vägrar köra när
affärsposter finns, payoutens foreign key är `RESTRICT` och databastriggers
blockerar `DELETE` av både `Order` och `RestaurantPayout`. Kundradering
anonymiserar/tombstonar profilen men behåller bokföringsspåret.

**Exempel:** även om någon kringgår admin-UI och kör ett direkt `DELETE` mot en
order stoppar PostgreSQL-triggern operationen.

### 12. Payout

**Före:** en payout kunde skapas från fel orderstatus/betalstatus, ändras efter
godkännande eller betalas av samma admin. Refunds och ofärdiga order kunde ge
fel partnerbelopp.

**Efter:** endast `DELIVERED`/`COMPLETED` med `PAID` eller konsistent
`PARTIALLY_REFUNDED` räknas. Kumulerad refund dras exakt en gång, varje order
måste ha varit i sitt senaste terminala tillstånd i minst 72 timmar, ofärdiga
poster blockerar, och varje utbetalningsbar rad måste vara verifierbar som
Mollie med exakt betalningsreferens. Stripe, Adyen, okänd provider eller saknad
referens blockerar perioden. Underlaget fryses vid godkännande och en annan
superadmin måste betala med referens. Överlappande perioder och samtidiga
uppdateringar nekas. PSP-auditen binder dessutom orderns referens, status,
refundbelopp och lokala revision både före/efter hela svepet och inne i den
serialiserbara transaktionen; minsta ändring ger full retry. Om en refund ändå
kommer efter att payouten betalats räknas den gamla perioden om med sin frysta provision,
leveransmodell och avgiftsmoms. Exakt återkravsbelopp reserveras i en separat
ledger, dras automatiskt från nästa payout och ett restbelopp bärs vidare tills
det är helt avräknat. Betalda legacy-payouts utan sådan snapshot blockerar
readiness och kräver tvåpersonsaudit/backfill i stället för en gissning.

**Exempel:** admin A godkänner vecka 28. Om refundbeloppet ändras före betalning
får admin B inte markera payout som betald; underlaget måste pausas och
godkännas på nytt. Om 180 kr i korrekt partnernetto återstår att återkräva men
nästa payout bara rymmer 120 kr, dras 120 kr där och 60 kr ligger kvar till
följande period—inget belopp tappas eller dubbelräknas. Om en Mollie-referens
byts medan auditsvepet pågår sparas ingen payout; hela revisionen börjar om.

### 13. Multi-device push och mätbar leverans

**Före:** en ny token kunde skriva över en annan enhet, processkrasch tappade
notisen och providerfel saknade konsekvent retry/diagnostik.

**Efter:** varje installation har egen rad, hemligheten är krypterad och hash
används för dedupe. Web Push accepterar endast riktiga kända HTTPS-provider-
hosts, högst sex webbenheter per order och tjugo per konto. Samma fysiska
subscription serialiseras i PostgreSQL så två parallella konton aldrig kan
behålla varandras orderrelation. En durable outbox använder lease,
retry/backoff i ungefär ett dygn, kraschåterhämtning och statusdedupe. Skickning
serialiseras per order över API-repliker och kontrollerar aktuell status under
lås, så en långsam `PREPARING` aldrig kan landa efter `READY`. En reconcilerare
reparerar den aktuella orderstatusen om statuscommit lyckades men enqueue
misslyckades. Admin ser accepted, invalid, retry och dead per leverantör/enhet,
och `/ready` övervakar att workers faktiskt lever.

**Exempel:** FCM ligger nere när restaurangen accepterar ordern. Jobbet ligger
kvar och försöker igen; en serverrestart tappar det inte. Om samma kund har två
telefoner får båda sina aktiva installationer notisen. En native gästinstallation
får bara den order som bevisades, inte framtida konto- eller andra ordernotiser.
"Accepted" betyder att leverantören tog emot meddelandet, inte ett bevis på att
människan läste det.

### 14. Logout, kontobyte och delad enhet

**Före:** nätfel under logout eller en saknad/utgången tidigare kontocookie
kunde lämna ordercookies, offlinekvitton, favorit-/dealstate eller en gammal
PushManager-prenumeration åt nästa person på samma webbläsare.

**Efter:** logout skriver först en fail-closed spärr, stoppar service workerns
pushvisning, återkallar exakt browserinstallation och rensar all kundbunden
lokal state även om nätet är nere. En icke-hemlig kund-id-markör skiljer en
utgången same-user-cookie från ett riktigt kontobyte. Oläsbar/annan cookie eller
annan markör rensar ordercookie, cart, dynamiska kvitto-, favorit-, deal-,
review- och betalmetodsnycklar. Saknad servercookie återkallar alltid gammal
push, men en första gäst→konto-inloggning får behålla sin legitima cart och
ordersession.

**Exempel:** Anna loggar ut på en delad surfplatta medan nätet bryts. Bo loggar
senare in. Bo kan varken se Annas cart/orderhistorik/deal eller få Annas gamla
ordernotis, även om pushprenumerationen hade överlevt cookies och storage.
Om gäst-Amir i stället skapar sitt första konto mitt i sin egen beställning
behålls Amirs cart/order, men en okänd gammal pushprenumeration återkallas.

### 15. Providerlås och dubbla betalningar

**Före:** två samtidiga create-/verify-vägar kunde försöka binda samma order
till olika PSP-referenser, och en äldre Adyen-verify-rutt kunde finalisera
klientrapporterad status.

**Efter:** nya betalningar är Mollie-only. Orderns provider och exakta
Mollie-referens binds med compare-and-swap; en konflikt blir
`PAYMENT_PROVIDER_CONFLICT`/`PAYMENT_BINDING_CHANGED`, och finalisering mot en
annan referens går till `NEEDS_REVIEW`. Legacy Adyen-verifiering svarar `410`.

**Exempel:** två flikar klickar betala samtidigt. Bara en Mollie-referens får
bindas till ordern; den andra kan inte skapa en andra sann betalningsväg.

### 16. Individuell, append-only refund-ledger

**Före:** ordern hade främst ett kumulativt refundbelopp. Två partial refunds,
en Dashboard-refund eller en krasch mellan PSP och lokal skrivning saknade ett
fullständigt individuellt revisionsspår.

**Efter:** varje PSP-refund får en egen `PaymentRefund` med provider,
betalnings-/refundreferens, idempotensnyckel, individuellt och kumulativt
belopp, status, källa, aktör, skäl och tidsstämplar. Ekonomifälten är
oföränderliga, foreign key är `RESTRICT` och hard-delete blockeras. Mollie-
reconcile återupptar en oklar intent med samma nyckel; Stripe pagineras fullt;
historiska refunds utan exakt PSP-evidens gör readiness röd.

**Exempel:** 50 kr återbetalas och senare ytterligare 50 kr. Ledgern visar
50/50 kr och 50/100 kr som två poster—inte två poster som båda påstår 100 kr.
Om processen dör efter första PSP-svaret skapas ingen ny 50-kronorsrefund vid
omstart.

### 17. Fryst payout i API och admin

**Före:** admin kunde efter godkännande fortfarande presentera belopp från den
levande orderlistan eller nuvarande provisionssats, trots att payoutens
ekonomiska underlag skulle vara fryst.

**Efter:** `APPROVED`/`PAID` visar och skriver ut sparat gross sales,
orderantal, provision, abonnemang, snapshots och exakt payoutbelopp. Justering
är låst; den levande orderlistan märks endast som referens. Före godkännande
görs en full paginerad Mollie-refundaudit för målperioden och samtliga tidigare
betalda källperioder. Mollies totalsumma måste exakt motsvara alla individuella
paginerade refunds, och alla aktiva/oklara ledgerposter blockerar payout.

**Exempel:** provisionen ändras från 10 till 12 procent efter godkännande.
Veckans redan godkända spec visar fortfarande 10 procent och exakt samma
belopp; 12 procent kan först påverka en senare period.

### 18. Alla launchleads kan hanteras

**Före:** admin hämtade som mest de senaste 100 leadsen och kunde därför ge
intrycket att hela manuella kontaktkön var klar.

**Efter:** stabil cursorpaginering på `createdAt + id` går igenom hela
historiken med nästa/föregående sida. Datumfiltret för diagram påverkar inte
vilka leads som kan kontaktas.

**Exempel:** lead 137 ligger kvar i kön och kan markeras manuellt; den faller
inte bort bakom ett tyst 100-tak.

### 19. Seed- och testdatabassäkerhet

**Före:** gamla emergency-seeds innehöll kända adminuppgifter och kunde köras
mot en tom databas utan ett tydligt destruktivt godkännande. SQLite-filer med
lokala adminhashar låg spårade i Git.

**Efter:** seeds vägrar alla produktionsmiljöer, kräver en exakt explicit
destruktiv opt-in och starka `SUPER_ADMIN_*`-miljövariabler. Inga fasta
adminidentiteter/lösenord finns kvar, fel ger non-zero exit och lokala
SQLite-filer/sidecars ignoreras och avspåras utan att raderas från datorn.

**Exempel:** någon kör ett seedkommando på Railway. Det stoppar före första
databasanropet även om databasen är tom; ingen känd superadmin skapas.

### 20. Native auth-brygga utan bearer i URL

**Före:** en OAuth-brygga kunde lägga ett bearer-token i ett eget
`viaeats://`-schema, vilket kan hamna i OS-/app-loggar och fångas av fel app.

**Efter:** den osäkra bryggan svarar `410` och kräver appuppdatering. Webben
lägger aldrig kund-, order- eller betalningsbearer i query/custom-scheme. De
native apparna måste implementera den nya code-exchange-lösningen i nästa etapp
innan de kan kallas launchklara.

**Exempel:** en gammal app försöker öppna `viaeats://...token=...`; servern
skickar ingen hemlighet och ber klienten uppdatera i stället.

## Kodklar jämfört med produktionsklar

En grön build visar att kontrakten hänger ihop. Offentlig launch kräver även:

1. Verifierad backup/PITR och de granskade SQL-patcherna i exakt runbookordning.
2. `/ready` helt grön med riktiga Mollie-, Supabase-, Maps-, FCM-, APNs-,
   VAPID- och pushkrypteringshemligheter.
3. En riktig lågprisorder och full refund via Mollie.
4. Fysisk pushkontroll för webbläsare, iPhone och Android.
5. Två olika superadmins som godkänner respektive markerar en testpayout som
   betald.
6. Live smoke test med `PRELAUNCH_MODE=1` före offentlig omställning.

Produktionsdatabasen får inte uppdateras med `prisma db push` eller en vanlig
`migrate deploy` innan repositoryts trasiga migrationshistorik har baselinats.
Följ `docs/LAUNCH_DATABASE_RUNBOOK.md`.

## Slutverifiering 2026-07-15

Följande är verifierat grönt i repositoryt:

- API TypeScript-build och båda Prisma-modellerna.
- 18 API-kontraktsviter för bland annat auth, orderåtkomst, refund, payout,
  Mollie, adminauth, request security och push/outbox/reconciler.
- Sju riktiga PostgreSQL-prov: färsk baseline samt tenant-, betalnings-, push-,
  kundauth-, payout-recovery- och refund-ledgermigrationerna, inklusive
  idempotent omkörning.
- Kundwebbens 30 kontrakt, produktionsbuild och HTTP-smoke av startsida,
  integritet, villkor, kontakt, deal-404 och orderroute i både låst och upplåst
  prelaunchläge.
- Admins lint, produktionsbuild, login samt skyddad redirect till
  launchkampanjen.

Detta är ännu inte verifierat grönt i den deployade miljön:

- Den anslutna databasen saknar de åtta granskade P1-patcherna; read-only
  `db:readiness` blockerar därför korrekt deployment.
- `https://api.viaeats.se/ready` svarar `404`, så den byggda readiness-endpointen
  är ännu inte live.
- Riktig 1-kronas Mollie-order/refund, fysisk web/iOS/Android-push och
  tvåadminsflödet för payout måste göras efter kontrollerad DB-patch och deploy.
- Den interaktiva in-app-browsern kunde inte starta i denna arbetsmiljö på
  grund av ett lokalt plugin-importfel. HTTP-smoke är gjort, men slutlig visuell
  klickkontroll i en riktig webbläsare återstår efter deploy.
