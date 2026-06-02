# Flutter Restaurant App — Levande Referensdokument

> **Uppdateras automatiskt** av Claude efter varje ändring. Läs detta i början av varje session.
> Senast uppdaterad: 2026-06-02

---

## 1. VAD ÄR APPEN?

**Levera Business** — en order-taking app för restaurangpersonal (rebrand från MatGo/FoodGo).  
Version: `1.34.7+47`  
Backend: `https://palmy-production-2021.up.railway.app` (Railway production)  
Tech stack: Flutter 3.x / Dart 3.5, Provider, Dio, Socket.IO

---

## 2. FILSTRUKTUR

```
lib/
├── main.dart                          # Bootstrap, MainShell (PageView + nav)
├── core/
│   ├── api_client.dart               # Dio + Bearer token interceptor (10s timeout)
│   ├── audio_helper.dart             # Alarm/notifikation-ljud (audioplayers)
│   ├── bluetooth_printer_service_io.dart # BT-skrivare (IO-platform)
│   ├── bluetooth_printer_service_stub.dart # Stub för web
│   ├── constants.dart                # baseUrl, tokenKey, adminKey
│   ├── log_service.dart              # Disk-logger, max 2000 rader
│   ├── network_print_client_io.dart  # Raw TCP socket → port 9100
│   ├── network_print_client_stub.dart
│   ├── network_scanner.dart          # Ping-scanner för nätverksskrivare
│   ├── order_ui.dart                 # UI-helpers (statusfärger, labels)
│   ├── print_service.dart            # Unified print dispatch (ESC-POS + PDF)
│   ├── printing_config_service.dart  # Skrivar-profiler (API + local cache)
│   └── theme.dart                    # Material 3, dark/light, gold palette
├── models/
│   └── order_model.dart              # OrderModel + OrderItemModel
├── providers/
│   ├── auth_provider.dart            # Login/logout, token, tryAutoLogin
│   ├── order_provider.dart           # Monolith: Socket.IO, ordrar, alarm, print
│   └── theme_provider.dart           # Dark/Light/System preference
└── screens/
    ├── login_screen.dart
    ├── dashboard_screen.dart         # PENDING + AKTIVA ordrar, alert
    ├── history_screen.dart           # Idag/Igår historik
    ├── insights_screen.dart          # Omsättning, snittorder, pie chart
    ├── menu_screen.dart              # Produkt/extra on-off toggle
    ├── settings_screen.dart          # Konto, tema, print, debug
    ├── order_detail_screen.dart      # Full orderinfo + statusändring
    ├── order_take_screen.dart        # Snabb accept + tidshjul
    ├── accept_result_screen.dart     # Grön/orange feedback
    ├── new_order_alert_screen.dart   # Blå fullscreen alert
    ├── print_settings_screen.dart    # Skrivar-konfiguration
    ├── extras_screen.dart            # Extra-item visibility
    └── log_screen.dart               # Debug log viewer
widgets/
    ├── app_ui.dart                   # AppPanel, AppBackdrop etc.
    └── order_card.dart               # Pulsande orderkort
```

---

## 3. API-ENDPOINTS

| Method | URL | Används av |
|--------|-----|-----------|
| POST | `/api/account/login` | AuthProvider |
| POST | `/api/account/verify` | AuthProvider.tryAutoLogin |
| GET | `/api/admin/orders?restaurantId=&limit=50` | OrderProvider |
| PATCH | `/api/admin/orders/{id}/status` | OrderProvider |
| GET | `/api/admin/orders/{id}/receipt-data` | PrintService |
| PATCH | `/api/restaurants/{id}` | OrderProvider (öppet/stängt) |
| GET | `/api/restaurants` | OrderProvider (öppettider) |
| GET | `/api/admin/categories?restaurantId=&includeProducts=true&includeGlobal=auto` | MenuScreen/OrderProvider |
| PATCH | `/api/admin/products/{id}` | MenuScreen |
| PATCH | `/api/admin/extras/{id}` | MenuScreen/ExtrasScreen |
| GET/PUT | `/api/admin/printing-config` | PrintingConfigService |

---

## 4. DATA-FLÖDE

```
App start
  └── tryAutoLogin() → GET /api/account/verify
        └── success → MainShell + initSocket()
              └── Socket.IO ansluter
                    ├── order:new → insert + alarm + auto-print
                    ├── order:updated → uppdatera lokal status
                    └── settings:updated → öppet/stängt

OrderProvider._orders (List<OrderModel>)
  ├── pendingOrders       → DashboardScreen "NYA"
  ├── activeOrders        → DashboardScreen "AKTIVA"
  ├── todayHistoryOrders  → HistoryScreen (idag)
  └── yesterdayHistoryOrders → HistoryScreen (igår)
```

