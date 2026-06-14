# Delivera Courier

Native **Flutter**-app för bud (kurir) — iOS + Android. Tar över funktionerna från
webb-kuriren (`apps/courier`) och delar designspråk med **Delivera Business**
(plattt, monokromt, guld-accent enligt Levera Brand Identity).

Bundle ID: `se.delivera.courier` · Backend: `https://api.delivera.se`
(samma kurir-API som webben).

## Funktioner

- **Onboarding** — modern 3-stegs intro första gången.
- **Inloggning** — e-post + lösenord. Konton skapas av Delivera-admin; budet
  registrerar sig inte själv.
- **Online/offline** — budet styr själv när det tar emot uppdrag. Position delas
  bara medan man är online.
- **Uppdrag** — tillgängliga leveranser i budets stad, polling var 15:e sek,
  nedräkning + notis-badge för nya.
- **Acceptera** — max 3 samtidiga (matchar backend).
- **Leveransflöde** i två faser:
  1. *Hämtning* — bocka av alla artiklar → svep "Hämtad".
  2. *Leverans* — kör till kund, valfritt leveransfoto, svep "Levererad"
     (lämnad i hand / vid dörren).
- **Konto** — profil, dagens + totala intjäning, leveranshistorik (grupperad
  per dag), tema (ljust/mörkt/system), utloggning, kontoborttagning.
- **GPS-heartbeat** — skickar position var 10:e sek till backend
  (`/api/courier/location`) medan online.

## Arkitektur

```
lib/
├── main.dart                 # Providers + root-nav (onboarding → login → shell)
├── core/
│   ├── constants.dart        # baseUrl, token-nyckel, intervall
│   ├── api_client.dart       # Dio + Bearer + 401-hantering (token i Keychain/Keystore)
│   ├── models_api.dart       # CourierApi — alla /api/courier/*-endpoints
│   ├── format.dart           # kr/km/tid (speglar webbens format.ts)
│   └── location_service.dart # geolocator-stream + heartbeat
├── models/models.dart        # Job, ActiveDelivery, HistoryOrder, CourierProfile
├── providers/
│   ├── auth_provider.dart    # login/me/logout, token, status-gate
│   ├── session_provider.dart # online/offline, jobs, active, accept/pickup/complete, historik
│   └── theme_provider.dart   # ljust/mörkt/system
├── screens/                  # onboarding, login, main_shell, session_start,
│   │                           jobs, job_detail, active_list, delivery, account
└── widgets/
    ├── app_ui.dart           # delad design (AppPanel, EmberButton, ...) — från Business
    └── courier_ui.dart       # SwipeToConfirm, AddressRow, CountdownPill, MapsLauncher
```

API-kontraktet matchar `apps/courier/src/lib/types.ts` och backend
`packages/api/src/routes/courier.ts` 1:1.

## Köra lokalt

```bash
flutter pub get
flutter run                                   # mot prod-API
flutter run --dart-define=API_URL=http://localhost:4000   # mot lokal backend
```

## Bygga

- **iOS**: via Xcode (Archive) — se [APPLE_SUBMISSION.md](APPLE_SUBMISSION.md).
- **Android**: `flutter build apk --release` (kräver Java 17 — se notis nedan).

> **Android/Java**: `flutter create` satte en Gradle-version som vill ha Java 17.
> Om bygget klagar: `flutter config --jdk-dir=<JDK17>` eller höj Gradle-wrappern.

## Status / kvar att göra

- [ ] Native APNs-push (v1.1) — webben har web-push; native notiser med stängd app.
- [ ] Kurir-specifik app-ikon (använder nu Delivera-guldmärket från Business).
- [ ] Ev. bakgrundsplats (kräver Always-behörighet + extra App Review).
