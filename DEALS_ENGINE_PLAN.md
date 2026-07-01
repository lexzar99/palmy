# Delivera Deals Engine — Mall + variant-motor (per kund)

> Grundad i kodgenomgång (schema, API, lib, admin, Swift-klient + targeting-sweep).
> Mål: Wolt/Foodora-känsla (vissa kunder får 20%, andra 30%, andra fri leverans /
> dpoints), men **enkelt, premium och mätbart**. Bygger på befintlig
> `Deal`→`UserDeal`-spine. **Additivt mot delade Supabase-prod-DB, inga drops,
> kör ingen migrate oombedd.**
> Beslut (ägare): **Mall+variant-motor** · **ingen push i v1** · **konsolidera stegvis**.

## §0. Verifierade fakta (från koden, inte antaganden)
| Idé | Verklighet i koden | Beslut |
|---|---|---|
| "Allt hårdkodat" | Ekonomimotor, `UserDeal`, claim/quote/apply-loop finns och funkar | Bygg PÅ dem, inte om |
| Per-kund-kupong saknas | `UserDeal` (schema.prisma:973-993) binder deal→user, snapshot från `Deal`-mall (som referral) | Motorns lagringsprimitiv |
| Segment saknas | Cohort-resolver finns: `inactive_30d`/`new_users_7d`/`active_repeaters` men driver bara push (scheduledPushDispatcher.ts:106-141) | Lyft ut och återanvänd för deals |
| Slump per kund | `appWeight` slumpar bara kort-rotation (deals.ts:324), inte tilldelning | Ny deterministisk variant-hash |
| Klient dynamisk? | Klienten renderar vad servern skickar; men copy/tema/6 kort hårdkodade (SponsorCard.swift) | Server-driven copy, behåll 6 mallar som designsystem |
| Två per-kund-system | `UserDeal` OCH `Campaign→CustomerDeal` gör nästan samma | Konsolidera stegvis på UserDeal |
| Schema/cron | Inget riktigt cron; `setInterval` i index.ts (24h/60s/5min) | Återanvänd befintlig slot |

## §1. Så funkar motorn (dataflöde)
```
Deal (isTemplate=true)      DealCampaign (ny)              Tilldelningsjobb (schemalagt)
20% ┐                       segment: inactive_30d          variant = weightedPick(
30% ├─ variant-pool ──────► vikter: 40/30/30                 variants, hash(userId+campaignId))
fri leverans ┤              validDays: 7, cap: 1/kund   ──► skapa 1 UserDeal/kund
+50 dpoints ┘              scheduledAt: nu/tisdag             (dealId + snapshot + metadata)
                                                                     │
                                        GET /api/deals/app mappar tilldelad UserDeal → HomeAppDeal-DTO
                                                                     │  (klienten oförändrad)
                                                                     ▼
                                        Checkout: befintlig /quote + apply (orörd)
```
**Deterministisk slump:** `hash(userId + ":" + campaignId) mod summa(vikter)` väljer variant.
Ser slumpmässigt ut, men är stabilt (samma kund → samma deal), cappat (1/kund) och
A/B-mätbart. Inget `Math.random` i tilldelningen.

## §2. DB — ADDITIVT (kör i Supabase SQL-editorn, diffa först, INTE `prisma db push`)
```sql
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "isTemplate" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "DealCampaign" (
  "id" TEXT PRIMARY KEY,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',      -- DRAFT|SCHEDULED|ACTIVE|PAUSED|DONE
  "segment" TEXT NOT NULL DEFAULT 'ALL',        -- ALL|new_users_7d|inactive_30d|active_repeaters
  "restaurantId" TEXT, "brandId" TEXT,          -- scope (null = globalt)
  "variants" JSONB NOT NULL DEFAULT '[]',       -- [{dealTemplateId, weight}]
  "capPerCustomer" INTEGER NOT NULL DEFAULT 1,
  "validDays" INTEGER NOT NULL DEFAULT 7,
  "scheduledAt" TIMESTAMP(3), "lastRunAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "DealCampaign_status_scheduledAt_idx" ON "DealCampaign"("status","scheduledAt");
```
- Spegla identiskt i BÅDA `packages/api/prisma/schema.prisma` OCH `packages/db/prisma/schema.prisma`, `prisma generate`.
- `UserDeal.metadata` (JSON, finns redan) bär `{ campaignId, variant, cohort, assignedReason }`. **Ingen migration för det.**
- Inga drops. `Campaign`/`CustomerDeal`/magiska titelsträngar lämnas orörda (konsolideras i §6).

## §3. Backend
**NYTT:** `packages/api/src/lib/segments.ts` — lyft ut delad cohort-resolver (idag dubblerad i
`notifications.ts:233-271` och `scheduledPushDispatcher.ts:106-141`). Exportera
`resolveSegmentUserIds(segment)` + `countSegment(segment)`.

