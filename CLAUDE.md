# Delivera — guide för AI-agenter

Delivera är en svensk matleveransplattform (konkurrent till etablerade aktörer,
nämn aldrig deras namn i produkt-copy). Lansering: Lund, ~15 restauranger.
Kunden ska känna sig speciell: deals, Dpoints, uppdrag, värvning. Allt styrs
från admin, ingenting hårdkodas i klienterna.

## Fokus och struktur

| Del | Var | Status |
|---|---|---|
| Backend (Express + Prisma + Supabase) | `packages/api` | PRIMÄR |
| Admin-panel (Next.js) | `apps/admin` | PRIMÄR |
| Web-kundapp (Next.js) | `apps/web` | sekundär |
| **Swift kund-app (iOS)** | `mobile_apps/Delivera Swift iOS` | PRIMÄR, git-OSPÅRAD |
| Flutter business (order-mottagning) | `mobile_apps/Delivera flutter business` | rör ej utan uppdrag |
| Flutter kurir-app | `mobile_apps/Delivera courier` | rör ej utan uppdrag |
| React Native kund-app | `mobile_apps/Delivera react app` | UTFASAD, läs inte |

Läs aldrig REACT-MATGO/restaurant_mobile (raderade legacy-mappar).

## Järnregler (bryts aldrig)

1. **Pengar lagras i öre.** API:ts list/detalj-endpoints dividerar /100 före
   svar. Dela ALDRIG igen i klienten. `Deal.discountValue` = öre för FIXED,
   procent-heltal för PERCENTAGE. `Deal.minOrder` = öre.
2. **Två Prisma-scheman:** `packages/api/prisma/schema.prisma` OCH
   `packages/db/prisma/schema.prisma`. Spegla varje ändring i BÅDA, kör sedan
   `npx prisma generate` i packages/api.
3. **Aldrig `prisma db push` eller `prisma migrate` mot databasen.** Lokal dev
   delar Supabase med prod. Schemaändringar = additiv SQL via psql mot
   `DIRECT_URL` (finns i packages/api/.env), dokumentera i
   `packages/api/prisma/migrations_manual/`. Inga drops. Diffa först:
   `npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script`
4. **Testdata prefixas** (t.ex. id/namn med `test`/`TEST`), aldrig anonym
   skräpdata i den delade databasen.
5. **Commit + push till `main` ingår i "klar".** Inga feature-branches/PR.
   Committa aldrig Swift-appen eller RN-appen (git-ospårade med flit).
6. **Ingen AI-verbos copy, inga em-dashes (—) i UI-text.** Kort, äkta svenska.

## Deals-arkitekturen (kärnan i tillväxten)

```
Deal (mall + app-fält: appEnabled/appPlacement/appAudience/appMissionType/…)
  │  claim (POST /api/deals/app/:id/claim)          ← kunden hämtar kortet
  ▼
UserDeal (per kund, SNAPSHOT av värden + metadata)   ← lagringsprimitiven
  │  quote (POST /api/deals/app/quote)               ← kassans server-sanning
  ▼
Order (userDealId valideras igen: ägarskap, expiry, minOrder, restaurang-scope)
```

- `GET /api/deals/app?placement=HOME_TOP|REWARDS|CART` — det kunderna ser.
  Admin-fliken "I appen" (/deals?tab=app) visar exakt samma feed + app-deals.
- **DealCampaign-motorn (auto-kampanjer) är BORTTAGEN** (admin-UI, routes,
  lib/dealAssignment.ts, lib/segments.ts, 24h-schedulern). Gamla UserDeals
  typ CAMPAIGN kan finnas kvar i DB och mergas fortfarande in i HOME_TOP-
  feeden; DealCampaign-modellen ligger kvar i schemat (inga drops).
- Deal-synlighet styrs i kampanjformuläret via "Visas i": Endast appen
  (appEnabled), Endast webben (showOnSite) eller App + webb.
- **Uppdrag (missions):** Deal med `appMissionType` (t.ex. THREE_ORDERS_WEEK)
  + `appDpointsBonus` = belöning. Claim skapar UserDeal typ APP_MISSION;
  `evaluateAppDealMissions` (lib/dpoints.ts) betalar ut efter betald order.
  Progress serveras i feeden (`missionProgress`).
- **Referral, Wolt-stil:** kunden anger väns kod i kassan →
  `POST /api/account/redeem-code` → REFERRAL_INVITEE-UserDeal skapas direkt
  (svaret innehåller `userDealId` så klienten applicerar den i kassan).
  Värvaren belönas efter vännens FÖRSTA betalda order
  (`maybeTriggerReferralReward`, anti-abuse + cap). Egen kod låses upp efter
  1 betald order. Admin: dpoints → Värva vän. Belöningen = personlig
  mall-Deal vald i settings (`referralDealId`).
