# ViaEats databas: launch-runbook

Senast verifierad: 2026-07-15.

## Nuvarande status

Den aktiva runtime-modellen är `packages/api/prisma/schema.prisma`.
Produktionsdatabasen och repositoryts Prisma-historik är **inte baselined**:

- produktionens `_prisma_migrations` innehöll bara den registrerade migreringen
  `20260710150000_restaurant_availability_contract` vid kontrollen;
- `packages/api/prisma/migrations` börjar med ändringsmigreringar och saknar en
  fullständig init-migrering;
- `packages/db` är en äldre spegel och dess lock-fil anger SQLite trots att
  produktionen använder PostgreSQL.

Det betyder att `prisma migrate deploy`, `prisma migrate dev` och `prisma db
push` inte får köras mot produktion i nuläget. Rotkommandot `pnpm db:migrate`
är blockerat tills baseliningen är genomförd.

## Filer som är säkra att använda

- Aktiv modell: `packages/api/prisma/schema.prisma`
- Fullt schema för en **tom** PostgreSQL-databas:
  `docs/database/baseline/20260715_schema.sql`
- Idempotent tenant-/arkiveringspatch för befintlig databas:
  `packages/api/prisma/migrations/20260715103000_isolate_restaurant_menus/migration.sql`
- Idempotent betalnings-/momssnapshot-patch för befintlig databas:
  `packages/api/prisma/migrations/20260715150000_payment_tax_snapshots/migration.sql`
- Idempotent launch-lead-patch för namn/e-post, samtycke och unika kuponger:
  `packages/api/prisma/migrations/20260715180000_launch_interest_leads/migration.sql`
- Idempotent push-/outboxpatch för krypterade multi-device-token, retry och leveransmätning:
  `packages/api/prisma/migrations/20260715203000_durable_customer_notifications/migration.sql`
- Idempotent soft-deletepatch för kundtombstones:
  `packages/api/prisma/migrations/20260715210000_customer_soft_delete/migration.sql`
- Idempotent borttagning av pensionerade kundlösenords-, reset- och e-postverifieringsfält:
  `packages/api/prisma/migrations/20260715213000_remove_customer_password_credentials/migration.sql`
- Idempotent payout-recoverypatch för frysta ekonomisnapshots och sena refunds:
  `packages/api/prisma/migrations/20260715220000_payout_late_refund_recovery/migration.sql`
- Idempotent, append-only refund-ledger med PSP-dedupe, immutabilitet och hard-delete-skydd:
  `packages/api/prisma/migrations/20260715223000_durable_refund_ledger/migration.sql`
- Migrationstest: `pnpm --filter @viaeats/api test:migration-isolation`
- Betalningsmigrationstest: `pnpm --filter @viaeats/api test:migration-payment-tax`
- Pushmigrationstest: `pnpm --filter @viaeats/api test:migration-notifications`
- Kundauthmigrationstest: `pnpm --filter @viaeats/api test:migration-customer-auth`
- Payout-recoverymigrationstest: `pnpm --filter @viaeats/api test:migration-payout-recovery`
- Refund-ledgermigrationstest: `pnpm --filter @viaeats/api test:migration-refund-ledger`
- Baslinjetest: `pnpm --filter @viaeats/api test:schema-baseline`
- Read-only kontroll av aktuell databas: `pnpm --filter @viaeats/api db:readiness`

Baslinjen är genererad från den aktiva Prisma-modellen och verifieras mot en
ny, riktig PostgreSQL-instans. Den ska inte köras ovanpå produktion eftersom den
innehåller `CREATE TABLE` för hela systemet.

## Förbjudet i produktion

Kör inte något av följande innan stegen nedan är klara:

```text
prisma db push
prisma db push --accept-data-loss
prisma migrate dev
prisma migrate reset
prisma migrate deploy
pnpm db:migrate
```

## Säker produktionspatch före nästa API-deploy

Den nya API-koden kräver bland annat `Restaurant.archivedAt`,
`Order.clientRequestId`, tenant-index, RESTRICT-foreign keys och frysta
rabatt-/momskomponenter. Gör detta i ett kort underhållsfönster:

1. Stoppa nya checkout-försök och restaurangredigeringar.
2. Bekräfta att Supabase-backup/PITR är aktuell. Om PITR saknas, ta en krypterad
   `pg_dump` och verifiera att dumpen går att läsa innan någon SQL körs.
3. Kör en read-only diff och spara resultatet utanför repositoryt:

   ```text
   pnpm --filter @viaeats/api exec prisma migrate diff \
     --from-url "$DIRECT_URL" \
     --to-schema-datamodel prisma/schema.prisma \
     --script
   ```

4. Kontrollera att diffen inte innehåller oväntade `DROP TABLE`, `DROP COLUMN`
   eller typkonverteringar. De sex uttryckligen pensionerade kundcredential-
   kolumnerna och payoutens gamla `adjustmentAmount` i steg 5 är de enda
   godkända `DROP COLUMN`-operationerna. Äldre
   Dpoints-tabellerna får ligga kvar tills en separat, uttryckligt godkänd
   datarensning görs.
5. Kör endast de åtta granskade, idempotenta SQL-filerna i ordning och i varsin
   transaktion:
   `20260715103000_isolate_restaurant_menus/migration.sql`, därefter
   `20260715150000_payment_tax_snapshots/migration.sql`, därefter
   `20260715180000_launch_interest_leads/migration.sql`, därefter
   `20260715203000_durable_customer_notifications/migration.sql`, därefter
   `20260715210000_customer_soft_delete/migration.sql`, därefter
   `20260715213000_remove_customer_password_credentials/migration.sql`, därefter
   `20260715220000_payout_late_refund_recovery/migration.sql` och sist
   `20260715223000_durable_refund_ledger/migration.sql`. Payout-filen kopierar
   först varje gammal `adjustmentAmount` till `manualAdjustmentAmount` innan
   legacykolumnen tas bort. Ledgerfilen skapar inga fabricerade historiska
   refundposter.
