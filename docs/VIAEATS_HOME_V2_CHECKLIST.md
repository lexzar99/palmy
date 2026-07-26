# ViaEats hem v2 – leveranschecklista

## Säkerhet

- [x] Komprimerad backup skapad före produktionskodsändringar.
- [x] Backupens gzip-integritet verifierad.
- [x] SHA-256 sparad i överlämningen.
- [x] Ingen produktionsmigration körs.
- [x] Ingen push görs.

## API och databas

- [x] Central `RestaurantTag` och `RestaurantTagAssignment`.
- [x] Legacy `Restaurant.tags` synkas bakåtkompatibelt.
- [x] Presentation och ranking för hemsektioner.
- [x] Serverfeed med riktiga mätvärden.
- [x] Unik förstaplats och appearance penalty.
- [x] Tidsstyrd, begränsad admin-boost.
- [x] Kontraktstest för ranking, variation och legacy.
- [x] Prisma validate och TypeScript-build.

## Admin

- [x] Taggkatalog kan skapas, ändras och inaktiveras.
- [x] Restaurangtaggar väljs som multiselect/chips, inte CSV.
- [x] Kategorier väljer stabila tagg-ID:n.
- [x] FILTER, MANUAL och HYBRID kan tweakas.
- [x] Schema, layout, accent och rankingvikter kan tweakas.
- [x] Admin-build är grön.

## Webb

- [x] Design 10-struktur: mediumräls före Aktuellt.
- [x] Stort bilddrivet sponsorområde.
- [x] Inga matkategorichips på Hem.
- [x] Dynamiska kategorier efter sponsorområdet.
- [x] Fem bottom-nav-flikar.
- [x] Sök med stora dynamiska taggchips.
- [x] Deals behålls.
- [x] Kort visar endast riktig ETA, avgift, rabatt och recension.
- [x] Samma restaurang är normalt inte etta i flera rälsar.
- [x] Mobil visuell QA och web-build.

## Swift

- [x] Design 10-struktur: mediumräls före Aktuellt.
- [x] Inga matkategorichips på Hem.
- [x] Separat Sök-flik med stora dynamiska chips.
- [x] Deals, Varukorg och Profil behålls.
- [x] Fem bottom-nav-flikar.
- [x] Kort visar endast riktiga metadata.
- [x] Lokal first-place-allokering som legacyfallback.
- [x] Xcode-build för fysisk enhet.
- [x] Installerad på Jalle iPhone.
- [ ] Autostartad på Jalle iPhone — telefonen var låst vid startförsöket.

## Godkännande

- [x] Lokal webb visas mot `https://api.viaeats.se`.
- [x] Inga påhittade restauranger.
- [x] Användaren kan granska webb och Swift före push.