---

## 5. ORDER STATUS-FLÖDE

```
PENDING → ACCEPTED → PREPARING → READY → DELIVERING → DELIVERED/COMPLETED
                                         (pickup)     (delivery)
CANCELLED / REJECTED (från vilket steg som helst)
```

---

## 6. PRINT-SYSTEM

```
PrintService.printOrder()
  1. GET /api/admin/orders/{id}/receipt-data
  2. Bestäm printer-typ:
     ├── Bluetooth → ESC-POS bytes → BluetoothPrinterService
     ├── Network → ESC-POS bytes → NetworkPrintClient (port 9100)
     └── Fallback → PDF via printing plugin
  Pappersbredder: 58mm, 80mm, A4
  Kopior: konfigurerbara per profil
  AutoPrint: triggas vid order:new om aktiverat
```

**Element-baserad rendering.** `print_service.dart` har en switch på `element.key`
som bestämmer vad som faktiskt skrivs ut för varje rad i kvittot. Ordningen,
synligheten, font-storleken, vikten och uppercase styrs centralt från
admin-panelens kvittomall-redigerare (`/admin/receipts`) som sparar mallen i
`ReceiptTemplate`-tabellen (id = `'global'`). Lägger man till en ny `key` i
`DEFAULT_TEMPLATE_ELEMENTS` (backend `printing.ts`) måste motsvarande `case`
finnas i båda PDF- och ESC-POS-grenarna här i `print_service.dart`.

Befintliga element: `restaurantName`, `platformName`, `address`, `phone`,
`headerMsg`, `orderNumber`, `timestamp`, `orderType`, `scheduledFor`,
`estimatedTime`, `customerName`, `customerPhone`, `customerAddress`,
`deliveryInstructions`, `note`, `allergens`, `items`, `extras`, `deliveryFee`,
`discount`, `total`, `paymentMethod`, `thankYou`, `footerMsg`, plus 5 dividers.

---

## 7. ALARM-SYSTEM

```
Ny order:
  → AudioHelper.playAudio()
  → HapticFeedback.heavy()
  → NewOrderAlertScreen (blå fullscreen)

Watchdog (var 10:e sekund):
  → Om pendingOrders.isNotEmpty → AudioHelper.startLooping()
  → Annars → AudioHelper.stopLooping()

Ljud: assets/audio/notification.wav + disconnect.wav
```

---

## 8. KÄNDA BUGGAR & PROBLEM

### KRITISKA

| # | Bugg | Fil | Beskrivning |
|---|------|-----|-------------|
| ~~B1~~ | ~~Audio loop stack-up~~ | **FIXAD 2026-05-02** | `_isLooping=true` sätts nu omedelbart |
| ~~B2~~ | ~~Socket double-init race condition~~ | **FIXAD 2026-05-02** | `_socketInitializing` guard-flag |
| ~~B3~~ | ~~401 hanteras inte centralt~~ | **FIXAD 2026-05-02** | `ApiClient.onUnauthorized` callback |

### MELLANNIVÅ

| # | Bugg | Fil | Beskrivning |
|---|------|-----|-------------|
| B4 | Tidshjul resettas | `order_take_screen.dart` | Om screen poppas och öppnas igen → default 20/40 min igen, ej persisted |
| B5 | BT print partial failure | `print_service.dart` | Kopia 1 OK, kopia 2 misslyckas → returnerar false men skriver ut ändå |
| B6 | PDF font race | `print_service.dart` | Async font-hämtning vid snabba parallella utskrifter |
| B7 | Restaurant-status stale | `order_provider.dart` | Ingen fallback-poll om socket flaky (kommentar: "rely on server push") |
| B8 | Animation pop | `order_card.dart` | Puls-animation börjar direkt utan initial delay → visuell "pop" |

### SMÄRRE

| # | Problem | Beskrivning |
|---|---------|-------------|
| B9 | Test-order filter brittle | Hardcoded strings: 'test', 'testa', 'test jari' — kan ge false positives |
| B10 | includeGlobal=auto | Odokumenterat backend-beteende |
| B11 | SharedPreferences för tokens | Ej krypterat — bör använda flutter_secure_storage |
| B12 | Ingen staging-miljö | Hardcoded production URL i constants.dart |
| B13 | Offline-banner utan auto-retry | `_isOffline` sätts men ingen reconnect-logik på klienten |

