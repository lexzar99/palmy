# ViaEats/ViaEats plattformsaudit

Körd: 2026-07-05 ca 06:16 CEST

## Kort status

- API svarar: ja
- Webbsida svarar: ja
- Admin svarar: ja
- API build: passerar
- Admin build: passerar
- Kundwebb build: failar på TypeScript i `MenuContent.tsx:496`

## Viktigaste blockers

1. Kundwebben bygger inte. Måste fixas före push/launch.
2. Repo är väldigt smutsigt med många ändrade/raderade filer, inklusive appar som normalt inte ska röras utan uppdrag.
3. Flera live-restauranger saknar legal info, bilder eller kompletta menyer.
4. Aktiva test-/sommarkuponger saknar tak och slutdatum enligt audit.
5. Palmyra är draft just nu och har konstiga öppettider 00:00-00:00 på flera dagar.

## Restaurangstatus
- FIX: Palma (live), 106 produkter, issues: många produkter utan bild 106/106
- FIX: Burger King Lund Centralen (draft), 375 produkter, issues: saknar phone, saknar deliveryZones
- FIX: Burger King Lund Norra Fäladen (live), 181 produkter, issues: saknar phone, saknar legalName/orgnr
- FIX: malma (live), 0 produkter, issues: saknar phone, saknar legalName/orgnr, 0 kategorier, 0 produkter
- FIX: Palmyra Pizzeria (draft), 173 produkter, issues: öppettid 00:00-00:00 på monday,tuesday,wednesday,saturday
- FIX: VIAEATS (live), 1 produkter, issues: många produkter utan bild 1/1
- FIX: MAX Lund Nova (draft), 218 produkter, issues: saknar legalName/orgnr, saknar logo/imageUrl, saknar heroImageUrl, saknar deliveryZones, produkter med ogiltigt pris: Västerbottensost® sticks, Chicken Nuggets, Crispy Green Nuggets, Crispy fries, Lökringar
- FIX: MAX Lund Kung Oskars bro (draft), 218 produkter, issues: saknar legalName/orgnr, saknar logo/imageUrl, saknar heroImageUrl, saknar deliveryZones, många produkter utan bild 218/218, produkter med ogiltigt pris: Mozzarella sticks, Crispy fries, Västerbottensost® sticks, Lökringar, Chili cheese
- FIX: Shahs halal food Lund (live), 31 produkter, issues: saknar phone, saknar logo/imageUrl, saknar heroImageUrl, saknar deliveryZones
- FIX: McDonald's Lund Norra Fäladen (draft), 152 produkter, issues: saknar deliveryZones, många produkter utan bild 152/152
- FIX: KFC Lund (draft), 126 produkter, issues: saknar logo/imageUrl, saknar heroImageUrl, saknar deliveryZones
- FIX: Pizzeria Kryddan (live), 121 produkter, issues: saknar legalName/orgnr, saknar logo/imageUrl

## Tillvalsproblem
- Palma: storlek (cmp1zy25e000311f6sjrqwsdh): required men minSelections=0
- Burger King Lund Centralen: Priced Extra (small burgers) (cmr4bjsoe00bcobiuihbho68z): extra/tillägg har allowQuantity plus/minus
- Burger King Lund Centralen: Priced Extra (larger burgers) (cmr4bjn5z007lobiunp89gkez): extra/tillägg har allowQuantity plus/minus
- Burger King Lund Norra Fäladen: Priced Extra (small burgers) (cmr4cmydb02d0obiuakxhi0al): extra/tillägg har allowQuantity plus/minus
- Burger King Lund Norra Fäladen: Priced Extra (larger burgers) (cmr4cmzya02dhobiusto5m7hz): extra/tillägg har allowQuantity plus/minus
- Pizzeria Kryddan: Extra ingredienser (cmr5m0h8600vwzeh3koe2e7ip): extra/tillägg har allowQuantity plus/minus
- Pizzeria Kryddan: Extra ingredienser familjepizza (cmr5m0ibw00xzzeh32mv4zv3r): extra/tillägg har allowQuantity plus/minus

## Deals/koder
- Aktiva deals: 7: Vänrabatt: 50 kr, Välkomstrabatt: 20%, Fri leverans idag, Din 5:e beställning, Din 10:e beställning, Din 25:e beställning, Beställ 3 gånger, få 150 Dpoints
- Deal-varning: Vänrabatt: 50 kr: aktiv utan validUntil
- Deal-varning: Välkomstrabatt: 20%: aktiv utan validUntil
- Deal-varning: Fri leverans idag: aktiv utan validUntil
- Deal-varning: Din 5:e beställning: aktiv utan validUntil
- Deal-varning: Din 10:e beställning: aktiv utan validUntil
- Deal-varning: Din 25:e beställning: aktiv utan validUntil
- Deal-varning: Beställ 3 gånger, få 150 Dpoints: aktiv utan validUntil
- Kupong-varning: TEST1: aktiv utan maxUsages
- Kupong-varning: TEST1: aktiv utan validUntil
- Kupong-varning: SOMMAR26: aktiv utan maxUsages
- Kupong-varning: SOMMAR26: aktiv utan validUntil

## Ordrar
- Senaste 50 statusfördelning: {'DELIVERED': 43, 'READY': 2, 'CANCELLED': 1, 'REJECTED': 3, 'DELIVERY_FAILED': 1}
- Pending just nu: 0