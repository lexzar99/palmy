# Dpoints — lojalitetssystemet

Ett medvetet enkelt poängsystem. Allt styrs från admin-sidan **Dpoints**
(Plattform → Dpoints). Inget händer förrän du slår på master-knappen.

## Modellen i korthet

- **Intjäning:** `dpointsPerKr` poäng per spenderad kr (standard **1 p/kr**) på
  betalda ordrar. Räknas på varornas värde (total − leverans − dricks).
- **Värde vid inlösen:** `dpointsValuePerKr` (standard **10 p = 1 kr**). Styr
  "≈ X p"-etiketten nära produkter och hur mycket en belöning är värd.
- En enda källa till saldot (`User.pointsBalance`) + en liggare
  (`PointsTransaction`) som ger full historik. Intjäning per order är idempotent
  (en order ger poäng exakt en gång).
- Gäst-ordrar (utan konto) tjänar inget. Man måste vara inloggad.

## Var saker händer (kod)

| Del | Fil |
|---|---|
| Kärna (saldo, intjäning, streak, inlösen) | `packages/api/src/lib/dpoints.ts` |
| Intjänings-hook (betald order) | `packages/api/src/lib/stripeReconcile.ts` |
| Signup-bonus (sponsor-kort) | `packages/api/src/routes/auth.ts` (register-user) |
| Kund-API | `packages/api/src/routes/dpoints.ts` |
| Admin-API | `packages/api/src/routes/dpointsAdmin.ts` |
| Admin-sida | `apps/admin/src/modules/dpoints/` |
| Web (panel/banner/badge/nav) | `apps/web/components/Dpoints*.tsx` |
| Mobil (sektion/banner/badge/flik) | `mobile_apps/REACT-MATGO/src/components/Dpoints*.tsx` |

---

## Scenarier (steg för steg i admin)

### 1. Slå på systemet
Dpoints → **Inställningar** → bocka i *Dpoints aktiverat*. Sätt
*poäng per kr* = `1` och *poäng per 1 kr* = `10`. Klart — kunder börjar tjäna
1 poäng per kr på sina köp direkt.

### 2. Välkomstbonus via sponsor-kort
Dpoints → **Sponsorkort** → *Nytt kort*.
- Titel: "Välkommen!", Sponsor: valfritt, Bonuspoäng: **100**.
- (Valfritt) Aktiv från/till för en tidsbegränsad kampanj.

Resultat: utloggade ser bannern ("Skapa konto & få 100 Dpoints"). När de
registrerar sig får de 100 p automatiskt, och bannern byts mot deras saldo.
Bara *ett* aktivt kort visas (det senast skapade). Sätt *Aktiv* = av för att
stänga utan att radera.

### 3. En inlösen-belöning (gratis sås)
Dpoints → **Inlösen** → *Ny belöning*.
- Titel: "Gratis vitlökssås", Kostar: **100 p**, Rabattyp: *Kr rabatt*,
  Rabatt: **10 kr**, Min. order: **89 kr** (så de måste handla för något större),
  Giltighet: 30 dagar.

Resultat: en inloggad kund med ≥100 p kan lösa in → får en **personlig kod**
låst till sitt konto. Koden funkar bara på deras konto i kassan och syns under
**Kunder & koder**. 100 p dras direkt.

### 4. En 3-dagars streak → 100 poäng
Dpoints → **Kampanjer** → *Ny kampanj*.
- Namn: "3 dagar i rad", Typ: **Svit – dagar i rad**, Antal dagar: **3**,
  Bonus: **100 p**, Min. ordervärde: t.ex. 50 kr, *Kan klaras om och om*: av.

Hur det funkar: kunden beställer (betalt) mån, tis, ons → vid den 3:e dagens
betalda order får de **+100 p** automatiskt. En order/dag räknas. Missar de en
dag börjar sviten om. Allt i Europe/Stockholm-tid.

> **Hur mycket poäng "gör jag"?** Med 3-dagars × 100 p ger du bort 100 p = 10 kr
> värde per kund som klarar den. En 5-dagars × 500 p = 50 kr värde. Sätt en
> min-order så små låtsas-ordrar inte gameas.

### 5. "Beställ 1 gång/vecka i 3 veckor → 150 p"
Som ovan men Typ: **Svit – veckor i rad**, Antal veckor: **3**, Bonus: **150 p**.
En betald order/vecka i 3 veckor i följd → +150 p.

### 6. Alla hjärtans dag — dubbla poäng över 200 kr
Dpoints → **Kampanjer** → *Ny kampanj*.
- Namn: "Alla hjärtans dag 2×", Typ: **Multiplikator**, Multiplikator: **2**,
  Min. ordervärde: **200**, Från/Till: 14 feb.

Resultat: ordrar ≥200 kr den dagen tjänar 2× poäng (200 kr → 400 p i stället
för 200). Multiplikatorer stackar inte — högsta vinner.

### 7. Ge eller dra poäng manuellt
Dpoints → **Kunder & koder** → sök kund → *Ge / dra*.
- Positivt antal = ge (t.ex. +200 "kompensation försenad order").
- Negativt = dra tillbaka. Allt loggas i audit-loggen.

---

## Vad kunden ser
- **Saldo + historik + inlösen** i profilen (web och app).
- **"≈ X p"** nära produktpriset (informativt).
- **Saldot under Profil** i den nedre navbaren.
- **Sponsor-bannern** när man är utloggad.

## Medvetna avgränsningar (v1)
- Inlösen sker via personlig kod (befintliga kassa-rabattmotorn), inte en ny
  betalväg → ingen 0-kr-order, kassaflödet är orört.
- Återbetald order nollar inte redan utdelade streak-bonusar (känd begränsning).
- Inga poäng på gäst-/obetalda ordrar.
- Allt är gömt/inaktivt tills `dpointsEnabled` slås på.