---

## 9. VAD SOM ÄR BRA

- Real-time Socket.IO integration fungerar robust
- Flexibelt print-system med Bluetooth + Nätverks + PDF fallback
- Responsiv layout (mobile/tablet/desktop med NavigationRail)
- Offline-cache (2 dagars ordrar sparas i SharedPreferences)
- Tydlig order-statusmaskin
- Bra färgsystem och dark/light-tema
- Debug-loggning med LogService + LogScreen är professionell
- Detaljerade svenska felmeddelanden vid nätverksproblem
- Emoji-märkta loggar för snabb scanning (📡 📩 🔊 ✅ ❌)

---

## 10. VAD SOM ÄR DÅLIGT / BEHÖVER FÖRBÄTTRAS

### Arkitektur
- **OrderProvider är en monolit** (~600+ rader) — socket, orders, alarm, print, menu allt i en fil
- Ingen separation: bör delas i `OrderService`, `SocketManager`, `AlarmService`

### UX-problem
- Ingen toast/snackbar vid print-fel — användaren vet inte om utskrift misslyckades
- Ingen retry-knapp vid nätverksfel på dashboard
- Tidshjulet på OrderTakeScreen resettas vid varje öppning
- Offline-indikator finns men ingen proaktiv reconnect

### Teknisk skuld
- Inga widget-tester, inga integration-tester
- `debugPrint()` överallt i produktionskod
- Magic numbers överallt (20 min, 40 min, 10 sek, 30 sek)
- Hardcoded production URL — ingen dev-miljö
- Tokens i klartext (SharedPreferences)

### Performance
- OrderProvider laddar 50 ordrar utan pagination
- Watchdog watchdog kör var 10:e sek alltid, inte bara vid active orders
- Ingen lazy-loading av historik

---

## 11. MAGISKA SIFFROR (reference)

| Värde | Betydelse |
|-------|-----------|
| 20 min | Default estimatedTime för pickup |
| 40 min | Default estimatedTime för delivery |
| 30 sek | Tröskel för grön vs orange accept-feedback |
| 10 sek | Watchdog-interval |
| +20 min | Överdue-tröskel (estimatedTime + 20) |
| 2000 | Max log-rader |
| 50 | Max ordrar per API-request |
| 9100 | Nätverksskrivare TCP-port |
| 10 | Socket.IO reconnection attempts |
| 2000ms | Socket.IO reconnection delay |

---

## 12. ASSETS & KONFIGURATION

```yaml
# constants.dart
baseUrl: 'https://palmy-production-2021.up.railway.app'
tokenKey: 'matgo_token'
adminKey: 'matgo_admin'

# assets/
audio/notification.wav   # Ny order alarm (loopar)
audio/disconnect.wav      # Offline-varning
```

---

## 13. ÄNDRINGSLOGG