6. Kör tenant-kontrollerna i filens testscript mot produktionen i read-only
   form: inga cross-tenant-länkar, alla aktiva kategorier har ägare och alla
   nya kolumner/index/foreign keys finns. Verifiera dessutom att
   `paymentProvider` saknar databasdefault och att befintliga provider-värden
   är oförändrade. Kontrollera att `paymentEffectsCompletedAt` finns, att
   historiska `PAID`-rader är backfillade och att nya obetalda rader inte är
   markerade som färdigbehandlade. Kontrollera också att `LaunchLead` har
   unika index på e-post/kupongkod och att inga befintliga rabattkoder ändrats.
   Bekräfta också att pushens fyra nya tabeller, tokenhash-index, outbox-dedupe,
   leasefält och payoutens `ON DELETE RESTRICT` finns. Readiness ska dessutom
   bekräfta aktiva databastriggers som blockerar hard-delete av `Order` och
   `RestaurantPayout`, att `User.deletedAt` finns samt att pensionerade kund-
   credentialkolumner inte längre finns. `AdminUser.password` och
   `Courier.passwordHash` är separata personal-/kurirflöden och ska finnas kvar.
   Verifiera payout-recoverytabellen, dess RESTRICT-FK/index/triggers och att
   gamla manuella justeringar är exakt bevarade. Varje historisk `PAID` payout
   måste därefter tvåpersonskontrolleras mot sitt signerade underlag/audit och
   få `commissionPctSnapshot`, `feeVatPctSnapshot` och
   `selfDeliverySnapshot` backfillade. Ändra inga belopp. Om ett exakt historiskt
   villkor inte kan styrkas ska raden lämnas null och nästa payout för
   restaurangen förbli blockerad; gissa aldrig en sats.
   Kontrollera därefter historiska refundrader:

   ```sql
   SELECT o."id", o."orderNumber", o."paymentProvider", o."molliePaymentId",
          o."stripePaymentIntentId", o."adyenPspReference", o."paymentStatus",
          o."refundAmount", o."total"
   FROM "Order" o
   WHERE UPPER(o."paymentStatus") IN ('REFUNDED', 'PARTIALLY_REFUNDED', 'REFUNDING')
     AND NOT EXISTS (SELECT 1 FROM "PaymentRefund" r WHERE r."orderId" = o."id")
   ORDER BY o."createdAt";
   ```

   Varje träff måste verifieras mot rätt PSP innan den får backfillas: lagrad
   betalningsreferens, individuell refundreferens, exakt belopp, status och
   PSP-tidpunkt ska styrkas. Kör därefter den granskade provider-reconcilen så
   samma dedupe-/ledgerkod skriver posterna. För Stripe/Adyen-legacy som inte
   kan hämtas av reconcilen krävs ett separat tvåpersonsgranskat engångsscript
   med exporterad PSP-evidens. Skapa aldrig en post enbart från
   `Order.refundAmount`, och ändra aldrig orderbelopp för att få kontrollen
   grön. Summan av ledgerposter med status `REFUNDED` måste exakt motsvara
   `Order.refundAmount`; en full refund måste dessutom ha
   `refundAmount = total`. Ett historiskt nullbelopp får endast backfillas från
   verifierad PSP-evidens, aldrig antas från ordersumman. Kontrollen är
   symmetrisk: en `PAID`-order får varken ha en slutförd eller en aktiv/`UNKNOWN`
   refundpost, medan en `REFUNDING`-order måste ha en aktiv individuell post.
   Därmed blockerar readiness även en krasch där ledgern hann skrivas före
   orderns status-CAS. Om PSP-evidens saknas eller något belopp/status avviker
   åt något håll är launch blockerad.
   Kör därefter `pnpm --filter @viaeats/api db:readiness`; kommandot måste vara
   grönt innan API:t får startas.
7. Deploya API:t, kör `/ready`, skapa en testorder för 1 kr och verifiera
   Mollie-webhook, restaurangpush, statusflöde och refund.
8. Öppna checkout och menyredigering igen.

Efter att API, webb och admin är deployade ska även
`EXPECT_PRELAUNCH_MODE=1 pnpm launch:verify-live` vara grönt under smoke-testet.
Efter godkänd testorder/refund och offentlig omställning ska samma kommando
köras med `EXPECT_PRELAUNCH_MODE=0`.

Om ett steg avviker: avbryt. Försök inte reparera genom `db push`.

## Permanent Prisma-baseline efter launch-patchen

Det här görs i ett eget, granskat underhållsarbete — inte samtidigt som en
kundlaunch:

1. Ta ny backup och gör en noll-diff mellan produktion och den aktiva modellen,
   medvetet undantaget dokumenterade legacy-tabeller.
2. Flytta den trasiga historiska migrationsserien till ett arkiv utanför den
   aktiva `migrations`-mappen.
3. Lägg en enda baseline-migrering, genererad från tom PostgreSQL till den
   aktiva modellen.
4. Testa att baseline-migreringen bygger en tom PostgreSQL och ger noll-diff.
5. Markera baseline som applicerad i produktion med `prisma migrate resolve`
   först när schemastrukturen är verifierad. Ändra endast migrationsmetadata,
   aldrig affärstabeller, i detta steg.
6. Verifiera `prisma migrate status` och kör därefter alla framtida ändringar
   med granskade `prisma migrate deploy`-filer utan `db push`.

Tvåpersonskontroll rekommenderas för backup, SQL och efterkontroll även om en
och samma person utför deployen.