- **Welcome-offer:** settings `welcomeDealActive` + `welcomeDealId`
  (personlig mall) driver kassans välkomsttoggle.
- UserDeal↔Deal har en riktig Prisma-relation (`include: { deal: true }`
  fungerar). Restaurang-scope: `userDealRestaurantScope()` i `lib/deals.ts`.

## Swift-appen (viktigast för "wow")

- Git-ospårad. Bygg: `xcodebuild -project DeliveraSwift.xcodeproj -scheme
  DeliveraSwift -configuration Release -destination 'generic/platform=iOS'
  build`, installera med `xcrun devicectl device install app --device <id>`.
- **Nya filer MÅSTE registreras i project.pbxproj** (klassiska grupper):
  `python3 Scripts/add_file_to_project.py <Fil.swift> <Grupp>`.
- Auth-token i Keychain via `@AuthToken` (aldrig UserDefaults).
- **Aktiv deal-kontraktet:** AppStorage `delivera.activeUserDealId` +
  `delivera.activeUserDealSnapshot` (JSON av HomeAppDeal). Sätts av
  hemskärmens DealsRail, profilens "Mina deals" och vänkod i kassan; läses av
  CartView som quotar mot servern och skickar `userDealId` på ordern.
  HomeView nollar efter betald order.
- Design: platt, vitt, orange (`DeliveraTheme.orange`) + ink; deal-korten blå
  (`dealBlue`). INGA eviga pulser/glow/shimmer. Spring-animationer 0.3-0.6s.
  Deployment target iOS 17.
- Kassans kodfält accepterar BÅDE rabattkoder och väns referral-kod
  (fallback-ordning: discount/validate → redeem-code).
- Onboarding visas en gång (`delivera.hasSeenOnboarding`).

## Admin-panelen

Monokrom, svartvit (guld/orange är kundappens färg). Kort copy. Ordermodal =
statustrack + en tydlig nästa-steg-knapp. Nav-grupper: Drift | Katalog |
Tillväxt | System — en funktion har EN plats. Deals-huben: Kampanjer | BOGO |
I appen (hantering + live-förhandsvisning), med Utfall-kolumn (hämtade/
inlösta från `stats` i GET /admin/deals). Kuponger bara på /coupons.
Vpoints-flikar: Översikt | Intjäning | Värva vän | Välkomst | Bonuskort |
Aktivitet. Logg-listor visar 15-20 rader + "Visa fler", aldrig allt.
Flik-hubbar: Ekonomi = Utbetalningar | Tiers | Provision & moms; Användare =
Användare | Säkerhet (2FA); Inställningar = Allmänt | Kvitto-mall. Gamla
routes (/tiers, /2fa, /receipts, /finance/installningar) redirectar dit.
Cmd+K söker även kunder/ordrar/restauranger via GET /api/admin/search
(djuplänkar: /customers?id=, /orders?order=). Deal-formuläret har "Skicka
push" som förifyller push-composern (?title=&body=&restaurant=).
Kedjor (/brands) är gömd ur nav tills kedjestödet är klart (nås via Cmd+K).

## Deploy och miljö

- API → Railway (auto-deploy från GitHub `main`). Web + admin → Vercel.
  Prod-secrets bor i Railway/Vercel UI, aldrig i repo. `.env` är lokal.
- API:ts `start`-script kör INTE `prisma db push` (medvetet borttaget —
  `--accept-data-loss` kunde droppa kolumner vid schema-drift).
- Betalningar: Adyen (öre direkt, ingen /100), webhook = sanning, svara
  `[accepted]`. Kort finaliseras via snabb /payments/confirm + reconcile-loop.
- Push: Apple APNs HTTP/2 direkt (aldrig Expo Push API).

## Kända fällor

- `rest:detail`-cachen nycklas på BÅDE id och slug — busta båda vid PATCH.
- R2-bilder: kanonisk path + immutable cache → byt bild via `?v=`-version.
- Öppettider har TVÅ former: platt `{monday}` eller nästlad
  `{regular:{monday}}` — läs alltid `oh.regular?.[k] ?? oh[k]`.
- Dpoints: 1 p/kr, 10 p = 1 kr. Enda earn-hooken är `applyPaymentSuccess`
  (+ missions/review/streak via samma flöde). Av som default per kund tills
  admin slår på.
- iOS-builds för RN-appen: pod install kräver `LANG=en_US.UTF-8`, bygg via
  Xcode (aldrig `expo run:ios`), rensa Metro-cache före Release.
- pnpm workspace root är repo-roten; `pnpm dev` i packages/api startar API:t
  på :4000 mot delade Supabase.