| Datum | Ändring |
|-------|---------|
| 2026-05-02 | Initial genomgång, dokument skapat |
| 2026-05-02 | **fix B1**: `AudioHelper.startLooping` — `_isLooping=true` sätts nu omedelbart (innan await) → inga staplade loopar |
| 2026-05-02 | **fix B2**: `OrderProvider.initSocket` — `_socketInitializing` guard-flag lagd till → inga dubbla socket-listeners |
| 2026-05-02 | **fix B3**: `ApiClient.onUnauthorized` callback + koppling i `main.dart` → 401 var som helst i appen triggar auto-logout |
| 2026-05-02 | **fix alert-nav**: `NewOrderAlertScreen.onTap` poppar nu tillbaka till orderlistan, navigerar inte direkt in i en order |
| 2026-05-02 | **redesign tid-väljare**: `_TimePicker` är nu `StatefulWidget`, sitter fast längst ner i `OrderTakeScreen` (ej i scroll), centrar vald tid automatiskt |
| 2026-05-02 | **redesign `_ItemCard`**: extras visas nu staplade rader med `+`-ikon (grönt), notering visas i amber-rad nedanför — bättre på telefon i kök |
| 2026-06-02 | **kvitto-redesign av order-take + enkel settings**: `order_take_screen.dart` ombyggd till en flat, monokrom kvitto-layout: containrar borttagna, ordernummer i normal storlek (26px), tydlig kund (namn 22 fet, tel/adress som rader), MEDDELANDE-sektion, BESTÄLLNING som kvitto-rader (qty × namn … pris, extras indenterade, item-notis), TOTALT. Inga typ-färger i innehållet; tid-strip + ACCEPTERA är monokroma (ink/vit). `settings_screen.dart` ombyggd: flat utan färgade ikon-chips, konto + statusprick, monokrom tema-segmentkontroll, **en stor primärknapp** (Skrivarinställningar) + **en liten ghost-knapp** (Skicka test-order), version-rad längst ned. |
| 2026-06-02 | **device-pairing buggfixar + städning**: (1) Admin revoke/delete skickar nu socket-event `device:session-changed` till `admin-room:<restaurantId>` → plattan låser/parar om DIREKT (OrderProvider-lyssnare → `AuthProvider.handleDeviceSessionChanged` → `bootstrapTerminal`); delete bumpar även tokenVersion. (2) Admin Enheter-sidan pollar (3.5s) så nyparad platta dyker upp utan manuell refresh. (3) Enheter-sidan UI:n uppfräschad (status-hero, kopiera-kod, enhetskort med ikoner). (4) Gamla restaurang-login (username/password) borttagen helt i admin (Inloggning-tabben + `RestaurantLoginPanel` + api-funktioner) och Flutter (`login_screen.dart` raderad). Backend `/restaurants/:id/login`-endpoints kvar som oanvänd plumbing (super-admin only). |
| 2026-06-02 | **device-pairing inloggning (terminal-modell)**: Username/password-login ersatt med en parnings-modell. Plattan binds till en restaurang via en engångskod (genererad i admin → Enheter-sidan) och förblir inloggad för alltid — överlever app-ominstallation via stabilt device-id (`android_id` = ANDROID_ID) som backend binder till restaurangen. Endast super-admin kan logga ut (revoke) / logga in igen (restore). Nytt: `lib/screens/pairing_screen.dart` (skriv in kod), `lib/screens/locked_screen.dart` ("utloggad av admin"), `AuthProvider.bootstrapTerminal/pair/refreshTerminalSession` + `TerminalStatus`-gate i `main.dart`, refresh-token i Keystore (`SecureTokenStore`), tyst 401-refresh-interceptor i `api_client.dart` (hoppar över `/api/terminal/*`). In-app-utloggningen i Inställningar borttagen. Backend: `/api/terminal/pair` + `/session`, super-admin device-endpoints, `RestaurantDevice`/`DevicePairingCode`-tabeller, `passwordPlain` borttaget. Access-token 24h; revoke bumpar `tokenVersion` → omedelbar utloggning. |
| 2026-06-02 | **Levera Business rebrand (brand guide v1.0)**: Ny logga från `Levera business logo.png` — svart padding flood-fylld bort → full-bleed guld-ikon (`assets/icon/app_icon.png`) + transparent badge (`levera_logo.png`) + adaptiv foreground; `flutter_launcher_icons` regenererat för Android+iOS (adaptiv bg `#EEAE3C`, `ios: true`). Login-loggan ('M'-ruta) → riktig logga; rail-monogram 'M'→'L'. Tema riktat efter guiden: guldskala `ember`→`#E7B24B`, `emberDeep`→`#C28E2E`, `emberSoft`→`#F4D086`; light-neutraler `mist #FCFCF9` / `frost #F5F5F2` / `ink #1C1C1E` / `mutedInk #6E6E73`; dark-neutraler `#09090B`/`#18181B`/`#202024`; status `#16A34A`/`#DC2626`/`#FF7A00`/`#2563EB`. Intern `applicationId com.matgo.restaurant`, `matgo_token`-nycklar och notis-channelId MEDVETET orörda (bryter annars Firebase/push/sessioner). TODO: Outfit/Inter-typsnitt (kräver bundlade ttf). |
| 2026-06-02 | **rent vitt light-tema (guld kvar)**: `theme.dart` — light-temat gick från varmt amber/cream till rent neutralt vitt. Bakgrundsgradient `#FFFCF7→#F5E8D4` (cream) → `#FFFFFF→#F4F5F7` (vit→ljusgrå); `mist` `#FFFCF7`→`#F7F8FA`, `frost` warm tan → `#EDEFF2`, `ink` `#1A130C` (varm) → `#18191D` (neutral), `mutedInk` `#6B5C4D` (brun) → `#6B7280` (neutral grå); panel-skugga + scheme-outline avvärmda. **Guld-accenten (`ember`/`emberDeep`/`gold`) orörd** — fortf. enda värmen. Dark-temat orört. |
| 2026-06-02 | **fix OrderListTile-overflow + ordrar försvann ur historik**: `order_card.dart` — i `OrderListTile` trängdes nummer + status + summa + advance-knapp ("Maten på väg") ihop på en rad och krockade på 720p. Nu ligger advance-knappen på en **egen rad i full bredd** under info-raden; nummer/status är `Flexible` med ellipsis. `order_provider.dart` `fetchOrders` — ersatte tidigare `_orders` rakt av med serversvaret, så en order försvann ur historiken när den markerats på väg/klar (om backend prunar den ur aktiv-listan vid nästa fetch/reconnect). Nu **behålls lokala ordrar inom 2-dygnsfönstret** som servern inte returnerar (server vinner annars). OBS: om backend `/api/admin/orders` aldrig returnerar slutförda ordrar kan ett separat history-endpoint behövas. |
| 2026-06-02 | **dashboard + detalj/take redesign (720p)**: Dashboard — datumet borttaget, headern är nu en ren rad (klocka · namn · öppet/stäng). "NYA ORDRAR" har antalet i en pill _bredvid_ texten (ej stor staplad siffra), "hantera direkt" borttaget. Väntande ordrar visas som **kvadratiska kort (172×172) i horisontell scroll** (`NewOrderSquareCard`) istället för hero + vertikal kö — `_PendingQueue` borttagen. Order-detalj (`order_detail_screen.dart`) — panel-rutorna (status/kund/artiklar/summa) är utflatade till delade sektioner med `_SectionDivider` istället för massa containrar; större text på kund (namn 21, tel 15), artiklar (namn 17, antal-box 36/15, pris 16) och total (30). Order-take (`order_take_screen.dart`) — info-knappen (som öppnade samma orderinfo) borttagen; ACCEPTERA-knapp 62→52, TID-siffra 30→26, tidsremsa 54→46 / item 60→52, KLAR-tid 18→16. Logik orörd. |
| 2026-06-02 | **kompakt NewOrderHeroCard**: `order_card.dart` — det stora väntande-order-kortet (var `minHeight: 260` med 78px ordernummer, live-dot/"NY" och en "Tryck på kortet"-knapp) är nu ett litet kort på 3 rader: typ-pill + summa, ordernummer (27px), och kund · antal · tid. Hela kortet är tryckbart så tryck-knappen togs bort. Färgkodning per typ förstärkt (leverans = blå `brandBlue`, avhämtning = amber `ember`): stripe + pill + kant + subtil bakgrundston. `_LiveDot` och `_MiniStat` borttagna (oanvända). |
| 2026-06-02 | **fix header + navbar (720p)**: `dashboard_screen.dart` — headern är nu en kompakt rad: liten klocka (38px) längst till vänster, endast restaurangnamnet (strippar ` Admin`-suffix från kontonamnet, `FittedBox` krymper för att passa), och öppet/stäng-knappen i nivå till höger istället för staplad under. `main.dart` `_FloatingPillNav` — endast vald flik expanderar (`Expanded`), övriga krymper till ikon; vald etikett ligger i `Flexible` → långa ord ("Inställningar") svämmar inte längre över i lika breda kolumner. Logik orörd. APK byggd lokalt (`build/app/outputs/flutter-apk/app-release.apk`). |
| 2026-05-25 | **Ember Studio facelift**: komplett UI-omgörning. Lime → warm amber (#FF9D45), varm ink/paper backgrounds, editorial typografi (display weight 800/900). Bottom NavigationBar → flytande pill-nav med blur (Apple Maps-stil). Dashboard: giant counter + swipable full-width hero-kort + tight historik-rader. Order-take: 76pt #nummer + segmented tid-strip + fixed bottom action-bar. New order alert: 160pt #nummer + pulserande ringar + huge CTA. History: bento-tiles med sparkline + sticky day-headers (inga tabs). Menu: sökbar med X-clear + segment toggle + gradient-stripe tiles med PÅ/AV-pill. Settings: hero-profilkort med ember-gradient + iOS-stil grupperade rader. Order detail: status-progress strip (5 prickar). Login: 96pt logo med ember-glow + editorial headline. **Logik orörd**: provider, socket, print, alarm, accept/reject-flöde, audio watchdog — bara visuell skal. Legacy color-aliases (gold/brandGold/midnight/deepSea) behållna för bakåtkomp. |