**NYTT:** `packages/api/src/lib/dealAssignment.ts`
- `weightedPick(variants, seedStr)` — stabil hash (FNV-1a), inget Math.random.
- `runDealCampaign(campaign)` — resolve segment → för varje user utan UserDeal med
  `metadata.campaignId == campaign.id` (dedupe/idempotent): välj variant, snapshotta
  `discountType/discountValue/freeDelivery/amountKr/discountPercent` från mall-`Deal`
  (återanvänd claim-snapshot-logiken deals.ts:418-440), skapa UserDeal
  `{ type:'CAMPAIGN', expiresAt: now+validDays, metadata }`. Sätt `lastRunAt`.
- `runDueDealCampaigns()` — plocka SCHEDULED där `scheduledAt<=now` + ACTIVE, kör.

**MODIFY:** `packages/api/src/index.ts` — anropa `runDueDealCampaigns()` i befintlig
schemaloop (24h-sloten räcker för v1; 60s om "kör nu" ska kännas direkt).

**MODIFY:** `packages/api/src/routes/deals.ts`
- `GET /app` (259-342): hämta även användarens ACTIVE, icke-utgångna, CAMPAIGN-`UserDeal`s,
  mappa var och en → `HomeAppDeal`-DTO (title/subtitle/badge/template/theme från mall-Deal +
  snapshot-värden, `checkoutApplicable=true`, `alreadyClaimed=true`), lägg först i listan.
  **Klienten renderar detta oförändrat.**
- `/quote` (452-503) laddar redan ACTIVE UserDeal för `req.user` → tilldelade deals
  prissätts genom befintlig `calculateUserDealQuote` (201-255). Verifiera, ingen ändring väntad.

**NYTT (admin):** `packages/api/src/routes/dealCampaigns.ts` (requireSuperAdmin) — CRUD +
`POST /:id/run` (kör nu) + `GET /:id/preview` (segment-count via `countSegment`).

## §4. Admin-panel
**MODIFY:** `apps/admin/src/modules/deals/` — gör de 5 hårdkodade preset-knapparna
(page.tsx:421-514) till riktiga, redigerbara mall-`Deal`s (`isTemplate=true`, döljs ur
publika feeds).
**NYTT:** flik "Kampanjer" (mall+variant): välj segment (dropdown av cohort-nycklar), 2-4
variant-mallar med vikter, `validDays`, cap, schema (nu/datum). Live preview: "~N kunder
matchar". Knapp "Kör nu". Enkelt, monokromt, inga verbosa beskrivningar.

## §5. Swift-klient (minimal)
- Ingen ny renderingskod behövs för tilldelade deals (server mappar till `HomeAppDeal`).
- **MODIFY** [SponsorCard.swift] / [HomeComponents.swift]: föredra alltid server-`badge`/
  `subtitle`/`ctaLabel` (delvis redan), använd `imageUrl` i fler mallar än spotlight.
- **REMOVE**: test-order-hårdkodning ("Jalle Test"/"0700000000"/discountCode "test",
  HomeView.swift:936-959) och test-knappen i kassan (CartView.swift:567-588).
- Behåll de 6 korttemplaten som designsystem (premium = stramt tema + dynamiskt innehåll).

## §6. Konsolidering (stegvis, efter att motorn är live)
- Nya deals går via `UserDeal`-spine. `Campaign`/`CustomerDeal` lämnas orörda tills motorn
  täcker deras fall, migrera sedan bort.
- Ersätt magiska titelsträngar i `loyalty.ts` ('Välkomst'/'VIP'/'Saknar dig', 30-42/53/123)
  med `DealCampaign.segment` + `campaignType`. Welcome/winback blir vanliga kampanjer.
- Ta bort vilseledande "Bull generate"-kommentar (campaigns.ts:157).

## §7. Mätning (gör det "effektivt")
- Tilldelat: räkna UserDeals per `metadata.campaignId`.
- Inlöst: `UserDeal.usedAt`/`usedOnOrderId` finns redan → konvertering per variant.
- v1 = tilldelat vs inlöst per variant (räcker för att se vilken rabatt som drar). Impression-
  logg + riktig A/B/holdout är senare (full beteendemotor).

## §8. Exekveringsordning
1. Additiv SQL (diffa) + båda schema.prisma + `prisma generate`. **Vänta på grönt ljus.**
2. `segments.ts` (extrahera) + `dealAssignment.ts` + scheduler-wire + `dealCampaigns.ts`.
3. `/app`-DTO-mappning; verifiera `/quote` applicerar tilldelad deal.
4. Admin: mallar + kampanj-byggare + preview + kör-nu.
5. Swift: server-driven copy, imageUrl, ta bort test-kod.
6. Konsolidering (§6).
7. Verifiera: tilldela mot testsegment (prefixad testdata), claim-fritt kort visas, checkout
   drar rätt rabatt, cap 1/kund håller, utgång funkar.

## §9. Öppna beslut
1. Segment i v1 = de 3 befintliga cohorterna + ALL? (rek: ja, custom-segment senare)
2. Tilldelningskadens: 24h-sloten (billigt) eller 60s för att "Kör nu" ska kännas direkt? (rek: 24h + "Kör nu" kör synkront)
3. Ska tilldelad deal kräva "reveal"-tap eller visas direkt som aktiv? (rek: visas direkt, "Din deal", premium)
