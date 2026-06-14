# Order-skalning — plan & körbara migrationer

Status efter senaste commit:
- ✅ **Index tillagda** (`Order`): `[status, createdAt]` + `[paymentStatus, createdAt]`.
  Applas via `prisma db push` vid nästa deploy. Billigt nu medan tabellen är liten.
- ✅ **Realtid bekräftad**: admin-order-sidan uppdateras via socket
  (`order:new`/`order:updated` → `RealtimeSync` invaliderar). Kund-mockens
  auto-DELIVERED broadcastar nu också till admin-rummet. Pollen sänkt 10s → 20s
  (bara fallback).
- ⏳ **Kvar (medvetet ej auto-applicerat — kräver underhållsfönster/verifiering):**
  controlCenter-aggregering, partitionering, retention. Se nedan.

---

## 1. controlCenter laddar hela 30/90-dagars orderset i minnet

**Problem:** `GET /admin/control-center` kör `prisma.order.findMany` för 30d + 90d
**utan `take`** och aggregerar i JS (intäkt, trender, snittordervärde, aktiva kunder,
per-restaurang-statistik). Vid 1000 ordrar/dag = 30k rader laddas i Node per laddning.

**Varför inte bara lägga `take`:** resultaten **summeras** i JS — en cap skulle ge
felaktiga dashboard-siffror. Rätt fix är att flytta aggregeringen till DB:n.

**Plan (gör per metrik, verifiera siffrorna mot nuvarande utfall innan deploy):**
- Intäkt/antal/snitt per period → `prisma.order.aggregate({ _sum: { total }, _count })`
  med `where: { createdAt, status }`.
- Per-restaurang → `prisma.order.groupBy({ by: ['restaurantId'], _sum, _count })`.
- Trend (dag-för-dag) → en `groupBy` på datumtrunkering via `$queryRaw`:
  `SELECT date_trunc('day',"createdAt") d, sum(total), count(*) ... GROUP BY d`.
- Aktiva kunder → `groupBy(['userId'])` / `groupBy(['customerPhone'])` + räkna distinkta.
- `liveOrders` (få rader) kan behålla `findMany` men lägg ett rimligt `take` (t.ex. 500)
  + logga om capet träffas.

**Acceptanskriterium:** dashboard visar identiska tal som idag på samma data, men
ingen query returnerar fler än ~hundratals rader till Node.

---

## 2. Partitionering av `Order` (när tabellen blir stor — inte nu)

Inte brådskande. Gör när `Order` närmar sig ~1–2 miljoner rader. Postgres-native
range-partitionering per månad ger partition-pruning (snabba recent-queries) och
behåller all data för 7-årskravet. **Kan inte göras via `prisma db push`** — kräver
manuell migration i underhållsfönster.

```sql
-- KÖRS MANUELLT, EJ via deploy. Ta backup först. Lågtrafik-fönster.
BEGIN;

-- 1) Ny partitionerad tabell med samma kolumner.
CREATE TABLE "Order_part" (LIKE "Order" INCLUDING ALL) PARTITION BY RANGE ("createdAt");

-- 2) Skapa partitioner (en per månad — automatisera framåt med pg_partman).
CREATE TABLE "Order_y2026m06" PARTITION OF "Order_part"
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
-- ... fler månader ...
CREATE TABLE "Order_default" PARTITION OF "Order_part" DEFAULT;

-- 3) Kopiera data.
INSERT INTO "Order_part" SELECT * FROM "Order";

-- 4) Byt namn (kort lås).
ALTER TABLE "Order" RENAME TO "Order_old";
ALTER TABLE "Order_part" RENAME TO "Order";

COMMIT;
-- 5) Verifiera, peka om FK:er, droppa "Order_old" när allt är bekräftat.
```

Alternativ om partitionering känns för tungt: en kall `OrderArchive`-tabell dit
ordrar > 6 mån flyttas månadsvis. Enklare men ger inte snabba historik-queries.

---

## 3. Retention — juridik styr (spara, radera inte)

- **Bokföringslagen: 7 år.** Order-/kvittodata är räkenskapsinformation → får
  **inte** raderas på 7 år. Plan 1/2 raderar därför ingenting — bara flyttar till
  billigare lagring/partition.
- **GDPR data-minimering:** anonymisera PII (`customerName`, `customerPhone`,
  `customerEmail`, leveransadress) efter t.ex. 18 mån, behåll finansiella summor.
  Lägg till i daglig `runDailyCleanup`:

```ts
// Anonymisera PII på ordrar äldre än 18 mån (behåller belopp för bokföring).
const cutoff = new Date(Date.now() - 548 * 24 * 60 * 60 * 1000);
await prisma.order.updateMany({
  where: { createdAt: { lt: cutoff }, customerPhone: { not: 'ANONYMISERAD' } },
  data: {
    customerName: 'ANONYMISERAD', customerPhone: 'ANONYMISERAD',
    customerEmail: null, deliveryStreet: null, deliveryNote: null,
  },
});
```

(Kräver att `customerPhone` inte används som nyckel i deal-usage-logiken för
gamla ordrar — verifiera mot `customerDealUsage`-scannen i `orders.ts` innan.)
