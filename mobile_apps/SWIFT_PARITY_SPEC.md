# Delivera Swift iOS, paritetsspec för Kotlin (Android) och web (Next.js)

Detta dokument är en fullständig beskrivning av Swift-kundappen ("Delivera Swift iOS") och
ersätter att läsa Swift-källkoden. Målet: bygg 1:1-kopior av appen i Kotlin respektive web.
Alla belopp, fältnamn, API-paths, lagringsnycklar och svenska UI-strängar är hämtade
ordagrant ur källkoden (ca 20 000 rader, 44 filer, per 2026-07-02).

## 1. Översikt och globala kontrakt

### 1.1 Appens delar

| Del | Swift-fil(er) | Kapitel |
|---|---|---|
| App-skal, Keychain-auth, push-delegat | `App/DeliveraSwiftApp.swift` | 2 |
| Konfiguration | `App/AppConfig.swift` | 2 |
| Tema/design-tokens | `Core/DesignSystem/DeliveraTheme.swift`, `RemoteImage.swift` | 3 |
| API-klient | `Core/API/DeliveraAPI.swift`, `CourierAPI.swift`, `APIError.swift` | 4 |
| Datamodeller | `Models/*` | 5 |
| Rotvy + hemskärm | `Features/Home/HomeView.swift` (3849 rader) m.fl. | 6-9 |
| Pulse-kort | `Features/Home/PulseCards.swift` | 10 |
| Rewards/Dpoints | `Features/Rewards/RewardsView.swift`, `DpointsCoin3D.swift` | 11 |
| Restaurangsida + produktmodal | `Features/Restaurant/*` | 12-13 |
| Varukorg/kassa | `Features/Cart/CartStore.swift`, `CartView.swift` | 14-15 |
| Auth + profil | `Features/Profile/ProfileView.swift` | 16-17 |
| Bud-läge (separat app-target) | `Features/Courier/*` | 18 |
| Adressväljare | `Features/Address/*` | 19 |
| Live Activity-widget | `DeliveraSwiftOrderWidget/OrderLiveActivityWidget.swift` | 20 |

### 1.2 Grundprinciper (järnregler som syns i appkoden)

- **Pengar:** lagras i öre i databasen, men API:ts list/detalj-endpoints dividerar med 100
  före svar. Appen räknar alltså i KRONOR överallt och dividerar ALDRIG igen.
  Undantag: Adyen-betalningsflödet arbetar i öre (minor units) direkt.
- **Dpoints:** intjäning styrs av servern (`/api/settings` levererar earn-rate, ca 0.1 p/kr),
  10 p = 1 kr vid inlösen. Hårdkoda aldrig copy eller earn-rate, servern äger dem.
- **Öppettider har två former:** platt `{monday: {...}}` eller nästlad
  `{regular: {monday: {...}}}`. Läs alltid `oh.regular?.[k] ?? oh[k]` (se kap 5, RestaurantAvailability).
- **Design:** platt, vitt, orange (`#F04F1A`-familj) + ink. Deal-korten är blå (`dealBlue`).
  Inga eviga pulser/glow/shimmer. Spring-animationer 0.3-0.6 s. Inga em-dashes i UI-copy.
- **Ingenting hårdkodas som admin kan styra:** sponsorkort, pulse-kort, deals, kategorier,
  copy för uppdrag/belöningar kommer alla från API:t.

### 1.3 Alla lagringsnycklar (AppStorage/UserDefaults/Keychain)

Kotlin-motsvarighet: SharedPreferences/DataStore (+ EncryptedSharedPreferences/Keystore för
token). Web-motsvarighet: localStorage (+ httpOnly-cookie eller motsvarande för token).

| Nyckel | Lagring | Typ | Ägs/skrivs av | Läses av |
|---|---|---|---|---|
| `delivera.authToken` | **Keychain** (via `@AuthToken`/`SessionStore`, migreras tyst från UserDefaults) | String (Supabase JWT) | Auth-flödet (kap 16) | Alla inloggade API-anrop |
| `delivera.hasSeenOnboarding` | AppStorage | Bool | OnboardingView (kap 9) | HomeView (visar onboarding en gång) |
| `delivera.activeUserDealId` | AppStorage | String | DealsRail, Mina deals, vänkod i kassan | CartView (quote + order), HomeView (nollar efter betald order) |
| `delivera.activeUserDealSnapshot` | AppStorage | String (JSON av HomeAppDeal) | Samma som ovan | CartView (renderar dealraden offline-säkert) |
| `delivera.deliveryAddress` | AppStorage | String | AddressSheetView | HomeView (adressrad), CartView |
| `delivera.deliveryLatitude` / `delivera.deliveryLongitude` | AppStorage | Double | AddressSheetView | Zonvalidering, order |
| `delivera.deliveryCityName` | AppStorage | String | AddressSheetView | HomeView |
| `delivera.pickupCityName` | AppStorage | String | AddressSheetView | HomeView (avhämtningsläge) |
| `delivera.zoneRestaurants` | AppStorage | String (JSON) | Zonvalidering | HomeView (filtrerar restauranger i zon) |
| `delivera.recentDeliveryAddresses` | AppStorage | String (JSON-lista) | AddressSheetView | AddressSheetView |
| `delivera.favoriteRestaurantIDs` | AppStorage | String | RestaurantCard/HomeView | HomeView (favorit-sektion/hjärtan) |
| `delivera.cart.guestName` / `delivera.cart.guestPhone` | AppStorage | String | CartView | CartView (gästuppgifter består) |
| `delivera.cart.note` | AppStorage | String | CartView | CartView |
| `delivera.activeOrderId` | AppStorage | String | CartView efter betald order | HomeView (aktiv order-banner), Live Activity |
| `delivera.activeOrderToken` | AppStorage | String | CartView | Statuspolling (bevis för gäst-läsning) |
| `delivera.activeOrderPhone` | AppStorage | String | CartView | Statuspolling |
| `delivera.activeOrderTerminalAt` | AppStorage | String/Double | Statuspolling | Banner-döljning efter terminal status |
| `delivera.skippedReviewOrderIds` | AppStorage | String (JSON-lista) | Review-prompt i HomeView | Review-prompt (visa inte igen) |
| `delivera.courierToken` | UserDefaults (bud-target) | String | CourierLoginView | CourierStore/CourierAPI |

### 1.4 Aktiv deal-kontraktet (kärnflödet)

1. Kunden claimar en deal (DealsRail på hemskärmen, Rewards, eller "Mina deals" i profilen):
   `POST /api/deals/app/:id/claim` returnerar en UserDeal, appen skriver
   `delivera.activeUserDealId` = UserDeal-id och `delivera.activeUserDealSnapshot` =
   JSON-serialiserad `HomeAppDeal` (samma struktur som i feeden).
2. Alternativ väg: väns referral-kod i kassans kodfält, `POST /api/account/redeem-code`
   returnerar `userDealId` som skrivs till samma nycklar och appliceras direkt.
3. CartView läser nycklarna, kör `POST /api/deals/app/quote` (server-sanning för rabatten)
   och skickar `userDealId` på `POST /api/orders`.
4. Efter betald order nollar HomeView båda nycklarna.

Detaljer i kapitel 8 (DealsRail), 15 (kassan), 17 (Mina deals).

### 1.5 Miljö (AppConfig)

| Konstant | Default | Env-överstyrning |
|---|---|---|
| `apiBaseURL` | `https://api.delivera.se` | `DELIVERA_API_URL` |
| `adyenClientKey` | `test_UXISGJQFT5HMVFEXRJZ4E3DWVA6MIVEC` | `ADYEN_CLIENT_KEY` |
| `adyenEnvironment` | `test` | `ADYEN_ENVIRONMENT` |
| `supabaseURL` | `https://qiviwmhunmqemqylmwkr.supabase.co` | `SUPABASE_URL` |
| `supabaseAnonKey` | (anon JWT, se AppConfig.swift) | `SUPABASE_ANON_KEY` |

### 1.6 App-targets

Samma kodbas bygger två appar: kundappen (default) och en bud-app via
kompileringsflaggan `DELIVERA_COURIER_APP` som byter rotvy från `HomeView()` till
`CourierAppRootView()` (login-gate på `delivera.courierToken`). Se kapitel 18.
Push-delegaten (UNUserNotificationCenter) postar alla mottagna pushar som
`NotificationCenter`-event `.courierPushReceived` och visar banner+ljud+badge i förgrunden;
APNs-device-token skrivs till `CourierPushRegistry.shared.deviceToken` (hex-sträng).
## 2. App-skal, konfiguration och auth-lagring

### 2.1 App-entry (DeliveraSwiftApp)

Fil: `App/DeliveraSwiftApp.swift`.

- `@main struct DeliveraSwiftApp: App` med `@UIApplicationDelegateAdaptor(DeliveraAppDelegate.self)`.
- `body` är en `WindowGroup` med kompileringsflagga:

```swift
#if DELIVERA_COURIER_APP
CourierAppRootView()
#else
HomeView()
#endif
```

Samma kodbas bygger alltså BÅDE kundappen (rot: `HomeView`) och kurirappen (rot: `CourierAppRootView`). Flaggan `DELIVERA_COURIER_APP` är en Swift compilation condition, kundappen byggs UTAN den. I en Kotlin/Next.js-port motsvarar detta två separata app-varianter (build flavor respektive separat app), kundappens rot är alltid hemskärmen.

### 2.2 AppDelegate (push-hantering)

`DeliveraAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate`:

| Callback | Beteende |
|---|---|
| `didFinishLaunchingWithOptions` | Sätter `UNUserNotificationCenter.current().delegate = self`, returnerar `true`. |
| `didRegisterForRemoteNotificationsWithDeviceToken` | Konverterar token-datan till lowercase hex-sträng (`String(format: "%02x", byte)` per byte, hopslaget utan separator) och sätter `CourierPushRegistry.shared.deviceToken = token` på MainActor. |
| `didFailToRegisterForRemoteNotificationsWithError` | Loggar bara: `print("Delivera push registration failed: \(error.localizedDescription)")`. |
| `didReceiveRemoteNotification` (bakgrund) | Postar `NotificationCenter`-notis `.courierPushReceived` med `userInfo` som object, anropar completion med `.newData`. |
| `userNotificationCenter(_:willPresent:)` (förgrund) | Postar samma `.courierPushReceived`-notis med `notification.request.content.userInfo`, presenterar med `[.banner, .sound, .badge]`. |
| `userNotificationCenter(_:didReceive:)` (tap på notis) | Postar samma `.courierPushReceived`-notis med responsens `userInfo`. |

All push-vidarebefordran går alltså via en enda intern event-kanal (`.courierPushReceived`), oavsett om appen är i för- eller bakgrund eller om användaren tappar notisen.

### 2.3 KeychainService (säker token-lagring)

Enum `KeychainService`, trådsäker via Security-API:t (ingen egen låsning behövs).

- Service-namn: `Bundle.main.bundleIdentifier ?? "se.delivera.swift"`.
- Poster lagras som `kSecClassGenericPassword` med `kSecAttrService` = service-namnet och `kSecAttrAccount` = nyckeln.
- `set(_ value: String, key: String)`:
  - Om `value` är tom sträng: posten RADERAS (`SecItemDelete`) och funktionen returnerar. Tom sträng = utloggad.
  - Annars: värdet lagras som UTF-8-data med `kSecAttrAccessible = kSecAttrAccessibleAfterFirstUnlock` (läsbart efter första upplåsningen, överlever omstart). Uppdaterar befintlig post (`SecItemUpdate`) om den finns, annars skapas den (`SecItemAdd`).
- `get(_ key: String) -> String?`: hämtar med `kSecReturnData = true`, `kSecMatchLimit = kSecMatchLimitOne`, avkodar UTF-8, returnerar `nil` vid miss.

Kotlin-motsvarighet: EncryptedSharedPreferences/Android Keystore. Next.js: httpOnly-cookie eller motsvarande säker lagring, ALDRIG vanlig localStorage-plaintext om plattformen erbjuder bättre.

### 2.4 SessionStore (delad session)

`@MainActor final class SessionStore: ObservableObject`, singleton `SessionStore.shared`.

- Nyckel: `"delivera.authToken"` (privat konstant `tokenKey`).
- `@Published var authToken: String`, `didSet` skriver alltid igenom till Keychain (`KeychainService.set(authToken, key: tokenKey)`). Att sätta tom sträng raderar alltså Keychain-posten (= logout).
- Init-ordning (engångs-migrering UserDefaults till Keychain):
  1. Finns token i Keychain: använd den.
  2. Annars, finns icke-tom legacy-token i `UserDefaults` under samma nyckel `"delivera.authToken"`: använd den, skriv den till Keychain, RADERA UserDefaults-posten (tyst migrering).
  3. Annars: `authToken = ""` (utloggad).

### 2.5 @AuthToken property wrapper

`@MainActor @propertyWrapper struct AuthToken: DynamicProperty`.

- Drop-in-ersättning för `@AppStorage("delivera.authToken")`: samma användning (läs/skriv en `String`), men backad av Keychain och delad mellan alla vyer via `SessionStore.shared` (`@ObservedObject`).
- `wrappedValue`: get läser `store.authToken`, set (nonmutating) skriver `store.authToken`.
- `projectedValue`: `Binding<String>` mot samma värde (så `$token` fungerar i SwiftUI-formulär).
- Tom sträng betyder "ej inloggad" i hela appen.

### 2.6 CourierAppRootView (endast kurirbygget)

- `@StateObject private var store = CourierStore()`.
- Om `store.token.isEmpty`: visa `CourierLoginView`, annars `CourierShellView`, båda med `store` som `environmentObject`.
- `.task { await store.bootstrap() }` körs när roten visas.

### 2.7 AppConfig

Fil: `App/AppConfig.swift`. Enum med fyra statiska värden. VARJE värde kan överstyras via processens miljövariabler (`ProcessInfo.processInfo.environment`), annars gäller default:

| Konstant | Env-variabel | Default |
|---|---|---|
| `apiBaseURL` (URL) | `DELIVERA_API_URL` | `https://api.delivera.se` |
| `adyenClientKey` (String) | `ADYEN_CLIENT_KEY` | `test_UXISGJQFT5HMVFEXRJZ4E3DWVA6MIVEC` |
| `adyenEnvironment` (String) | `ADYEN_ENVIRONMENT` | `test` |
| `supabaseURL` (URL) | `SUPABASE_URL` | `https://qiviwmhunmqemqylmwkr.supabase.co` |
| `supabaseAnonKey` (String) | `SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpdml3bWh1bm1xZW1xeWxtd2tyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwODg1MjgsImV4cCI6MjA5MTY2NDUyOH0._4FkvtBpK27JOrh_NZhCEULDDpN8QqUFsyZBcypLK10` |

Bas-URL:erna byggs med force-unwrap av `URL(string:)`, defaultvärdena är alltid giltiga.

## 3. Tema och design-tokens (DeliveraTheme)

Fil: `Core/DesignSystem/DeliveraTheme.swift`. Konvertering: hex = round(komponent x 255).

### 3.1 Grundfärger

| Token | RGB (0..1) | RGB (0..255) | Hex |
|---|---|---|---|
| `orange` (primär brand) | 0.94, 0.31, 0.10 | 240, 79, 26 | `#F04F1A` |
| `ink` (text, nästan svart) | 0.06, 0.06, 0.07 | 15, 15, 18 | `#0F0F12` |
| `muted` (sekundär text) | 0.43, 0.42, 0.40 | 110, 107, 102 | `#6E6B66` |
| `panel` | ren vit | 255, 255, 255 | `#FFFFFF` |
| `line` (avdelare) | svart med opacity 0.065 | rgba(0,0,0,0.065) | `#000000` @ 6.5 % |
| `gold` | 0.94, 0.73, 0.36 | 240, 186, 92 | `#F0BA5C` |

### 3.2 dealBlue-familjen (deal-kortens identitet)

Ljus, ren, FLAT blå (ingen glow). Delas av hero-bannern och deal-rälsen så allt känns som ett system.

| Token | RGB (0..1) | RGB (0..255) | Hex |
|---|---|---|---|
| `dealBlue` | 0.07, 0.53, 0.96 | 18, 135, 245 | `#1287F5` |
| `dealBlueDeep` | 0.04, 0.33, 0.85 | 10, 84, 217 | `#0A54D9` |
| `dealBlueInk` (mörk text på ljusblått) | 0.03, 0.24, 0.46 | 8, 61, 117 | `#083D75` |
| `dealBlueChip` (ljus chip-bakgrund) | 0.88, 0.95, 1.0 | 224, 242, 255 | `#E0F2FF` |

`dealBlueGradient`: `LinearGradient` från `dealBlue` (#1287F5) till `dealBlueDeep` (#0A54D9), startPoint `.topLeading`, endPoint `.bottomTrailing`. CSS-motsvarighet: `linear-gradient(135deg, #1287F5 0%, #0A54D9 100%)`.

### 3.3 appBackground (global bakgrund)

`LinearGradient` med TRE stopp, startPoint `.topLeading`, endPoint `.bottomTrailing`:

| Stopp | RGB (0..1) | RGB (0..255) | Hex |
|---|---|---|---|
| 1 | 0.99, 0.98, 0.95 | 252, 250, 242 | `#FCFAF2` (varmt off-white) |
| 2 | 0.96, 0.98, 0.96 | 245, 250, 245 | `#F5FAF5` (svagt grönaktig) |
| 3 | 0.99, 0.96, 0.93 | 252, 245, 237 | `#FCF5ED` (varm persika-ton) |

CSS: `linear-gradient(135deg, #FCFAF2 0%, #F5FAF5 50%, #FCF5ED 100%)`.

### 3.4 cardShadow

View-extension `cardShadow()`, används på alla kort:

```
shadow(color: black opacity 0.075, radius: 18, x: 0, y: 10)
```

CSS: `box-shadow: 0 10px 18px rgba(0, 0, 0, 0.075);` (obs: SwiftUI-radius är blur-radie).

### 3.5 DpointsGlyph

Dpoints-symbolen, byggd helt i kod (ingen bildresurs). Parameter `size: CGFloat = 18`.

Konstruktion, allt relativt `size`:
1. Bas: `RoundedRectangle` med `cornerRadius = size * 0.22`, style `.continuous`, fylld med `DeliveraTheme.orange` (#F04F1A), frame `size x size`.
2. Overlay: en mindre `RoundedRectangle` med `cornerRadius = size * 0.1`, style `.continuous`, ENDAST vit stroke (ingen fyllning) med `lineWidth = max(1.5, size * 0.11)`, frame `(size * 0.42) x (size * 0.42)`, roterad 45 grader. Resultatet ser ut som en orange kvadrat med en vit diamant/romb i mitten.

### 3.6 DpointsPriceBadge

Kapsel-badge som visar Dpoints-pris på en produkt. Props: `product: MenuProduct`, `valuePerKr: Double = 10`, `extrasTotal: Double = 0`, `quantity: Int = 1`.

- Renderas ENDAST om `product.rewardable == true`, annars ingenting.
- Innehåll: `HStack(spacing: 5)` med `DpointsGlyph(size: 16)` + text:

```
"\(product.dpointsUnitCost(valuePerKr: valuePerKr, extrasTotal: extrasTotal) * quantity) Dpoints"
```

- Text: `font(.system(size: 12, weight: .black))`, färg `DeliveraTheme.orange` (#F04F1A).
- Container: horisontell padding 8, fast höjd 26, bakgrund `orange.opacity(0.09)` i `Capsule`-form (helt rundad pill).

Formeln `dpointsUnitCost` definieras på `MenuProduct` (se avsnitt 5.2): fast `rewardPointsPrice` om > 0, annars `ceil(max(0, effectivePrice + extrasTotal) * faktor)` där faktor = `rewardPointsMultiplier` om den är > 0, annars `valuePerKr`. Badgen multiplicerar sedan med `quantity`.

### 3.7 RemoteImage

Fil: `Core/DesignSystem/RemoteImage.swift`. Egen asynkron bildkomponent (INTE AsyncImage). Props: `urlString: String?`, `contentMode: ContentMode = .fill`, `showsFailureIcon: Bool = true`.

Tillstånd och rendering (ZStack, alltid `.clipped()`):

| Tillstånd | Visas |
|---|---|
| Bild laddad | `Image(uiImage:)`, resizable, `aspectRatio(contentMode:)`, transition `.opacity` (fade-in). |
| URL finns, laddar, inget fel | `ShimmerLoadingView` (se nedan). |
| Fel/ingen URL och `showsFailureIcon == true` | Placeholder-gradient med overlay: SF-symbolen `photo`, `font(.system(size: 25, weight: .bold))`, färg `ink.opacity(0.24)`. |
| Fel/ingen URL och `showsFailureIcon == false` | Endast placeholder-gradienten. |

- Placeholder-gradient: `LinearGradient` från vit opacity 0.7 till `orange.opacity(0.14)`, topLeading till bottomTrailing.
- Laddning triggas med `.task(id: normalizedURLString)`: URL-strängen trimmas på whitespace/newlines, och OMSTART sker varje gång den normaliserade strängen ändras (dvs `?v=`-cache-bust i URL:en ger automatiskt omladdning eftersom hela strängen är task-id). Ingen egen minnescache, komponenten litar på `URLSession.shared`:s standardbeteende plus serverns cache-headers.
- `loadImage()`-flöde: nollställ (`loadedImage = nil`, `didFail = false`). Tom/nil URL ger `didFail = true`. URL byggs via `makeURL`: om strängen redan har scheme används den rakt av, annars percent-encodas den (`.urlQueryAllowed`) och parsas igen. Hämtning med `URLSession.shared.data(from:)`. HTTP-status utanför 200..<300, odekodbar bilddata eller kastat fel ger `didFail = true`. `isLoading`-flaggan förhindrar parallella laddningar.

### 3.8 ShimmerLoadingView

Premium laddnings-shimmer, driven av `TimelineView(.animation)` med `t = timeIntervalSinceReferenceDate` (kontinuerlig, ingen fast duration). Skalar mot ytans storlek (GeometryReader, `w`, `h`, `minSide = min(w, h)`).

Lager (ZStack):
1. Basgradient topLeading till bottomTrailing: `#F2F2F5` (0.95, 0.95, 0.96) till `#E6E6EB` (0.90, 0.90, 0.92).
2. Ljus-svep: rektangel fylld med horisontell gradient `clear -> white opacity 0.85 -> clear`, bredd `max(60, w * 0.45)`, `blur(radius: 8)`, roterad 18 grader. Position: `sweep = (sin(t * 1.1) + 1) / 2` (0..1), `offset(x: sweep * (w + w * 0.45) - w * 0.72)`. Svepet pendlar alltså sinusformat fram och tillbaka, INTE loopande åt ett håll.
3. Pulserande brand-block i mitten: `RoundedRectangle(cornerRadius: minSide * 0.16, .continuous)` fylld `orange.opacity(0.12)`, storlek `(minSide * 0.26)^2`, overlay SF-symbolen `fork.knife` i `font(.system(size: minSide * 0.12, weight: .black))` färg `orange.opacity(0.55)`. `scaleEffect(1 + 0.06 * sin(t * 2.2))`, opacity 0.85, centrerad `(w/2, h/2)`.

## 4. API-kontraktet (DeliveraAPI + CourierAPI)

### 4.1 Gemensamma transport-regler

**DeliveraAPI** (`Core/API/DeliveraAPI.swift`):

- Bas-URL: `AppConfig.apiBaseURL` (default `https://api.delivera.se`). Path trimmas på ledande/avslutande `/` innan den appendas.
- Alla requests: `cachePolicy = .reloadIgnoringLocalAndRemoteCacheData`, `timeoutInterval = 15` sekunder, headers `Cache-Control: no-cache` och `Pragma: no-cache`.
- POST/PATCH: `Content-Type: application/json`, body kodas med standard-`JSONEncoder()` (inga strategier).
- Decoder: `JSONDecoder.delivera` = standard-`JSONDecoder` med `keyDecodingStrategy = .useDefaultKeys` (dvs exakta JSON-nyckelnamn, ingen snake_case-konvertering, INGEN date-strategi, datum hanteras som strängar).
- Auth: `Authorization: Bearer <token>` sätts endast där det anges nedan. Token trimmas på whitespace, tom token ger ingen header.
- Cache-bust: flera GET-anrop skickar `_t=<millisekunder sedan epoch>` som query-param.
- Felhantering, tre varianter av anrop:
  - `get`/`post` (enkla): icke-HTTPURLResponse ger `APIError.invalidResponse`, status utanför 200..<300 ger `APIError.requestFailed(status)`.
  - `*WithServerMessage` (post/patch/getAuthorized): vid status utanför 200..<300 försöker klienten avkoda `{"error": "<text>"}` (`ServerErrorResponse`); om `error` är icke-tom kastas `APIError.message(error)` (visas rakt av för användaren), annars `APIError.requestFailed(status)`.
- `APIError` (Core/API/APIError.swift), svenska feltexter:
  - `.invalidResponse`: "Ogiltigt svar från API:t."
  - `.requestFailed(status)`: "API-anropet misslyckades (\(status))."
  - `.message(text)`: servertexten rakt av.

**CourierAPIClient** (`Core/API/CourierAPI.swift`):

- Samma bas-URL. Har egen `token`-property; sätts den (icke-tom) skickas `Authorization: Bearer <token>` på ALLA anrop.
- Headers: `Accept: application/json` alltid, `Content-Type: application/json` på POST. Ingen no-cache, ingen explicit timeout (URLSession-default).
- Decoder: `JSONDecoder` med `dateDecodingStrategy = .iso8601` (skiljer sig från DeliveraAPI!).
- Felhantering (`run`): ingen HTTPURLResponse ger `CourierError.message("Ingen serverrespons")`. Status 401 ger `CourierError.unauthorized` (feltext: "Sessionen har gått ut. Logga in igen."). Annan felstatus: försök avkoda `{"error": "..."}` och kasta `CourierError.message(error)`, annars `CourierError.message("Serverfel \(status)")`. Tom svarskropp accepteras om måltypen är `CourierOK` (returnerar `ok: true`).

### 4.2 Endpoint-översikt

| # | Metod | Path | Auth | Klient |
|---|---|---|---|---|
| 1 | GET | `/api/restaurants` | Nej | Delivera |
| 2 | GET | `/api/restaurants/:slug` | Nej | Delivera |
| 3 | GET | `/api/restaurants/:slug/reviews` | Nej | Delivera |
| 4 | GET | `/api/menu/categories` | Nej | Delivera |
| 5 | GET | `/api/sponsors` | Nej | Delivera |
| 6 | GET | `/api/ads` | Nej | Delivera |
| 7 | GET | `/api/deals/app` | Valfri Bearer | Delivera |
| 8 | POST | `/api/deals/app/:id/claim` | Bearer | Delivera |
| 9 | POST | `/api/deals/app/quote` | Bearer | Delivera |
| 10 | POST | `/api/deals/app/my-deals` | Bearer | Delivera |
| 11 | POST | `/api/deals/app/favorite/claim` | Bearer | Delivera |
| 12 | GET | `/api/home/pulse` | Valfri Bearer | Delivera |
| 13 | GET | `/api/account/referral` | Bearer | Delivera |
| 14 | POST | `/api/account/redeem-code` | Bearer | Delivera |
| 15 | GET | `/api/settings` | Nej | Delivera |
| 16 | GET | `/api/home-categories` | Nej | Delivera |
| 17 | GET | `/api/cities` | Nej | Delivera |
| 18 | POST | `/api/cities/validate-location` | Nej | Delivera |
| 19 | GET | `/api/dpoints/me` | Nej eller Bearer (två varianter) | Delivera |
| 20 | GET | `/api/dpoints/rewards` | Nej | Delivera |
| 21 | GET | `/api/dpoints/reward-products` | Nej | Delivera |
| 22 | POST | `/api/dpoints/claim-signup` | Nej eller Bearer (två varianter) | Delivera |
| 23 | GET | `/api/profile` | Bearer | Delivera |
| 24 | GET | `/api/profile/orders` | Bearer | Delivera |
| 25 | GET | `/api/profile/deals` | Bearer | Delivera |
| 26 | POST | `/api/discount/validate` | Nej | Delivera |
| 27 | POST | `/api/orders` | Valfri Bearer + Idempotency-Key | Delivera |
| 28 | GET | `/api/orders/:id` | Valfri Bearer, alt phone/token-query | Delivera |
| 29 | PATCH | `/api/orders/:id/status` | Valfri Bearer, alt phone/token-query | Delivera |
| 30 | POST | `/api/orders/:id/review` | Valfri Bearer, alt phone/accessToken i body | Delivera |
| 31 | POST | `/api/orders/:id/live-activity-token` | Nej | Delivera |
| 32 | POST | `/api/orders/:id/abandon` | Nej | Delivera |
| 33 | POST | `/api/payments/create` | Nej | Delivera |
| 34 | POST | `/api/payments/adyen/verify` | Nej | Delivera |
| 35 | GET | `/api/places/autocomplete` | Nej | Delivera |
| 36 | GET | `/api/places/geocode` | Nej | Delivera |
| 37 | GET | `/api/places/reverse` | Nej | Delivera |
| 38 | POST | `/api/courier/login` | Nej | Courier |
| 39 | GET | `/api/courier/me` | Bearer | Courier |
| 40 | GET | `/api/courier/session` | Bearer | Courier |
| 41 | POST | `/api/courier/session/start` | Bearer | Courier |
| 42 | POST | `/api/courier/session/stop` | Bearer | Courier |
| 43 | GET | `/api/courier/jobs` | Bearer | Courier |
| 44 | GET | `/api/courier/jobs/:id` | Bearer | Courier |
| 45 | POST | `/api/courier/jobs/:orderId/accept` | Bearer | Courier |
| 46 | GET | `/api/courier/active` | Bearer | Courier |
| 47 | POST | `/api/courier/deliveries/:id/picked-up` | Bearer | Courier |
| 48 | POST | `/api/courier/deliveries/:id/complete` | Bearer | Courier |
| 49 | GET | `/api/courier/history` | Bearer | Courier |
| 50 | POST | `/api/courier/location` | Bearer | Courier |
| 51 | POST | `/api/courier/push/register` | Bearer | Courier |

### 4.3 Detaljposter, DeliveraAPI

**1. GET /api/restaurants** (`restaurants()`)
Query: `_t=<epoch ms>` (cache-bust). Ingen auth. Svar: `[Restaurant]` (se 5.1). Fel: enkel variant (requestFailed).

**2. GET /api/restaurants/:slug** (`restaurant(slug:)`)
Ingen query, ingen auth. Svar: `Restaurant`.

**3. GET /api/restaurants/:slug/reviews** (`restaurantReviews(slug:)`)
Ingen auth. Svar: `RestaurantReviewsResponse` (se 5.9).

**4. GET /api/menu/categories** (`menu(slug:)`)
Query: `slug=<restaurangens slug>`, `v=swift` (klientmarkör). Ingen auth. Svar: `MenuResponse` (se 5.2), accepterar både rå array `[MenuCategory]` och objekt `{"categories": [...]}`.

**5. GET /api/sponsors** (`sponsors()`)
Ingen auth. Svar: `[Sponsor]` (se 5.4).

**6. GET /api/ads** (`trackingAds()`)
Ingen auth. Svar: `[TrackingAd]` (se 5.4).

**7. GET /api/deals/app** (`appDeals(placement:limit:isLoggedIn:token:)`, wrapper `homeAppDeals` med placement `HOME_TOP`)
Query: `placement=<HOME_TOP|REWARDS|CART>`, `limit=<int, default 8>`, `loggedIn=1|0`, `_t=<epoch ms>`. Auth: Bearer skickas OM token finns och inte är tom efter trimning (annars anonym feed). Svar: `HomeAppDealsResponse { deals: [HomeAppDeal] }` (se 5.4). Fel: enkel variant.

**8. POST /api/deals/app/:id/claim** (`claimHomeAppDeal(id:token:)`)
Auth: Bearer obligatorisk. Body: `{}` (EmptyAPIRequest). Svar: `HomeAppDealClaimResponse { claimed: Bool, deal: HomeAppDeal?, userDeal: ClaimedUserDeal? }`. Fel: servermeddelande-variant (`{"error": ...}` visas för användaren).

**9. POST /api/deals/app/quote** (`quoteAppDeal(_:token:)`)
Auth: Bearer. Body: `AppDealQuoteRequest` (definieras i kassans modellfiler, annan spec-del). Svar: `AppDealQuoteResponse`. Fel: servermeddelande.

**10. POST /api/deals/app/my-deals** (`myDeals(_:token:)`)
Auth: Bearer. Body: `MyDealsRequest` (varukorgens innehåll, annan spec-del). Svar: `MyDealsResponse`. Kommentar i koden: "Alla mina deals quotade mot varukorgen (kassans väljbara lista)." Fel: servermeddelande.

**11. POST /api/deals/app/favorite/claim** (`claimFavorite(productId:token:)`)
Auth: Bearer. Body: `{"productId": "<id>"}`. Svar: `FavoriteClaimResponse { claimed: Bool, userDealId: String, amountKr: Int, title: String }`. Kommentar: "Din favorit: aktivera 10%-rabatten (skapar kupongen för kassan)." Fel: servermeddelande.

**12. GET /api/home/pulse** (`homePulse(token:)`)
Query: `_t=<epoch ms>`. Auth: Bearer om token finns (annars anonym). Svar: `HomePulseResponse { greeting: String?, modules: [HomePulseModule] }` (se 5.3). Fel: enkel variant.

**13. GET /api/account/referral** (`referralStatus(token:)`)
Auth: Bearer (getAuthorized, servermeddelande-fel). Svar: `ReferralStatusResponse` (se 5.7).

**14. POST /api/account/redeem-code** (`redeemReferralCode(code:token:)`)
Auth: Bearer. Body: `{"code": "<väns kod>"}`. Svar: `RedeemReferralResponse { ok: Bool, inviterName: String?, dealsCreated: Int?, userDealId: String? }`. `userDealId` används för att applicera dealen direkt i kassan. Fel: servermeddelande.

**15. GET /api/settings** (`settings()`)
Ingen auth. Svar: `PlatformSettings { companyName: String?, organizationNumber: String?, companyAddress: String?, dpoints: PlatformDpointsSettings? }` där `PlatformDpointsSettings { enabled: Bool?, perKr: Double?, valuePerKr: Double? }`.

**16. GET /api/home-categories** (`homeSections()`)
Ingen auth. Svar: `[HomeCategorySection]` (se 5.5).

**17. GET /api/cities** (`cities()`)
Ingen auth. Svar: `[City]` (se 5.6).

**18. POST /api/cities/validate-location** (`validateLocation(latitude:longitude:)`)
Ingen auth. Body: `{"lat": Double, "lng": Double}` (`ZoneValidationRequest`). Svar: `ZoneValidationResponse` (se 5.8). Fel: enkel variant (INTE servermeddelande).

**19. GET /api/dpoints/me** (tre varianter: `dpointsMe()` -> `DpointsMe`, `dpointsMeDetailed()` -> `RewardsMe` utan auth, `dpointsMeDetailed(token:)` -> `RewardsMe` med Bearer)
`DpointsMe { enabled: Bool, balance: Int, valuePerKr: Double }`. `RewardsMe` definieras i annan spec-del. Auth-varianten använder getAuthorized (servermeddelande-fel), de anonyma enkel GET.

**20. GET /api/dpoints/rewards** (`dpointsRewards()`)
Ingen auth. Svar: `DpointsRewardsResponse` (annan spec-del).

**21. GET /api/dpoints/reward-products** (`dpointsRewardProducts(forceRefresh:)`)
Query: `refresh=1` ENDAST om `forceRefresh == true`, annars ingen query. Ingen auth. Svar: `DpointsRewardProductsResponse` (annan spec-del).

**22. POST /api/dpoints/claim-signup** (tre varianter: `claimDpointsSignupBonus()` -> `DpointsMe`, `claimDpointsSignupBonusDetailed()` -> `RewardsMe`, `claimDpointsSignupBonusDetailed(token:)` -> `RewardsMe` med Bearer)
Body: `{}`. Fel: servermeddelande i alla varianter.

**23. GET /api/profile** (`authenticatedProfile(token:)`)
Auth: Bearer. Svar: `AuthenticatedCustomerProfile` (annan spec-del).

**24. GET /api/profile/orders** (`profileOrders(token:)`)
Auth: Bearer. Svar avkodas som `FlexibleProfileOrdersResponse` och klienten returnerar `.orders: [ProfileOrder]` (flexibel wrapper, annan spec-del).

**25. GET /api/profile/deals** (`profileDeals(token:)`)
Auth: Bearer. Svar: `[ProfileDeal]` (annan spec-del).

**26. POST /api/discount/validate** (`validateDiscount(code:subtotal:)`)
Ingen auth. Body: `{"code": String, "subtotal": Double}` (`DiscountValidationRequest`). Svar: `DiscountValidationResponse` (annan spec-del). Fel: servermeddelande. OBS: kassans kodfält testar FÖRST detta endpoint, sedan redeem-code som fallback (rabattkod eller väns referral-kod i samma fält).

**27. POST /api/orders** (`createOrder(_:idempotencyKey:authToken:)`)
Headers: `Idempotency-Key: <nyckel>` alltid, `Authorization: Bearer` om authToken finns (trimmat, icke-tomt). Body: `CartOrderRequest` (kassan, annan spec-del). Svar: `CartOrderResponse`. Fel: servermeddelande.

**28. GET /api/orders/:id** (`customerOrder(id:phone:token:authToken:)`)
Query: `phone=<telefon>` om satt, `token=<access-token>` om satt (båda trimmas, tomma utelämnas), alltid `_t=<epoch ms>`. Header: Bearer om authToken satt. Tre parallella bevisformer alltså: inloggad Bearer, telefonnummer eller order-access-token (gäst). Svar: `CustomerOrderResponse` (annan spec-del). Fel: enkel variant.

**29. PATCH /api/orders/:id/status** (`updateOrderStatus(id:status:phone:token:authToken:)`)
Query: `phone`/`token` som ovan (ingen `_t`). Header: Bearer om satt. Body: `{"status": "<ny status>"}`. Svar: `OrderStatusUpdateResponse { changed: Bool?, status: String? }`. Fel: servermeddelande.

**30. POST /api/orders/:id/review** (`reviewOrder(id:rating:review:phone:token:authToken:)`)
Header: Bearer om satt. Body (`OrderReviewRequest`):

```json
{
  "rating": 5,
  "review": "text eller null",
  "likedItemIds": [],
  "phone": "trimmad eller utelämnad (nil om tom)",
  "accessToken": "trimmad eller utelämnad (nil om tom)"
}
```

`likedItemIds` skickas alltid som tom array från Swift-appen. Svar: `OrderReviewResponse { success: Bool, dpoints: { awarded: Bool?, points: Int?, balanceAfter: Int?, reason: String? }? }`. Fel: servermeddelande.

**31. POST /api/orders/:id/live-activity-token** (`registerLiveActivityToken(orderId:token:)`)
Body: `{"token": "<APNs Live Activity push-token>"}` (`LiveActivityTokenRequest`). Svar ignoreras (`EmptyAPIResponse?`). Fel: servermeddelande (kastas vidare).

**32. POST /api/orders/:id/abandon** (`abandonOrder(orderId:phone:)`)
Body: `{"phone": "<telefon eller null>"}` (nil om tom sträng). Fire-and-forget: `try?`, alla fel sväljs, ingen returtyp.

**33. POST /api/payments/create** (`createAdyenPayment(orderId:returnURL:)`)
Body (`AdyenPaymentCreateRequest`):

```json
{
  "orderId": "<id>",
  "returnUrl": "<retur-URL>",
  "channel": "iOS",
  "storePaymentMethod": false
}
```

Svar: `AdyenPaymentCreateResponse` (annan spec-del, Adyen session). Fel: servermeddelande.

**34. POST /api/payments/adyen/verify** (`verifyAdyenPayment(orderId:sessionId:sessionResult:)`)
Body: `{"orderId": String, "sessionId": String, "sessionResult": String}`. Svar: `AdyenVerifyResponse` (annan spec-del). Fel: servermeddelande.

**35. GET /api/places/autocomplete** (`autocompletePlaces(input:sessionToken:)`)
Klient-guard: om trimmad input är kortare än 3 tecken returneras tom lista UTAN nätverksanrop. Query: `input=<söktext>`, `sessiontoken=<Google-sessionstoken>`. Svar: `PlacesAutocompleteResponse { predictions: [PlacePrediction] }`, klienten returnerar `predictions`.

**36. GET /api/places/geocode** (`geocodePlace(placeID:sessionToken:)`)
Query: `place_id=<id>`, `sessiontoken=<token>`. Svar: `PlaceGeocodeResponse { location: {lat, lng}, postalCode: String?, city: String? }`.

**37. GET /api/places/reverse** (`reverseGeocode(latitude:longitude:)`)
Query: `lat=<Double>`, `lng=<Double>` (String-interpolerade). Svar: `ReverseGeocodeResponse { address: String, postalCode: String?, city: String? }`.

### 4.4 Detaljposter, CourierAPIClient

Alla svar avkodas med ISO8601-datumstrategi. Bearer-token på allt utom login (klienten sätter headern så fort `token` inte är tom).

**38. POST /api/courier/login** (`login(email:password:)`)
Body: `{"email": "<trimmad e-post>", "password": "<lösenord>"}`. Svar: `CourierLoginResponse` (annan spec-del).

**39. GET /api/courier/me** (`me()`)
Svar: `CourierProfileData` (annan spec-del).

**40. GET /api/courier/session** (`session()`)
Svar avkodas som `[String: Bool]`, klienten returnerar `res["online"] == true`.

**41. POST /api/courier/session/start** (`startSession()`)
Body: `{}` (EmptyCourierBody). Svar: `CourierOK { ok: Bool }`, ignoreras.

**42. POST /api/courier/session/stop** (`stopSession()`)
Som ovan.

**43. GET /api/courier/jobs** (`jobs()`)
Svar: `[CourierJob]` (annan spec-del).

**44. GET /api/courier/jobs/:id** (`job(id:)`)
Svar: `CourierJob`.

**45. POST /api/courier/jobs/:orderId/accept** (`accept(orderId:)`)
Body: `{}`. Svar: `CourierDelivery` (annan spec-del).

**46. GET /api/courier/active** (`active()`)
Svar: `[CourierDelivery]`.

**47. POST /api/courier/deliveries/:deliveryId/picked-up** (`pickedUp(deliveryId:)`)
Body: `{}`. Svar: `CourierDelivery`.

**48. POST /api/courier/deliveries/:deliveryId/complete** (`complete(deliveryId:method:photoDataUrl:message:)`)
Body (`CourierCompleteBody`):

```json
{
  "method": "<CourierProofMethod.api-strängen>",
  "photoDataUrl": "<data-URL för foto, eller utelämnad>",
  "message": "<meddelande, eller utelämnad>"
}
```

Svar: `CourierOK`, ignoreras.

**49. GET /api/courier/history** (`history()`)
Svar: `[CourierHistoryOrder]` (annan spec-del).

**50. POST /api/courier/location** (`sendLocation(lat:lng:)`)
Body: `{"lat": Double, "lng": Double}`. Svar: `CourierOK`, ignoreras. (Backend broadcastar `courier:location` till order- och admin-rum.)

**51. POST /api/courier/push/register** (`registerPush(token:)`)
Body: `{"token": "<APNs hex-token>", "platform": "ios-apns"}`. Svar: `CourierOK`, ignoreras.

Hjälptyper i CourierAPI.swift: `CourierOK { ok: Bool }`, `CourierServerError { error: String }`, `CourierCompleteBody { method: String, photoDataUrl: String?, message: String? }`, `CourierError` (`.unauthorized` = "Sessionen har gått ut. Logga in igen.", `.message(String)` = servertext).

## 5. Datamodeller

Om inte annat sägs: fältnamn = JSON-nyckel exakt (useDefaultKeys), `?` = optionalt/nullable.

### 5.1 Restaurant.swift

**Restaurant** (Identifiable, Decodable, Hashable):

| Fält | Typ | Kommentar |
|---|---|---|
| id | String | |
| name | String | |
| slug | String | |
| cuisine | String? | |
| description | String? | |
| address | String? | |
| city | String? | |
| phone | String? | |
| latitude | Double? | |
| longitude | Double? | |
| selfDelivery | Bool? | |
| legalName | String? | |
| organizationNumber | String? | |
| imageUrl | String? | |
| heroImageUrl | String? | |
| rating | Double? | |
| ratingCount | Int? | |
| deliveryFee | Double? | KRONOR (API dividerar öre /100), dela aldrig igen |
| minOrderAmount | Double? | kronor |
| vatPercent | Double? | |
| etaMinutes | Int? | |
| isOpen | Bool? | |
| comingSoon | Bool? | |
| pausedUntil | String? | ISO8601-sträng, med eller utan fraktionssekunder |
| featuredClass | Int? | lägre = högre prioritet i hemsortering |
| tags | [String]? | |
| dealMaxPercent | var Int? = nil | rabatt-sammanfattning för kort-badge, default nil |
| dealCoversAll | var Bool? = nil | default nil |
| openingHours | RestaurantOpeningHours? | |

Computed/hjälpare:
- `hasImage`: `!(heroImageUrl ?? imageUrl ?? "").trimmed.isEmpty` (hero prioriteras).
- `static placeholder(slug:)`: Restaurant med `id = slug`, `name = "Restaurang"`, `slug = slug`, allt annat nil.

**RestaurantOpeningHours**: custom decoder som normaliserar öppettidernas TVÅ former till `days: [String: OpeningDay]` + `specialCount: Int`:
- Nyckeln `"regular"` med objekt `[String: OpeningDay]`: mergas in i `days` (nästlad form `{regular:{monday:...}}`).
- Nyckeln `"special"` med array: varje element konsumeras löst (`LooseJSONValue`) och `specialCount` räknas upp, innehållet används inte.
- Alla ANDRA nycklar tolkas som dagnamn direkt (platt form `{monday:...}`) och läggs i `days`.
Detta är Swift-implementationen av regeln `oh.regular?.[k] ?? oh[k]`.

**OpeningDay** custom decoder, tre accepterade JSON-former:
1. Ren array av slots: `[{"open":"11:00","close":"21:00"}, ...]` ger `closed = false`, `slots` = de avkodbara elementen.
2. Objekt med `"shifts"`: `{"closed": false, "shifts": [{open, close}, ...]}` ger `closed` = värdet (default false), `slots = shifts`.
3. Objekt med `"open"`/`"close"` direkt: `{"closed": false, "open": "11:00", "close": "21:00"}` ger en enda slot.
Saknas allt: `slots = []`. `closed` läses alltid från `"closed"`-nyckeln med default `false`.

**OpeningSlot**: `open: String` (krävs), `close: String?`. Tider i formatet `"HH:mm"`.

**LooseJSONValue**: decoder som konsumerar godtycklig JSON (nil/bool/tal/sträng/array/objekt) utan att spara något, används för att räkna special-poster.

**DynamicCodingKey**: CodingKey med fri strängnyckel (intValue stödjs via `String(intValue)`).

### 5.2 Menu.swift

**MenuResponse**: custom decoder, accepterar antingen rå array `[MenuCategory]` ELLER objekt `{"categories": [...]}`; saknas båda blir `categories = []`.

**MenuCategory**: `id: String`, `name: String`, `slug: String?`, `description: String?`, `imageUrl: String?`, `products: [MenuProduct]`.

**MenuProduct** (Codable, dvs även encodbar för snapshots):

| Fält | Typ |
|---|---|
| id | String |
| slug | String? |
| name | String |
| description | String? |
| price | Double (kronor) |
| discountActive | Bool? |
| discountPercent | Double? |
| discountPrice | Double? (kronor) |
| discountLabel | String? |
| imageUrl | String? |
| isVegan | Bool? |
| isVegetarian | Bool? |
| isGlutenFree | Bool? |
| rewardable | Bool? |
| rewardPointsMultiplier | Double? |
| rewardPointsPrice | Int? |
| displayMode | String? |
| hideDescription | Bool? |
| extraGroups | [MenuExtraGroup]? |

Computed:

```swift
var effectivePrice: Double {
    if discountActive == true, let discountPrice { return discountPrice }
    return price
}

var requiresConfiguration: Bool { !(extraGroups ?? []).isEmpty }

var hasImage: Bool { imageUrl finns och är icke-tom efter trimning }

func dpointsUnitCost(valuePerKr: Double, extrasTotal: Double = 0) -> Int {
    if let rewardPointsPrice, rewardPointsPrice > 0 { return rewardPointsPrice }
    let factor = (rewardPointsMultiplier ?? valuePerKr) > 0
        ? (rewardPointsMultiplier ?? valuePerKr)
        : valuePerKr
    return Int(ceil(max(0, effectivePrice + extrasTotal) * factor))
}
```

Prioritetsordning för Dpoints-pris: 1) fast `rewardPointsPrice` om > 0, 2) `rewardPointsMultiplier` om > 0, 3) plattformens `valuePerKr` (default-parametern i badgen är 10). Alltid uppåtavrundning, aldrig negativt underlag.

`replacingExtraGroups(_:)`: returnerar kopia av produkten med nya extraGroups (immutabel uppdatering).

**DpointsMe**: `enabled: Bool`, `balance: Int`, `valuePerKr: Double`.

**MenuExtraGroup** (Codable): `id: String`, `name: String`, `description: String?`, `type: String?`, `required: Bool?`, `minSelections: Int?`, `maxSelections: Int?`, `displayStyle: String?`, `allowQuantity: Bool?`, `extras: [MenuExtra]`. Hjälpare `replacingExtras(_:)` = immutabel kopia med nya extras.

**MenuExtra** (Codable): `id: String`, `name: String`, `priceAddon: Double?` (kronor), `isDefault: Bool?`, `imageUrl: String?`. Computed `hasImage` som ovan.

### 5.3 HomePulse.swift

Serverkomponerad hemskärm, `GET /api/home/pulse`. Servern bestämmer vilka moduler som visas (max 3) och veckans tema.

**HomePulseResponse**: `greeting: String?`, `modules: [HomePulseModule]`.

**HomePulseModule** (Identifiable, Hashable), alla fält utom type/id/title optionella, custom decoder:

| Fält | Typ | Används av modultyp |
|---|---|---|
| type | String | modul-diskriminator (CHAMPION, HOT_PRODUCTS, NEW_MENU_ITEMS, FASTEST_TODAY, TRENDING, NEW_RESTAURANTS, POINTS_NUDGE, DAILY_DROP, STREAK, FAVORITE) |
| id | String | |
| theme | String? | veckans tema |
| title | String | |
| subtitle | String? | |
| restaurant | PulseRestaurant? | CHAMPION |
| products | [PulseProduct]? | HOT_PRODUCTS |
| items | [PulseProduct]? | NEW_MENU_ITEMS |
| restaurants | [PulseRailRestaurant]? | FASTEST_TODAY / TRENDING / NEW_RESTAURANTS |
| product | PulseNudgeProduct? | POINTS_NUDGE |
| balance | Int? | POINTS_NUDGE |
| remainingPoints | Int? | POINTS_NUDGE |
| endsAt | String? | DAILY_DROP |
| dropProduct | PulseProduct? | DAILY_DROP |
| progress | PulseStreakProgress? | STREAK |
| images | [String]? | CHAMPION, upp till 5 roterande bilder |
| percent | Int? | FAVORITE, rabatt i procent |

VIKTIG avkodningsdetalj: JSON-nyckeln `"product"` avkodas till BÅDA fälten, `product = try? decodeIfPresent(PulseNudgeProduct...)` och `dropProduct = try? decodeIfPresent(PulseProduct...)`, med `try?` så att fel form tyst blir nil. Vilken som används avgörs av `type`.

**PulseStreakProgress**: `count: Int`, `target: Int`, `rewardPoints: Int`.

**PulseRestaurant**: `id: String`, `name: String`, `slug: String`, `cuisine: String?`, `imageUrl: String?`, `heroImageUrl: String?`, `rating: Double?`.

**PulseProduct**: `productId: String`, `name: String`, `priceKr: Double`, `imageUrl: String?`, `restaurant: PulseRestaurant`.

**PulseRailRestaurant** (delas av Snabbast idag / Trendar / Ny i stan, särskiljande fält optionella): `id: String`, `name: String`, `slug: String`, `cuisine: String?`, `imageUrl: String?`, `heroImageUrl: String?`, `rating: Double?`, `avgMinutesToday: Int?`, `deliveredToday: Int?`, `growthPct: Int?`.

**PulseNudgeProduct**: `productId: String`, `name: String`, `imageUrl: String?`, `costPoints: Int`, `restaurant: PulseRestaurant`.

**FavoriteClaimResponse**: `claimed: Bool`, `userDealId: String`, `amountKr: Int`, `title: String`.

### 5.4 Sponsor.swift (sponsorer, ads, app-deals, settings)

**Sponsor** (Identifiable, Decodable, Hashable):

| Fält | Typ | Kommentar |
|---|---|---|
| id | String | |
| name | String | |
| imageUrl | String | ej optional |
| videoUrl | String? | video-stöd i sponsorkort |
| cardType | String? | Korttyp 2.0: `RESTAURANT` / `DEAL` / `AD` / `TEXT`, admin-styrt |
| dealId | String? | |
| headline | String? | |
| bodyText | String? | |
| dealInfo | SponsorDealInfo? | |
| isActive | Bool? | |
| isClickable | Bool? | |
| linkType | String? | |
| linkTarget | String? | |
| ctaText | String? | |
| ctaLink | String? | |
| showName | Bool? | |
| imageOnly | Bool? | |
| category | String? | |
| tier | String? | |
| tagline | String? | |
| color | String? | |

**SponsorDealInfo**: `id: String`, `title: String`, `valueLabel: String?`, `minOrderKr: Double?`.

**TrackingAd** (annonser på tracking-skärmen): `id: String`, `brand: String?`, `title: String`, `subtitle: String?`, `imageUrl: String?`, `url: String?`, `imageOnly: Bool?`, `isActive: Bool?`, `sortOrder: Int?`.

**HomeAppDealsResponse** (Codable): `deals: [HomeAppDeal]`.

**HomeAppDealClaimResponse** (Codable): `claimed: Bool`, `deal: HomeAppDeal?`, `userDeal: ClaimedUserDeal?`.

**ClaimedUserDeal** (Codable): `id: String`, `dealId: String?`, `status: String?`.

**HomeAppDeal** (Identifiable, Codable, Hashable), OBS Codable eftersom den snapshotas till AppStorage (`delivera.activeUserDealSnapshot`):

| Fält | Typ | Kommentar |
|---|---|---|
| id | String | |
| title | String | |
| subtitle | String? | |
| badge | String? | |
| imageUrl | String? | |
| ctaLabel | String? | |
| placement | String | HOME_TOP / REWARDS / CART |
| audience | String | |
| template | String | |
| size | String | |
| claimRequired | Bool | ej optional |
| dpointsBonus | Int? | |
| missionType | String? | t.ex. THREE_ORDERS_WEEK |
| missionProgress | HomeAppDealMissionProgress? | |
| checkoutApplicable | Bool? | |
| discountType | String? | FIXED / PERCENTAGE |
| discountPercent | Int? | |
| amountKr | Int? | kronor, heltal |
| freeDelivery | Bool | ej optional |
| minOrderKr | Int | ej optional, kronor |
| restaurant | HomeAppDealRestaurant? | restaurang-scope |
| userDealId | String? | satt när kunden redan claimat |
| theme | String? | |

**HomeAppDealMissionProgress** (Codable): `target: Int`, `count: Int`, `remaining: Int`, `completed: Bool`, `windowDays: Int`, `rewardPoints: Int`, `claimed: Bool`.

**HomeAppDealRestaurant** (Codable): `id: String`, `name: String`, `slug: String`, `imageUrl: String?`, `cuisine: String?`.

**PlatformSettings**: `companyName: String?`, `organizationNumber: String?`, `companyAddress: String?`, `dpoints: PlatformDpointsSettings?`.

**PlatformDpointsSettings**: `enabled: Bool?`, `perKr: Double?`, `valuePerKr: Double?`.

### 5.5 HomeCategorySection.swift

**HomeCategorySection**: `id: String`, `title: String`, `slug: String`, `subtitle: String?`, `isActive: Bool`, `sortOrder: Int`, `filterMode: String`, `maxRestaurants: Int`, `manualRestaurantIds: [String]`, `filters: HomeCategoryFilters`.

**HomeCategoryFilters**, custom decoder med defaults (fält kan saknas i JSON):

| Fält | Typ | Default om saknas |
|---|---|---|
| searchTerm | String? | nil |
| cuisines | [String] | `[]` |
| tags | [String] | `[]` |
| featuredClasses | [Int] | `[]` |
| maxEtaMinutes | Int? | nil |
| freeDeliveryOnly | Bool | `false` |
| openNowOnly | Bool | `false` |

### 5.6 City.swift

**City**: `id: String`, `name: String`, `slug: String`, `isActive: Bool`, `deliveryMode: String?`.

### 5.7 Referral.swift

Wolt-stil referral: kompisen anger min kod i kassan, båda belönas.

**RedeemReferralRequest** (Encodable): `code: String`.

**RedeemReferralResponse**: `ok: Bool`, `inviterName: String?`, `dealsCreated: Int?`, `userDealId: String?` (klienten applicerar denna direkt i kassan).

**ReferralStatusResponse**: `locked: Bool` (egen kod låst tills 1 betald order), `code: String?`, `shareUrl: String?`, `enabled: Bool`, `rewardLabel: String?`, `couponsPerSide: Int?`, `deal: ReferralDealInfo?`, `stats: ReferralStats?`.

**ReferralStats**: `invited: Int`, `registered: Int`, `ordered: Int`, `totalEarnedKr: Double?`.

**ReferralDealInfo**: `title: String?`, `discountType: String?`, `discountPercent: Double?`, `amountKr: Double?`, `freeDelivery: Bool?`, `minOrderKr: Double?`, `validUntil: String?`.

### 5.8 PlacePrediction.swift + ZoneValidation.swift

**PlacePrediction**: `description: String`, `placeID: String` med CodingKey-avvikelse `placeID = "place_id"`. Computed `id = placeID`.

**PlacesAutocompleteResponse**: `predictions: [PlacePrediction]`.

**PlaceGeocodeResponse**: `location: Coordinate`, `postalCode: String?`, `city: String?`.

**ReverseGeocodeResponse**: `address: String`, `postalCode: String?`, `city: String?`.

**Coordinate**: `lat: Double`, `lng: Double`.

**ZoneValidationRequest** (Encodable): `lat: Double`, `lng: Double`.

**ZoneValidationResponse** (Codable): `covered: Bool`, `cities: [ZoneCity]`.

**ZoneCity** (Codable): `id: String?`, `name: String?`, `restaurants: [ZoneRestaurant]`.

**ZoneRestaurant** (Codable): `id: String`, `name: String`, `slug: String`, `isOpen: Bool?`, `deliveryFee: Double?`, `minOrderAmount: Double?`, `etaMinutes: Int?`, `matchedZone: MatchedZone?`.

**MatchedZone** (Codable): `deliveryFee: Double?`, `minOrder: Double?`, `etaMinutes: Int?`. UNDANTAG från kr-regeln: zonens belopp kommer i ÖRE, med computed properties:

```swift
var feeKr: Double? { deliveryFee.map { $0 / 100 } }
var minOrderKr: Double? { minOrder.map { $0 / 100 } }
```

Använd ALLTID `feeKr`/`minOrderKr` i UI, aldrig råvärdena.

### 5.9 RestaurantReview.swift

**RestaurantReviewsResponse**: `averageRating: Double`, `totalCount: Int`, `reviews: [RestaurantReview]`.

**RestaurantReview**: `id: String`, `customerName: String`, `rating: Int?`, `comment: String?`, `reply: String?`, `likedItems: [String]?`, `createdAt: String?` (sträng, ej Date).

### 5.10 OrderActivityAttributes.swift (Live Activity)

`OrderActivityAttributes: ActivityAttributes` (ActivityKit, iOS Live Activity på låsskärm/Dynamic Island).

Statiska attribut (sätts vid start): `orderId: String`, `displayOrderNumber: String`, `restaurantName: String`, `orderTotal: String` (färdigformaterad sträng).

`ContentState = OrderState` (uppdateras via push, alla `var`): `status: String`, `statusText: String` (färdig visningstext från servern), `progressStep: Int`, `etaMinutes: Int?`, `driverName: String?`, `orderType: String?`, `etaEndsAt: Double?` (epoch-tid för nedräkning). Push-token för aktiviteten registreras via endpoint 31.

### 5.11 Array+Uniqued.swift (hjälpare på [Restaurant])

```swift
func sortedForHome() -> [Restaurant] {
    sorted {
        let leftClass = $0.featuredClass ?? 99
        let rightClass = $1.featuredClass ?? 99
        if leftClass != rightClass { return leftClass < rightClass }
        return ($0.rating ?? 0) > ($1.rating ?? 0)
    }
}
```

Hemskärmens sortering: primärt stigande `featuredClass` (saknad klass = 99, hamnar sist), sekundärt fallande `rating` (saknad = 0).

```swift
func uniqued() -> [Restaurant] {
    var seen = Set<String>()
    return filter { seen.insert($0.id).inserted }
}
```

Deduplicering på `id`, FÖRSTA förekomsten vinner, ordningen bevaras.

### 5.12 RestaurantAvailability.swift (öppet/stängt-logik)

Enum `RestaurantAvailability` med konstanter:

```swift
weekdayKeys  = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
weekdayShort = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"]
```

Index 0 = söndag (matchar Calendar `weekday - 1`).

**statusLabel(for:now:) -> String?** (badge-texten på restaurangkort), prioritetsordning:
1. `comingSoon == true`: returnera `"Kommer snart"`.
2. `pausedUntil` satt, parsebar som ISO8601 (först MED fraktionssekunder, sedan utan, se `ISO8601DateFormatter.parseFlexible`) OCH i framtiden: returnera `"Pausad · HH:mm"` där tiden formatteras med `DateFormatter`, locale `sv_SE`, format `"HH:mm"`. OBS separatorn är mellanslag + `·` + mellanslag.
3. `isOpen == false`: returnera `nextOpenLabel(...)`, eller `"Stängt"` om ingen kommande öppning hittas.
4. Annars `nil` (öppen, ingen badge).

**isDimmed(_:)**: `comingSoon == true || isOpen == false` (kortet tonas ned).
**isAccessible(_:)**: `comingSoon != true` (kommer snart går inte att öppna alls).
**isOrderingEnabled(_:)**: `comingSoon != true && isOpen != false` (nil `isOpen` tolkas som öppen).

**nextOpenLabel(openingHours:now:) -> String?**:
1. `nil` om openingHours saknas.
2. `todayIndex = Calendar.current.weekday(now) - 1`, `nowMinutes = timme * 60 + minut`.
3. Loopa `offset` 0..6: `dayIndex = (todayIndex + offset) % 7`, slå upp `openingHours.days[weekdayKeys[dayIndex]]`, hoppa över om dagen saknas eller `closed == true`.
4. Dagens slots filtreras på att `open` innehåller `":"`, sorteras stigande på minuter (`minutes(from:)`: split på `":"`, `timme * 60 + minut`, saknad timme ger Int.max, saknad minut ger 0).
5. Första slot som gäller:
   - `offset == 0` och `openMinutes <= nowMinutes`: hoppa över (redan passerad idag).
   - `offset == 0`: returnera `"Öppnar \(slot.open)"` (t.ex. "Öppnar 11:00").
   - `offset == 1`: returnera `"Öppnar imorgon \(slot.open)"`.
   - Annars: returnera `"Öppnar \(weekdayShort[dayIndex]) \(slot.open)"` (t.ex. "Öppnar mån 11:00").
6. Ingen träff på 7 dagar: `nil` (anroparen visar "Stängt").

Eftersom `RestaurantOpeningHours`-decodern redan slagit ihop `regular`-formen med den platta formen behöver logiken bara läsa `days[nyckel]`, det är Swift-motsvarigheten till `oh.regular?.[k] ?? oh[k]`.

**ISO8601DateFormatter.parseFlexible(_:)** (privat extension): försök `[.withInternetDateTime, .withFractionalSeconds]` först, fallback `[.withInternetDateTime]`, annars nil.
## 6. Navigationsstruktur och HomeView (rotvyn)

HomeView (`Features/Home/HomeView.swift`) är appens rotvy. Den består av en `NavigationStack` (path: `[String]` med restaurang-slugs) som omsluter en `TabView` med fyra tabbar. Bakgrunden är `DeliveraTheme.appBackground`: en LinearGradient topLeading till bottomTrailing med tre stopp `#FCFAF2`, `#F5FAF5`, `#FCF5ED` som ignorerar safe area.

### 6.1 Färgpalett (referens, konverterad till hex)

| Namn | Swift | Hex |
|---|---|---|
| orange | Color(0.94, 0.31, 0.10) | #F04F1A |
| ink | Color(0.06, 0.06, 0.07) | #0F0F12 |
| muted | Color(0.43, 0.42, 0.40) | #6E6B66 |
| line | svart med 6.5% opacitet | rgba(0,0,0,0.065) |
| gold | Color(0.94, 0.73, 0.36) | #F0BA5C |
| dealBlue | Color(0.07, 0.53, 0.96) | #1287F5 |
| dealBlueDeep | Color(0.04, 0.33, 0.85) | #0A54D9 |
| dealBlueInk | Color(0.03, 0.24, 0.46) | #083D75 |
| dealBlueChip | Color(0.88, 0.95, 1.0) | #E0F2FF |

`dealBlueGradient` = LinearGradient dealBlue till dealBlueDeep, topLeading till bottomTrailing. `cardShadow()` = shadow svart 7.5% opacitet, radius 18, x 0, y 10.

Pulse-teman (`PulseThemes.gradient`, topLeading till bottomTrailing) och deras chip-textfärg (`chipInk`):

| Tema | Gradient | chipInk |
|---|---|---|
| ember | #F0611F till #B8291A | #8C210F |
| forest | #21945C till #0D5C3D | #0A4D30 |
| midnight | #292E4D till #0D0F24 | #141733 |
| gold | #DEA129 till #9E660D | #784D08 |
| default ("sky") | #1287F5 till #0A54D9 | #083D75 |

### 6.2 Tab-struktur

`TabView(selection: $selectedTab)` med `.tint(DeliveraTheme.orange)` (#F04F1A). Enum `HomeTab` i exakt ordning:

| Ordning | Case | Label (exakt) | SF Symbol | Innehåll |
|---|---|---|---|---|
| 1 | home | "Hem" | house.fill | homeContent (scrollflödet) |
| 2 | cart | "Varukorg" | bag.fill | CartView, badge = antal varor som text när `cartStore.count > 0`, annars ingen badge |
| 3 | rewards | "Belöningar" | gift.fill | RewardsView |
| 4 | profile | "Profil" | person.fill | ProfileView |

Tab-baren döljs (`.toolbar(.hidden, for: .tabBar)`) exakt när: `selectedTab == .home && activeHomeOrder != nil && isTrackingExpanded` (tracking-takeover i fullskärm). `.navigationBarHidden(true)` överallt. `.ignoresSafeArea(.keyboard, edges: .bottom)` på hela ZStack:en.

`navigationDestination(for: String.self)`: slugen slås upp mot `model.restaurants` (först på slug, sedan på id), fallback `Restaurant.placeholder(slug:)`. Öppnar RestaurantDetailView med orderMode, deliveryCoordinate, activeAddress, cartStore, isFavorite, autoOpenProductId (= pendingFavoriteProductId om slug/id matchar), onOpenCart (byter till varukorgs-tab + tömmer path), onToggleFavorite.

### 6.3 @AppStorage-nycklar som HomeView äger

| Nyckel | Default | Beteende |
|---|---|---|
| `delivera.deliveryAddress` | "Malmö, Sweden" | Leveransadress, sätts av adress-sheeten |
| `delivera.deliveryCityName` | "Malmö" | Stadsfilter i delivery-läge |
| `delivera.pickupCityName` | "Malmö" | Stadsfilter i pickup-läge. När orderMode byts till pickup kopieras deliveryCityName hit (om icke-tom) |
| `delivera.deliveryLatitude` / `delivera.deliveryLongitude` | 0.0 / 0.0 | Koordinat. `deliveryCoordinate` är nil när båda är 0 |
| `delivera.recentDeliveryAddresses` | `"[\"Malmö, Sweden\"]"` | JSON-strängarray, senaste adresser |
| `delivera.favoriteRestaurantIDs` | `"[]"` | JSON-strängarray med restaurang-id:n. Toggle lägger till/tar bort id |
| `delivera.zoneRestaurants` | `"{}"` | JSON-dictionary `[String: ZoneRestaurant]` nycklad på BÅDE id och slug. Cache för zon-svar |
| `delivera.cart.guestPhone` | "" | Gästens telefonnummer (delas med kassan) |
| `delivera.activeOrderId` | "" | Aktiv orders id |
| `delivera.activeOrderPhone` | "" | Telefonbevis för tracking |
| `delivera.activeOrderToken` | "" | Access-token-bevis för tracking |
| `delivera.activeOrderTerminalAt` | 0.0 | Unix-tid när ordern blev terminal (för 15 min-retention) |
| `delivera.activeUserDealId` | "" | AKTIV DEAL: UserDeal-id som kassan skickar på ordern |
| `delivera.activeUserDealSnapshot` | "" | AKTIV DEAL: JSON-enkodad HomeAppDeal (se 8.2) |
| `delivera.skippedReviewOrderIds` | `"[]"` | JSON-strängarray med order-id vars review-prompt skippats |
| `delivera.hasSeenOnboarding` | false | Onboarding visad en gång |

Auth-token läses via `@AuthToken` (Keychain, inte UserDefaults).

### 6.4 Onboarding-villkoret

I `.onAppear`: om `!hasSeenOnboarding` sätts `showOnboarding = true`. Visas som `.fullScreenCover`. OnboardingViews `onDone`-callback: sätter `hasSeenOnboarding = true`, `showOnboarding = false` och kör `model.load(authToken:)` om (om man loggade in i onboardingen ska hemmet laddas om med kontot).

### 6.5 Aktiv-deal-kontraktet

`activateDealInCart(deal)` är den enda skrivaren i HomeView:
1. Kräver `deal.userDealId` icke-tomt, annars no-op.
2. `activeUserDealId = userDealId`.
3. `activeUserDealSnapshot` = `JSONEncoder().encode(deal)` som UTF-8-sträng (hela HomeAppDeal-objektet, fältlista i 8.2).
4. Om dealen har `restaurant`: pusha `restaurant.slug` på restaurantPath (om inte redan överst).

Sätts från: (a) DealCard-tap med `.use`/efter lyckad claim, (b) claim från sponsorkort av typen DEAL (`claimSponsorDeal`), (c) "Din favorit"-flödet (`openFavorite`, bygger en syntetisk snapshot med id `"favorite:<productId>"`, subtitle "Rabatten gäller din favorit", badge "Din favorit", ctaLabel "Aktiv", placement "HOME_TOP", audience "LOGGED_IN", template "DEAL_HERO", size "LARGE", discountType "FIXED", checkoutApplicable true, minOrderKr 0). Sätts även av profilens "Mina deals" och vänkod i kassan (utanför denna fil, samma kontrakt).

NOLLAS av HomeView i exakt ett fall: i CartViews `onPaymentCompleted`-callback (efter betald order) sätts `activeUserDealId = ""` och `activeUserDealSnapshot = ""`.

### 6.6 Aktiv order (delivera.activeOrder*)

`onPaymentCompleted(order)` gör: `activeHomeOrder = order`, `activeOrderId = order.id`, `activeOrderPhone = (order.customerPhone ?? guestPhone).trimmad`, `activeOrderToken = order.accessToken ?? ""`, `activeOrderTerminalAt = 0`, nollar aktiv deal, `isTrackingExpanded = true`, `selectedTab = .home`, startar LiveActivity, för pickup hämtas nuvarande GPS-plats till kundmarkören. Om intjänade Dpoints > 0 visas MissionCelebration-overlayen med title "Poäng intjänade" och subtitle "Dina Dpoints läggs till när ordern är klar." (overlay: ring-graf 164x164 linewidth 18, räknar upp poängen i ~36 steg om 0.026 s, auto-stänger efter 3.2 s, knapp "Fortsätt" vit text på ink i Capsule höjd 54, kort maxbredd 338, hörnradie 34, ultraThinMaterial).

Polling (`pollActiveHomeOrderFromDatabase`, `.task(id: activeHomeOrder?.id)`): loop som anropar `GET`-motsvarigheten `customerOrder(id:phone:token:authToken:)`. Bevis-prioritet för telefon: orderns customerPhone, annars guestPhone, annars sparad activeOrderPhone. Kräver minst ett av telefon/token/bearer, annars avbryts. Intervall: 5 s normalt, 20 s när ordern är terminal, vid fel `min(30, felstreak*6)` s. `terminalPollStreak` ökas per terminal poll, nollas annars. När ordern BLIR terminal sätts `activeOrderTerminalAt = nu`. Retention: terminal order äldre än 15 minuter rensas helt (`clearActiveOrderState`) och LiveActivity avslutas. 404 = ordern borta, rensa allt. Felmeddelanden: 404 "Beställningen hittades inte.", >=500 "Serverfel. Vi försöker igen strax.", URLError "Dålig anslutning. Vi försöker igen.", övrigt "Kunde inte uppdatera spårningen. Vi försöker igen." Visas som NoticeBanner med prefix "Trackingfel: ".

Restore vid appstart (`restoreActiveOrderIfNeeded`): om activeHomeOrder == nil och activeOrderId icke-tom, hämta ordern med samma bevis, tillämpa retention, sätt `isTrackingExpanded = false` (bannern visas kollapsad).

Self-delivery-autocomplettering: delivery + selfDelivery + status delivering + etaEndsAt passerad ger automatiskt `PATCH status: "DELIVERED"` (en gång per order-id).

### 6.7 Review-prompt

`shouldShowReviewPrompt(order)` = `order.canPromptForReview && terminalPollStreak >= 2 && !skippedReviewOrderIDs.contains(order.id)`. canPromptForReview = terminal och ej redan recenserad (rating != nil eller reviewedAt satt). Kravet på två terminala pollar i rad hindrar att prompten blinkar fram vid server-studs. "Skippa" lägger order-id i `delivera.skippedReviewOrderIds`. Review-sheeten (ActiveOrderReviewSheet, detents height 430/medium): rubrik "Betygsätt ordern" (27 pt black rounded), 5 stjärnknappar (30 pt, statusfärg), TextField-placeholder "Skriv något kort, valfritt" (3 rader reserverade), knappar "Skippa" och "Skicka" (52 höga, hörnradie 18; skickar-läge "Skickar" med vit ProgressView). Svar: `"+\(points) Dpoints lades till."` om poäng > 0, annars "Tack för din recension."

### 6.8 Sheets och dialoger (villkor)

| Presentation | Trigger | Detents |
|---|---|---|
| fullScreenCover OnboardingView | `showOnboarding` (första start) | fullskärm |
| sheet AddressSheetView | tap på adressraden | .height(590), .large + dragindikator |
| sheet FavoritesSheetView | tap på hjärtknappen i headern | .medium, .large + dragindikator |
| sheet ProductQuickView (cartProductSheet) | redigera/lägg till vara från kassan | .fraction(0.92), .large |
| sheet ActiveOrderSheetView | knappar i tracking (info/kvitto/kontakt) | receipt: .medium/.large, annars .height(430)/.medium |
| sheet ActiveOrderReviewSheet | reviewOrder sätts | .height(430), .medium |
| sheet FavoriteOfferSheet | pulse-modul FAVORITE tappas | item-baserad |
| confirmationDialog | deal-tap utloggad | titel "Logga in för att hämta dealen" (synlig), knappar "Logga in eller skapa konto" (byter till profil-tab) och "Inte nu" (cancel), meddelande "Dina deals sparas på ditt konto så de följer med i kassan." |

### 6.9 Laddningsordning i HomeViewModel

`load(authToken:)` sätter `isLoading = true` och kör SJU anrop PARALLELLT (async let):
1. `GET /api/restaurants` (med cache-bust `_t`)
2. `GET /api/sponsors`
3. `GET /api/deals/app?placement=HOME_TOP&limit=8&loggedIn=0|1&_t=...` (Bearer-header om inloggad)
4. `GET /api/home/pulse?_t=...` (Bearer om inloggad)
5. `GET /api/ads` (tracking-annonser)
6. `GET /api/home-categories` (sektioner)
7. `GET /api/cities`

Efterbehandling: restauranger `sortedForHome()` (featuredClass stigande, nil = 99, sedan rating fallande); sponsorer filtreras `isActive != false`; pulse ger `modules` + `greeting`; ads filtreras aktiva och sorteras på `sortOrder`; sektioner och städer filtreras `isActive`. Fel visas ENDAST om restauranglistan är tom OCH restaurang-anropet misslyckades: "Kunde inte hämta data. Kontrollera att API:t kör på samma Wi-Fi." Enskilda misslyckade anrop ignoreras i övrigt (gamla datan står kvar).

HomeViews `.task` vid start: (1) läs zonRestaurants ur AppStorage, (2) `await model.load`, (3) `await refreshZoneRestaurants()`, (4) `await loadDpointsEarnRate()` (först `GET /api/settings` fält `dpoints.perKr`, fallback `dpointsRewardProducts().earnRate`, default 0.1), (5) `await restoreActiveOrderIfNeeded()`, (6) `triggerHomeEntrance()`.

Omladdningar: pull-to-refresh (`.refreshable`: model.load + refreshZoneRestaurants), när restaurantPath töms (retur från restaurang; nollar även pendingFavoriteProductId), när scenePhase blir .active. Zoner laddas om via `.task(id: "\(orderMode)-\(lat)-\(lng)")`.

`refreshZoneRestaurants()`: bara i delivery-läge (pickup nollar dictionaryn). Utan koordinat används AppStorage-cachen. Med koordinat: `POST /api/cities/validate-location {lat,lng}`, svaret plattas till dictionary nycklad på både restaurangens id och slug, persisteras till `delivera.zoneRestaurants`. Efteråt körs alltid `syncCartFulfillment()` som uppdaterar varukorgens leveransavgift: `matchedZone.feeKr` i första hand, annars `deliveryFee/100`, annars restaurangens `deliveryFee`, annars 0.

### 6.10 Entrance-animationer

`homeEntranceSeed` (Int) ökas av `triggerHomeEntrance()` vid: task-start, betald order, expandering/kollaps av tracking, byte till hem-tabben. Modifiern `homeEntrance(seed:direction:delay:)` animerar opacity 0 till 1 och offset-x från `direction * 54` till 0 med `.spring(response: 0.54, dampingFraction: 0.86)` efter angiven delay. direction är +1 eller -1 (alternerande håll).

## 7. Hemskärmens sektioner i exakt ordning

`homeContent` är en VStack(spacing: 0). Om `activeHomeOrder != nil && isTrackingExpanded` ersätts ALLT av tracking-takeovern (karta i fullskärm). Annars:

### 7.0 Header (fast, ovanför scrollen)

`HomeHeader`, padding horisontellt 20, top 8, bottom 14, bakgrund `.ultraThinMaterial`, entrance direction -1 delay 0. Innehåll uppifrån (VStack spacing 14):
1. **Greeting** (om servern skickat en, från /api/home/pulse): 15 pt black rounded, ink. Ingen hårdkodad copy.
2. **Adressrad**: knapp med location.fill (17 pt bold, orange) i cirkel 42x42 med orange 12% bakgrund; etikett "DELIVER TO" (delivery) eller "PICKUP IN" (pickup), 10 pt bold, muted; adressen under i 15 pt black rounded ink, lineLimit 1, minimumScaleFactor 0.76, följt av chevron.down 12 pt. Tap öppnar adress-sheeten. Till höger: hjärtknapp (IconButton 42x42, vit cirkel 94% + cardShadow, "heart.fill" orange om favoriter > 0 annars "heart" ink, badge-kapsel orange med antal, "99+" över 99, offset x 3 y -4).
3. **Sökfält**: magnifyingglass 14 pt semibold secondary + TextField med placeholder exakt "Sök restaurang, sushi, pizza..." (14 pt semibold, ingen autokorrigering/versalisering), rensa-knapp xmark.circle.fill när text finns. Höjd 40, horisontell padding 13, vit bakgrund, hörnradie 13, 1 pt line-kant. Sökningen filtrerar restauranglistan live (namn, cuisine, taggar, case-insensitive) men döljer inga andra sektioner.

### 7.1 Scrollflödet

`ScrollView` utan indikatorer, `LazyVStack(alignment: .leading, spacing: 22)`, padding horisontellt 20, top 18, bottom 112. Ordning uppifrån och ner:

1. **Felbanner** (om `model.errorMessage`): NoticeBanner, ikon wifi.exclamationmark, 13 pt bold orange text, orange 9% bakgrund, hörnradie 14, padding 14/12.
2. **Trackingfel-banner** (om ingen aktiv order men `activeOrderTrackingError` finns): NoticeBanner med text "Trackingfel: \(fel)".
3. **LiveActivityOrderBanner** (om `activeHomeOrder != nil`): aktivt-order-kort. Vit bakgrund hörnradie 26 med blurrad statusfärgad cirkel-glow uppe till vänster (150x150, blur 18, offset -60/-86), 1 pt kant i statusfärg 16%, padding 14, dubbel skugga (svart 10% r14 y8 + svart 6% r12 y6). Vänster: cirkel 58x58 statusfärg 13% fyllning + 18% ring med lägessymbol (delivery: "bicycle", selfDelivery: "car.side.fill", pickup: "bag.fill") 20 pt black. Eyebrow "PÅGÅENDE ORDER" (delivery) eller "AVHÄMTNING" (pickup) 10 pt black uppercase i statusfärg + ordernummer `#<nr>` 10 pt muted. Restaurangnamn 20 pt black rounded. Statuspill (statusfärg-kapsel, vit text 12 pt black, höjd 25) + tid "X min kvar" eller terminal-text. Höger: chevron.right 15 pt vit i ink-cirkel 42x42. Under: HomeOrderMiniProgress (kapsel 13 hög, svart 7% botten, statusfärgad fyllning min 18 bred, vit knopp 13x13 med 4 pt statusfärgad ring; animation spring 0.58/0.82). Om terminal + reviewMessage: meddelandet i 12 pt black orange. Om review-prompt: knappar "Recensera +Dpoints" (star.fill, vit på statusfärg, höjd 36) och "Skippa" (muted på ink 6%, höjd 36). Tap på kortet expanderar tracking med spring 0.62/0.78. Transition: insättning move-from-top+opacity, borttagning scale 0.94+opacity. Entrance direction 1, delay 0.03.

   Statusfärger (HomeTrackingStatus): pending #FABD1F, accepted #FF8F1F, preparing orange #F04F1A, delivering #FA5717, delivered #12A854 (pickup i delivering-läge visas också grön #12A854). Statustitlar: pending "Väntar på godkännande", accepted/preparing "Tillagas", delivering "På väg" (pickup: "Redo att hämtas"), delivered "Levererad" (pickup: "Redo att hämtas"). Korta titlar (progress-etiketter): "Väntar", "Tillagas", "På väg"/"Redo", "Levererad"/"Redo". Progress: pending 0, preparing 0.34 (pickup 0.5), delivering 0.67 (pickup 1.0), delivered 1.0. Steg: delivery [pending, preparing, delivering, delivered], pickup [pending, preparing, delivering].

4. **SponsorRail "Aktuellt"** (karusellen, se 8.3). Entrance direction 1, delay 0.04. Items = `carouselItems`, en blandning byggd så här: (a) alla sponsorkort i ordning, (b) "extras" i ordning: CHAMPION-pulsmodulen som kort, de max 7 första app-dealsen, ETT "Trendar"-highlightkort (första TRENDING-restaurangen som inte redan visats), ETT "Ny i stan"-highlightkort (samma dedupe via usedRestaurantIds). Mixning: sponsor, extra, sponsor, extra... resterande extras läggs sist. Samma restaurang marknadsförs aldrig två gånger i karusellen.
5. **Pulse-hero-moduler**: `pulseModules.filter { isHero && type != "CHAMPION" }` där isHero = typ i [CHAMPION, COMEBACK, STREAK, POINTS_NUDGE, OCCASION, WEATHER, FAVORITE]. Renderas via PulseModuleView (server-styrd copy). Entrance alternerar riktning per index, delay 0.07 + index*0.02.
6. **CuisineChips**: horisontell rad av kapselknappar. Källa: "Alla" + upp till 8 unika cuisine-tokens ur restaurangerna (split på ",", "/", "&", " och ", kapitaliserade, sorterade). Vald chip: vit text på orange; övriga: ink på vitt med line-kant. 13 pt black, horisontell padding 14, höjd 38. Entrance direction -1, delay 0.08.
7. **Kategorisektioner (max de 3 första)**: för varje `HomeCategorySection` (från /api/home-categories, endast aktiva) renderas en RestaurantRail om resultatet är icke-tomt: SectionHeader med `section.title` och `section.subtitle ?? "Utvalt nära dig"`, horisontell rad av RestaurantCard med bredd 260. Restaurangurval per sektion: manuella id:n (läge "MANUAL" = enbart dessa, annars manuella först + resten), sedan filter i ordning searchTerm (namn/cuisine/taggar), cuisines, featuredClasses, maxEtaMinutes (default-eta 30 vid nil), freeDeliveryOnly (avgift <= 0), openNowOnly (isOpen != false), sedan stadsfilter, dedupe, sortedForHome, `prefix(section.maxRestaurants)`. Kortens entrance: offset direction * (96 + index*10), stagger 0.045 s per kort, spring 0.58/0.84. Direction: första sektionen +1, övriga -1.
   Efter VARJE sektion interfolieras en pulse-räls: `pulseRailModules[index]` där pulseRailModules = icke-hero-moduler exklusive TRENDING och NEW_RESTAURANTS (de bor i karusellen). Rälsarna har medvetet INGEN entrance-animation (blinkade i LazyVStack vid seed-byte).
8. **Kvarvarande pulse-rälsar**: rälsar som inte fick plats mellan de max 3 sektionerna renderas efteråt i ordning.
9. **RestaurantList "Alla restauranger"**: rubrik = "Alla restauranger" när vald cuisine är "Alla", annars cuisinenamnet. Undertitel = `"\(antal) restauranger"`. Vertikala fullbredds-RestaurantCard (width nil, bildhöjd 178). Källa `visibleRestaurants` = filtrering på vald cuisine + sökfråga + aktiv stad (`deliveryCityName` i delivery, `pickupCityName` i pickup; matchning är dubbelriktad substring, restauranger utan stad passerar alltid), sorterad med sortedForHome. Entrance direction -1, offset 72 + min(index,4)*10, stagger 0.035 s (max 8), spring 0.56/0.86.

Leveranszons-datat (`delivera.zoneRestaurants`) döljer INTE restauranger: det överstyr visad leveransavgift och ETA per kort (och varukorgens avgift) när orderMode är delivery. I pickup-läge skickas tom dictionary till korten.

Skeletons: SponsorRail visar ett redactat placeholder-kort (vit 90%, line-kant) när `loading && items.isEmpty`. TrackingAdsRail (rubrik "Annonser", undertitel "Aktuellt i Delivera") har 2 redactade kort 330x138, men den ingår inte i hemflödet (annonserna visas i tracking-bottensheeten, max 5, kort 236x104 hörnradie 20).

Tomtillstånd i favorit-sheeten: rubrik "Favoriter" 32 pt black rounded, undertitel "Dina sparade restauranger visas här." (tom) eller `"\(antal) sparade restauranger"`, tom-vy med heart-ikon i vit cirkel 74x74, "Inga favoriter ännu" 22 pt black rounded och "Tryck på hjärtat på en restaurang så hamnar den här." 13 pt bold muted.

## 8. Komponenter: RestaurantCard, DealsRail, SponsorCard

### 8.1 RestaurantCard (`Features/Home/RestaurantCard.swift`)

Används i två lägen: räls (width 260, bildhöjd 142) och lista (width nil = fullbredd, bildhöjd 178). Hela kortet är en knapp; tap blockeras om `RestaurantAvailability.isAccessible == false` (dvs `comingSoon == true`; knappen är också `.disabled` då). Vit bakgrund, hörnradie 20, 1 pt line-kant, cardShadow.

**Bilddel**: RemoteImage (heroImageUrl, fallback imageUrl) aspect-fill, klippt till hörnradie 18; utan bild vit rundad rektangel. Om dimmad (`comingSoon == true || isOpen == false`): vit overlay 34% med blendMode .screen, plus på hela kortet opacity 0.68, saturation 0.42, grayscale 0.18.

**Badges** (uppe till vänster i bilden, padding 12, max 2 synliga + status): om statusetikett finns visas ENDAST den: "Kommer snart" (symbol sparkles), "Pausad · HH:mm" (moon.fill), "Öppnar HH:mm" / "Öppnar imorgon HH:mm" / "Öppnar <mån/tis/ons/tor/fre/lör/sön> HH:mm", eller "Stängt" (allt på svart 78% kapsel). Annars i ordning: tier-badge "Utvald" med crown.fill (featuredClass <= 1: guldbrun #B88014; featuredClass == 2: silver #858A94), rabattbadge "-\(pct)%" (om `dealCoversAll == true`) eller "upp till -\(pct)%" (orange kapsel, tag.fill), samt "Fri leverans" (ink-kapsel, om avgift <= 0) eller "Avhämtning" (pickup-läge). Badge-typografi: text 10.5 pt black vit, symbol 8.5 pt, padding 8/4.5, kapsel.

**Favorit-hjärta** (uppe till höger, padding 12): "heart.fill" om restaurangens id finns i `delivera.favoriteRestaurantIDs`, annars "heart"; 14 pt bold orange, i vit 94%-cirkel 34x34. Toggle skriver om AppStorage-arrayen.

**Textdel** (padding 14, spacing 8): namn 17 pt black rounded ink (1 rad), under det cuisine kapitaliserad, fallback description, fallback "Restaurang" (12 pt semibold muted, 1 rad). Till höger RatingBadge: star.fill 11 pt guld + värde med en decimal (`rating ?? 4.7`) 12 pt black vit, i ink-kapsel höjd 26. Metrics-rad (spacing 9, ink 66% opacitet, symbol 10 pt bold + text 12 pt bold): clock.fill "\(eta) min" (zon-eta i första hand: `matchedZone.etaMinutes`, sedan `zoneRestaurant.etaMinutes`, sedan `restaurant.etaMinutes`, default 30), lägessymbol (delivery "bolt.car.fill", pickup "figure.walk") + avgiftstext ("0 kr" i pickup; annars "Gratis" om <= 0, annars "\(Int(avgift)) kr"; zon-avgift `matchedZone.feeKr` i första hand, sedan `deliveryFee/100` från zonen, sedan restaurangens deliveryFee), samt mappin.circle.fill + stad om den finns.

### 8.2 DealsRail och DealCard (`Features/Home/DealsRail.swift`)

DealsRail: rubrik "Dina erbjudanden", undertitel "Utvalda för dig just nu". En enda deal = fullbredds-DealCard; flera = horisontell scroll (spacing 12, `scrollClipDisabled`). Renderar ENBART server-data från `GET /api/deals/app`, ingen hårdkodad copy. (Obs: i nuvarande hemskärm visas dealsen i Aktuellt-karusellen via SponsorRail; DealCard är samma komponent i båda.)

DealCard: bredd 300 (eller fullbredd), höjd 176 (i karusellen: karusellens kortHöjd), padding 16, hörnradie 22, bakgrund `PulseThemes.gradient(deal.theme)` (default = dealBlue-gradienten #1287F5 till #0A54D9). Innehåll:
- Badge (om `deal.badge`): VERSALISERAD, 10 pt black, färg `chipInk(theme)`, vit 92%-kapsel höjd 22.
- Titel: 19 pt black rounded vit, max 2 rader, minimumScaleFactor 0.8.
- Subtitle (om finns): 12 pt semibold vit 85%, max 2 rader.
- Värde-pill uppe till höger (härledd ur serverfält, i prioritetsordning): mission med rewardPoints > 0: `"+\(rewardPoints) Dpoints"`; `freeDelivery`: "Fri leverans"; `discountPercent > 0`: `"\(percent)% rabatt"`; `amountKr > 0`: `"\(amount) kr rabatt"`; `dpointsBonus > 0`: `"+\(bonus) Dpoints"`; annars badge-texten. 13 pt black rounded chipInk på vit kapsel höjd 30.
- Mission-progressbar (endast mission + claimad): vit kapsel 7 hög på vit 25%, fyllnad min 8 pt bred, andel = count/target. Text under: "Uppdraget klart, poängen är dina" (klart), `"\(remaining) kvar inom \(windowDays) dagar"` (windowDays > 0), annars `"\(remaining) beställningar kvar"`. 11 pt bold vit 85%.
- Botten: restaurang-chip (storefront-symbol 11 pt + namn 12 pt bold, vit 90%) om `deal.restaurant` finns, och CTA-kapseln till höger (vit, höjd 36, horisontell padding 14, text 13 pt black chipInk; spinner vid claiming; checkmark.circle.fill vid aktiv).
- CTA-text: mission klar "Klart!", mission claimad `"\(count) av \(target)"`, mission ej claimad `ctaLabel ?? "Starta uppdraget"`; aktiv i kassan "Vald i kassan"; claimad "Använd"; annars `ctaLabel ?? (claimRequired ? "Hämta" : "Beställ")`.
- Aktiv-markering: vit cirkel 26x26 med checkmark uppe till höger (offset -12/12). "Aktiv" = `deal.userDealId == delivera.activeUserDealId` (icke-tom). Animationer: spring 0.32/0.85 på isActive och userDealId.
- Disabled när claiming pågår eller mission redan claimad.

Tap-logik: utloggad ger `.loginRequired` (varnings-haptik + login-dialogen i 6.8); claimad icke-mission ger `.use` (aktivera direkt i kassan); ej claimad ger `.claim`.

Claim-flödet (`claimDeal` i HomeView): `POST /api/deals/app/:id/claim` med Bearer-token (en claim åt gången via `claimingDealId`). Svar `{claimed, deal, userDeal}`. Vid `claimed == false` med deal i svaret (t.ex. cooldown) ersätts kortet i feeden (`model.replaceDeal`). Vid lyckat: success-haptik; MISSION: kortet uppdateras och står kvar (servern spårar, belönar efter betald order); vanlig deal: kortet tas bort från hemskärmen (`model.removeDeal`, bor nu i kassan + Mina deals) och `activateDealInCart` körs (sätter AppStorage-kontraktet + navigerar till dealens restaurang). Claim från sponsorkort (`claimSponsorDeal`) är samma men aktiverar bara i kassan om dealen INTE är mission, och laddar sedan om hela hemmet.

Snapshot-JSON:en (`delivera.activeUserDealSnapshot`) är HomeAppDeal Codable-enkodad, exakta fält: `id` (String), `title` (String), `subtitle` (String?), `badge` (String?), `imageUrl` (String?), `ctaLabel` (String?), `placement` (String), `audience` (String), `template` (String), `size` (String), `claimRequired` (Bool), `dpointsBonus` (Int?), `missionType` (String?), `missionProgress` ({target, count, remaining, completed, windowDays, rewardPoints, claimed}?), `checkoutApplicable` (Bool?), `discountType` (String?), `discountPercent` (Int?), `amountKr` (Int?), `freeDelivery` (Bool), `minOrderKr` (Int), `restaurant` ({id, name, slug, imageUrl?, cuisine?}?), `userDealId` (String?), `theme` (String?).

### 8.3 SponsorRail och SponsorCard (`Features/Home/SponsorCard.swift`)

SponsorRail = "Aktuellt"-karusellen. SectionHeader: titel "Aktuellt" (22 pt black rounded ink), undertitel "Partners, deals och veckans favorit" (13 pt semibold muted). Visas när `loading || !items.isEmpty`.

**BREDD-STRATEGIN (kritisk, Wolt-stil)**: exakt ETT kort i taget i den bredd föräldern ger. Implementerat med iOS 17-paging: `ScrollView(.horizontal)` + `LazyHStack(spacing: 0)` där varje sida får `.containerRelativeFrame(.horizontal)` + `.scrollTargetLayout()`, `.scrollTargetBehavior(.paging)`, `.scrollPosition(id: $currentID)`. Sätt ALDRIG hårdkodad eller uppmätt kortbredd; bara HÖJDEN sätts. Korthöjd: `min(max((skärmbredd - 40) / 2.0, 168), 184)` pt (nära halva slotbredden, klämd 168 till 184; deklarerad aspect-konstant 1.78 och hörnradie 14).

Auto-swipe: Timer var 0.5 s; när `isPlaying` och fler än 1 kort ackumuleras tid, vid 4.5 s avanceras till nästa med `easeInOut(duration: 0.45)`. Varvning (sista till första) hoppar UTAN animation (annars scrollar den baklänges genom hela raden). Byte av kort nollar klockan. Kontrollrad (höjd 40, endast vid > 1 kort och ej loading): centrerade prick-knappar (kapsel 8 hög; aktiv 22 bred i ink, inaktiva 8 breda i ink 16%; tap animerar dit easeInOut 0.28; layoutanimation spring 0.4/0.85) och en play/paus-knapp fäst till höger (pause.fill/play.fill 15 pt black, ink 70%, cirkel 40x40 med bakgrund #F5F0E8; accessibilityLabel "Pausa"/"Spela").

Sidtyper (HomeCarouselItem): `.sponsor` (SponsorCard), `.deal` (DealCard fullbredd med karusellhöjd), `.champion` (ChampionCard för pulse-modulen), `.highlight` (RestaurantHighlightCard med badge "Trendar" eller "Ny i stan": hjältebild + gradient, badge VERSALISERAD 10 pt black kerning 0.6 på orange kapsel höjd 23, namn 23 pt black rounded vit, cuisine 12 pt bold vit 88%, hörnradie 14).

**SponsorCard**: media (bild eller video) i aspect-fill klippt till hörnradie 14. Korttyper via `sponsor.cardType` (RESTAURANT | DEAL | AD | TEXT, default RESTAURANT):
- TEXT utan bild: bakgrund `PulseThemes.gradient(sponsor.color ?? "midnight")`.
- Media-bakgrundsplatta #F2F2F0.
- Text visas när `imageOnly != true`: mörk bottengradient (svart 2% / 8% / 62% top-till-botten), därover nere till vänster (padding leading 22, trailing 18, bottom 20): kategorietikett VERSALISERAD (första icke-tomma av category/tier, fallback "Aktuellt") 13 pt heavy vit 92%; namn 28 pt black rounded vit, 1 rad, minScale 0.72; tagline (om finns) 18 pt heavy rounded vit 94%, minScale 0.8.
- DEAL-kort: uppe till höger en kolumn med värde-pill (`dealInfo.valueLabel`, 13 pt black rounded ink på vit kapsel höjd 30) och nere en "Hämta"-knapp (14 pt black vit på orange kapsel höjd 38, horisontell padding 18) som anropar claim-flödet med `dealInfo.id`.
- AD-kort: "ANNONS"-badge uppe till höger (9 pt black, kerning 0.8, vit 92% på svart 45%-kapsel höjd 20). Annons märks alltid.
- Huvudpartner (tier innehåller "huvud", case-insensitive): guldkapsel uppe till vänster med crown.fill + "HUVUDPARTNER" (9 pt black, kerning 0.6, textfärg #784D08 på guld #F0BA5C) samt 2 pt guldram runt hela kortet.

Tap (hela kortet): `linkType` "RESTAURANT" pushar slug (linkTarget, fallback ctaLink); "EXTERNAL" öppnar ctaLink som URL; annars inget. Ingen impression-tracking finns i klienten.

**Video-stödet**: `sponsor.videoUrl` (trimmad, giltig URL med schema) ger LoopingVideoView: UIViewRepresentable vars backing-layer är AVPlayerLayer med `videoGravity = .resizeAspectFill`, AVPlayer alltid mutad, `actionAtItemEnd = .none`, loopas via AVPlayerItemDidPlayToEndTime (seek till noll + play). Spelar ENDAST när kortet är den aktiva sidan OCH karusellen spelar (`isActive && isPlaying`); pausas annars och rivs i dismantle. Ombyggnad endast när URL:en faktiskt ändras. Utan video: RemoteImage med `sponsor.imageUrl`.

Sponsor-modellens fält: id, name, imageUrl, videoUrl?, cardType?, dealId?, headline?, bodyText?, dealInfo? ({id, title, valueLabel?, minOrderKr?}), isActive?, isClickable?, linkType?, linkTarget?, ctaText?, ctaLink?, showName?, imageOnly?, category?, tier?, tagline?, color?.

## 9. OnboardingView

`Features/Home/OnboardingView.swift`. Fullskärm över appBackground. Tre värdesidor + en inloggningssida (totalt 4). Flat design med subtil 3D-tilt på korten.

**Toppen** (padding horisontellt 24, top 18): "Delivera" 22 pt black rounded ink till vänster; "Hoppa över" (13 pt black, muted) till höger, som kör onDone, döljs på sista sidan (inloggningen).

**Sidorna** (TabView `.page(indexDisplayMode: .never)`, sidanimation spring 0.45/0.85, horisontell padding 24 per kort). Exakt copy i ordning:

| # | SF Symbol | Titel | Text |
|---|---|---|---|
| 1 | storefront.fill | "Dina lokala favoriter" | "Riktiga restauranger nära dig, med sina riktiga menyer och priser." |
| 2 | d.square.fill | "Poäng på varje köp" | "Du samlar Dpoints när du beställer och betalar med dem när du vill." |
| 3 | person.2.fill | "Deals och vänner" | "Hämta erbjudanden på hemskärmen. Bjud in en vän i kassan, ni får båda rabatt." |
| 4 | (inloggning) | "Skaffa dina förmåner" | "Poäng, deals och uppdrag sparas på ditt nummer." |

**OnboardingCard-layout**: vit bakgrund hörnradie 28, 1 pt line-kant, cardShadow, padding 28, vertikal ytterpadding 28. Ikonen 34 pt black vit i orange rundad kvadrat 84x84 (hörnradie 26). Titel 32 pt black rounded ink; brödtext 16 pt semibold muted, lineSpacing 3. 3D-tilt: `rotation3DEffect` 5 grader (axel x 0.4, y 1, perspektiv 0.6) som fjädrar till 0 när sidan blir aktiv (spring 0.6/0.8; vid onAppear spring 0.7/0.8 delay 0.1). Inaktiva sidor har opacity 0.6.

**Under sidorna**: prick-indikator (kapslar 7 höga: aktiv 26 bred orange, övriga 7 breda svart 12%; animation spring 0.34/0.8) och en "Fortsätt"-knapp (17 pt black vit på ink, höjd 58, hörnradie 18) som stegar `page += 1`; knappen döljs på inloggningssidan. Bottom-padding 26.

**Inloggningssidan (OnboardingLoginCard)**, två steg:
- Steg "start": rubrik "Skaffa dina förmåner" (30 pt black rounded). Telefonrad: fast "+46"-ruta (15 pt black muted, höjd 52, svart 3.5% bakgrund, hörnradie 15) + TextField placeholder "70 123 45 67" (phonePad, 16 pt bold). Knapp "Fortsätt med telefon" (16 pt black vit på ORANGE, höjd 54, hörnradie 16, spinner vid laddning). Därunder SignInWithAppleButton (.continue, svart stil, höjd 54, hörnradie 16).
- Steg "code": rubrik "Ange koden", undertext `"Vi skickade en kod till \(nummer)."`. TextField placeholder "6-siffrig kod" (numberPad, 22 pt black monospaced, centrerad, höjd 56). Knapp "Verifiera" (samma stil som ovan; disabled tills koden har minst 4 tecken). Länk "Byt nummer" (13 pt black muted) som går tillbaka till start.
- Fel visas som Label med exclamationmark.circle.fill, 12 pt black orange. Valideringscopy: "Ange ett giltigt mobilnummer, t.ex. 070 000 00 00.", fel kod: "Fel kod. Testa igen.", generellt: "Kunde inte logga in. Testa igen." / "Kunde inte logga in med Apple.", Apple-token-fel: "Apple skickade ingen giltig inloggningstoken. Testa igen.", Apple utan telefon: "Nästan klart. Verifiera ditt nummer så kopplas kontot."
- Längst ner alltid: "Fortsätt som gäst" (14 pt black muted, centrerad) som kör onDone.

**Telefonnormalisering** (svenskt mobilnummer till E.164): 9 siffror som börjar på "7" ger "+46" + siffrorna; 10 siffror "07..." ger "+46" + utan nollan; 11 siffror "467..." ger "+" + siffrorna; annars ogiltigt.

**Auth-flödet** (samma kontrakt som profilen): (1) `POST <supabase>/auth/v1/otp` {phone, channel:"sms"} med anon-key; (2) `POST <supabase>/auth/v1/verify` {phone, token, type:"sms"} ger `access_token`; (3) `POST /api/auth/phone-token` med Supabase-token som Bearer ger app-token som sparas i `@AuthToken` (Keychain). Apple: `POST /api/auth/oauth-token` {provider:"apple", idToken, providerId, email?, name?}; om svaret indikerar `needsPhone` (user.needsPhone eller telefon saknas) sparas OAuth-token som pending, användaren tvingas verifiera nummer, och `POST /api/profile/link-phone` kopplar numret innan token aktiveras. Success ger haptik + onDone. Avbruten Apple-inloggning visar inget fel. Timeout 15 s per request.

**`delivera.hasSeenOnboarding` sätts INTE av OnboardingView själv** utan av HomeViews fullScreenCover-callback (onDone): `hasSeenOnboarding = true`, `showOnboarding = false`, sedan `model.load(authToken:)` så hemmet laddas om med kontot om man loggade in. Alla tre exitvägar (Hoppa över, Fortsätt som gäst, lyckad inloggning) går genom samma onDone.
## 10. Pulse-korten (PulseCards.swift)

Datakälla: `GET /api/home/pulse` (Authorization: Bearer-token om inloggad). Servern väljer moduler + veckans tema, klienten renderar bara. Platt design: gradient + vitt, spring-animationer, inga eviga pulser (undantag: countdown-timern i DAILY_DROP tickar).

### 10.1 Modellen HomePulseModule (exakta fältnamn)

```
type: string            // korttypen, se 10.3
id: string
theme: string?          // "sky" | "ember" | "forest" | "midnight" | "gold"
title: string           // admin-styrd copy, renderas ordagrant
subtitle: string?       // admin-styrd copy
restaurant: PulseRestaurant?        // CHAMPION, COMEBACK
products: [PulseProduct]?           // HOT_PRODUCTS
items: [PulseProduct]?              // NEW_MENU_ITEMS
restaurants: [PulseRailRestaurant]? // FASTEST_TODAY, TRENDING, NEW_RESTAURANTS
product: PulseNudgeProduct?         // POINTS_NUDGE
balance: Int?                       // POINTS_NUDGE
remainingPoints: Int?               // POINTS_NUDGE
endsAt: string?                     // DAILY_DROP, ISO8601 (med eller utan fraktionssekunder)
dropProduct: PulseProduct?          // DAILY_DROP, FAVORITE
progress: PulseStreakProgress?      // STREAK: { count, target, rewardPoints }
images: [string]?                   // CHAMPION: upp till 5 bilder som roterar
percent: Int?                       // FAVORITE: rabatt i procent
```

Undermodeller:

| Modell | Fält |
|---|---|
| PulseRestaurant | id, name, slug, cuisine?, imageUrl?, heroImageUrl?, rating? (Double) |
| PulseProduct | productId, name, priceKr (Double), imageUrl?, restaurant (PulseRestaurant) |
| PulseRailRestaurant | id, name, slug, cuisine?, imageUrl?, heroImageUrl?, rating?, avgMinutesToday? (Int), deliveredToday? (Int), growthPct? (Int) |
| PulseNudgeProduct | productId, name, imageUrl?, costPoints (Int), restaurant (PulseRestaurant) |
| PulseStreakProgress | count (Int), target (Int), rewardPoints (Int) |

### 10.2 Tema-rotationen (PulseThemes, matchar backendens THEME_POOL)

Gradient: linjär, startPoint topLeading, endPoint bottomTrailing (CSS: `linear-gradient(135deg, start, slut)`).

| theme | Gradient start | Gradient slut | chipInk (text på vita chips) |
|---|---|---|---|
| ember | #F0611F | #B8291A | #8C210F |
| forest | #21945C | #0D5C3D | #0A4D30 |
| midnight | #292E4D | #0D0F24 | #141733 |
| gold | #DEA129 | #9E660D | #784D08 |
| sky (default, även null) | #1287F5 (dealBlue) | #0A54D9 (dealBlueDeep) | #083D75 (dealBlueInk) |

Globala tema-tokens som korten använder (DeliveraTheme):

| Token | Värde |
|---|---|
| orange | #F04F1A |
| ink | #0F0F12 |
| muted | #6E6B66 |
| gold | #F0BA5C |
| line | svart 6.5% opacitet (`rgba(0,0,0,0.065)`) |
| dealBlue / dealBlueDeep / dealBlueInk | #1287F5 / #0A54D9 / #083D75 |
| dealBlueGradient | linjär 135deg dealBlue → dealBlueDeep |
| cardShadow() | `box-shadow: 0 10px 18px rgba(0,0,0,0.075)` (radius 18, y 10) |
| appBackground | linjär 135deg #FCFAF2 → #F5FAF5 → #FCF5ED |

Alla typsnitt nedan är SF-systemfonten. "rounded" = design .rounded (Compose: rundad display-font, CSS: SF Rounded-ekvivalent). Vikter: black = 900, heavy = 800, bold = 700.

### 10.3 Modul-växeln och hero-logik

`PulseModuleView` switchar på `module.type`. Okänd typ renderas inte alls (EmptyView). Kort renderas bara om dess obligatoriska payload finns (t.ex. CHAMPION kräver `restaurant != nil`, HOT_PRODUCTS kräver icke-tom `products`).

Hero-moduler (visas högt upp på hemskärmen): `CHAMPION, COMEBACK, STREAK, POINTS_NUDGE, OCCASION, WEATHER, FAVORITE`. Övriga (DAILY_DROP, HOT_PRODUCTS, NEW_MENU_ITEMS, FASTEST_TODAY, TRENDING, NEW_RESTAURANTS) interfolieras mellan restaurangerna i flödet. Obs: DAILY_DROP är INTE hero.

Callbacks: `onOpenRestaurant(slug)` navigerar till restaurangsidan, `onOpenRewards()` byter till Rewards-tabben, `onOpenFavorite(module)` öppnar favorit-modalen (endast FAVORITE).

### 10.4 OCCASION / WEATHER (PulseMessageCard, budskapskort utan knapp)

Ren stämning, ej klickbart, ingen CTA.
- Layout: HStack spacing 14, padding 14, bakgrund = temagradienten, hörnradie 20 (continuous), cardShadow.
- Ikon vänster: SF-symbol `cloud.rain.fill` om type == "WEATHER", annars `sparkles`. 19 pt black, vit, i ruta 46x46 med bakgrund vit 18% opacitet, hörnradie 14.
- Titel: `module.title`, 16 pt black rounded, vit, 1 rad, minimumScaleFactor 0.8.
- Undertext: `module.subtitle` (om ej tom), 12 pt bold, vit 88% opacitet, max 2 rader.

### 10.5 CHAMPION (Veckans favorit, hero)

Klickbar (hela kortet) → `onOpenRestaurant(restaurant.slug)`.
- Höjd 190. Hörnradie 22 (continuous), 1 px stroke i `line`, cardShadow.
- Bildrotation: `module.images` (serverns förvalda: hero + logga + toppsäljare, upp till 5); fallback `[heroImageUrl ?? imageUrl]`. Timer var 3.5 s byter bild med easeInOut 0.6 s opacity-övergång (index roterar modulo antal). Om fler än 1 bild.
- Bilden fyller kortet, mörk gradient-overlay: transparent (center) → svart 72% (botten).
- Om inga bilder: temagradienten som bakgrund.
- Innehåll bottenvänstrat, padding 16:
  - Guld-chip: SF `crown.fill` 10 pt black + `module.title` VERSALISERAT, 10 pt black, kerning 0.6. Textfärg chipInk("gold") = #784D08, horisontell padding 9, höjd 24, bakgrund `gold` #F0BA5C, kapselform.
  - Restaurangnamn: 24 pt black rounded, vit, 1 rad, minScale 0.8.
  - Rad: `module.subtitle` 12 pt bold vit 88% + (om rating finns) `star.fill` 10 pt black och rating formaterad `%.1f` 12 pt black, båda i `gold`.

### 10.6 DAILY_DROP (Dagens drop, tidsfönster + nedräkning)

Klickbar → `onOpenRestaurant(dropProduct.restaurant.slug)`.
- Höjd 168, hörnradie 22, temagradient-bakgrund, cardShadow. HStack: text vänster (padding 16, fyller bredd), produktbild höger fast bredd 132 (full höjd, clipped), ingen bild om imageUrl saknas.
- Chip överst: SF `timer` 10 pt black + `module.title` VERSALISERAT 10 pt black kerning 0.6, färg chipInk(theme), h-padding 9, höjd 24, bakgrund vit 92% opacitet, kapsel.
- Produktnamn: `dropProduct.name`, 20 pt black rounded, vit, max 2 rader, minScale 0.8, vänsterställd.
- Prisrad: `"\(Int(priceKr)) kr · \(restaurant.name)"` (mittpunkt · som avskiljare), 12 pt bold, vit 88%, 1 rad.
- Nedräkning (endast om `endsAt` parsas som ISO8601 och ligger i framtiden): kapsel med vit bakgrund, höjd 32, h-padding 12; SF `hourglass` 11 pt black + live-countdown (`Text(timerInterval:countsDown:true)`, formatet HH:MM:SS) 14 pt black monospaced, monospacedDigit; färg chipInk(theme). Kotlin/web: tick varje sekund.

### 10.7 COMEBACK (Vi saknar dig)

Klickbar → `onOpenRestaurant(restaurant.slug)`.
- HStack spacing 14, padding 14, temagradient, hörnradie 20, cardShadow.
- Vänster: restaurangbild (imageUrl ?? heroImageUrl) 58x58, hörnradie 16. Fallback: ruta vit 18% med SF `heart.fill` 20 pt black vit.
- Mitten: `module.title` 15 pt black rounded vit (1 rad); `module.subtitle` 12 pt bold vit 86% (2 rader).
- Höger CTA-chip (del av samma knapp, ej egen): texten `"Beställ"`, 13 pt black, färg chipInk(theme), h-padding 14, höjd 34, vit kapsel.

### 10.8 STREAK (uppdrag på hemskärmen)

Klickbar → `onOpenRewards()`.
- HStack spacing 14, padding 14, temagradient, hörnradie 20, cardShadow.
- Vänster: SF `flag.checkered` 18 pt black vit i 46x46-ruta, vit 18%, hörnradie 14.
- Mitten: `module.title` 14 pt black rounded vit (1 rad); progressbar: kapsel höjd 6, spår vit 25%, fyllnad vit, bredd = `min(1, count/target)` av tillgänglig bredd, minst 8 px; `module.subtitle` 11 pt bold vit 86%.
- Höger: SF `chevron.right` 13 pt black, vit 80%.

### 10.9 POINTS_NUDGE (Nästan framme, poäng-knuffen)

Klickbar → `onOpenRewards()`. Kräver `product` + `balance`.
- Samma yttre skal som STREAK (spacing 14, padding 14, temagradient, radie 20, cardShadow).
- Vänster: produktbild 64x64 radie 16; fallback vit 18%-ruta med DpointsGlyph storlek 28 (se 11.9).
- Titel (klient-byggd sträng): `"\(remainingPoints ?? 0) p kvar till \(product.name)"`, 14 pt black rounded, vit, max 2 rader.
- Progressbar: identisk med STREAK, fraction = `min(1, balance/costPoints)`.
- Underrad: `"hos \(product.restaurant.name)"`, 11 pt bold, vit 85%.
- Höger: chevron.right 13 pt black vit 80%.

### 10.10 HOT_PRODUCTS / NEW_MENU_ITEMS (PulseProductRail, horisontell produkträls)

Sektion med rubrik + horisontell scroll (inga indikatorer, `scrollClipDisabled`, trailing padding 20 i innehållet).
- Rubrikrad: om `title == "Hetast just nu"` visas SF `flame.fill` 16 pt black i `orange` före SectionHeader(title, subtitle ?? ""). NEW_MENU_ITEMS har ingen rubrik-ikon.
- HOT_PRODUCTS: `showPrice=true`, ingen badge. NEW_MENU_ITEMS: `showPrice=false`, badge `"Nyhet"` (renderas VERSALISERAD: "NYHET").
- Produktkort (klick → `onOpenRestaurant(product.restaurant.slug)`): bredd 168, vit bakgrund, hörnradie 16, 1 px `line`-stroke.
  - Bild 168x110 (clipped). Fallback: temagradient med SF `fork.knife` 24 pt black, vit 85%.
  - Badge (om satt): text versal, 9 pt black vit, h-padding 7, höjd 20, `orange` kapsel, placerad topLeading med 8 padding.
  - Textblock padding 10: produktnamn 13 pt black `ink` (1 rad); rad med restaurangnamn 11 pt bold `muted` (1 rad) och om showPrice: höger `"\(Int(priceKr)) kr"` 12 pt black `ink`.
- Kortavstånd 12.

### 10.11 TRENDING (PulseRestaurantChipRail, chip-räls)

- Rubrikrad: SF `chart.line.uptrend.xyaxis` 16 pt black i `orange` + SectionHeader.
- Horisontell räls, chipavstånd 10. Chip (klick → restaurang): h-padding 12, höjd 64, vit bakgrund, radie 16, `line`-stroke.
  - Bild 44x44 radie 12; fallback grå ruta svart 5%.
  - Namn 13 pt black `ink` (1 rad); underrad = `"+\(growthPct)% denna vecka"` (tom sträng om growthPct saknas), 11 pt bold i `orange`.

### 10.12 FASTEST_TODAY (FastestTodayRail, hjältebild + tidsbadge)

Grön accentfärg: #21945C.
- Rubrikrad: SF `bolt.fill` 17 pt black grön + SectionHeader(title, subtitle ?? "Snabb leverans just nu").
- Kort (klick → restaurang): 200x130, hörnradie 18, `line`-stroke, avstånd 12. Bild heroImageUrl ?? imageUrl fyller, overlay transparent → svart 70% (center → botten). Fallback: forest-gradienten.
- Bottenvänstrat, padding 12: om `avgMinutesToday` finns en grön kapsel höjd 28, h-padding 10 med SF `bolt.fill` 11 pt black + `"\(minutes) min"` 14 pt black rounded, vit text. Under: restaurangnamn 16 pt black rounded vit, 1 rad, minScale 0.8.

### 10.13 NEW_RESTAURANTS (NewRestaurantsRail, Ny i stan)

- Rubrikrad: SF `sparkles` 16 pt black i `dealBlue` + SectionHeader.
- Kort (klick → restaurang): bredd 210, vit bakgrund, radie 17, `line`-stroke, avstånd 12.
  - Bild heroImageUrl ?? imageUrl 210x118; fallback sky-gradient.
  - Badge topLeading (padding 8): texten `"NY"`, 9 pt black, kerning 0.6, vit på `dealBlue`-kapsel höjd 21, h-padding 8.
  - Textblock h-padding 11, v-padding 9: namn 14 pt black rounded `ink` (1 rad); underrad `cuisine ?? "Nyöppnad i stan"` 11.5 pt bold `muted` (1 rad).

### 10.14 FAVORITE (Din favorit, specialdesign med dubbel ram)

Kortet är klickbart → `onOpenFavorite(module)` som öppnar FavoriteOfferSheet (bottensheet). `percent = module.percent ?? 10`.

Kortet:
- HStack spacing 16, padding 16, temagradient, radie 22, cardShadow.
- Vänster: produktbild i DUBBEL ram: yttre ruta 92x92 radie 20 i `gold`, inre 84x84 radie 16 vit, bilden 78x78 radie 14. Fallback: SF `heart.fill` 26 pt black i `orange`.
  - Band ovanpå ramen (offset y −7): texten `"DIN FAVORIT"`, 8 pt black, kerning 0.8, vit, h-padding 7, höjd 17, `orange`-kapsel.
- Mitten: produktnamn 17 pt black rounded vit (2 rader); `module.subtitle` 12 pt bold vit 85%; prisrad 15 pt black rounded: ordinarie `"\(Int(priceKr)) kr"` genomstruket vit 60% + nytt pris `"\(round(priceKr * (100 - percent) / 100)) kr"` vitt.
- Höger: kapsel vit, höjd 34, h-padding 11 med `"−\(percent)%"` (minustecken U+2212) 15 pt black rounded i chipInk(theme).

FavoriteOfferSheet (presentationDetent höjd 620, drag-indikatorn dold, bakgrund appBackground):
- Egen grabber: kapsel 40x5, svart 12%, top-padding 10.
- Stor dubbelram: guld 204x204 radie 30, vit 192x192 radie 25, bild 182x182 radie 22; fallback `heart.fill` 52 pt black orange. Band `"DIN FAVORIT"` 11 pt black kerning 1, vit, h-padding 12, höjd 26, orange kapsel, offset y −12.
- Produktnamn 24 pt black rounded `ink`, centrerad. `"hos \(restaurant.name)"` 13 pt bold `muted`. `module.subtitle` 13 pt bold i `dealBlue`.
- Prisrad (baseline-justerad, spacing 10): gammalt pris 19 pt black rounded genomstruket `muted`; nytt pris 34 pt black rounded `ink` med numericText-contentTransition; grön badge `"−\(percent)%"` 13 pt black vit, h-padding 9, höjd 26, kapsel #21945C.
- CTA-knapp: höjd 58, h-margin 24, `orange` bakgrund radie 18; innehåll: spinner (vit) när isWorking annars SF `cart.fill.badge.plus` 16 pt black; text `"Välj och lägg till"` 17 pt black vit. Disabled när isWorking.
- Under knappen: felmeddelande (om satt) som Label med `exclamationmark.circle.fill`, 12 pt black `orange`, centrerad; annars hjälptexten `"Välj dina tillval, rabatten dras i kassan"` 12 pt bold `muted`.
- Avvisa-knapp: `"Inte nu"` 14 pt black `muted`, bottom-padding 14.
- onAdd (ägs av HomeView): anropar `POST /api/deals/app/favorite/claim` med `{ productId }` → svar `FavoriteClaimResponse { claimed: Bool, userDealId: String, amountKr: Int, title: String }`; HomeView sätter aktiv deal (AppStorage `delivera.activeUserDealId` + snapshot) och lägger produkten i varukorgen. Ingen sendPrompt, allt är API-anrop.

### 10.15 Datumparsning

`PulseDateParsing.date(from:)`: prova ISO8601 med fraktionssekunder först, sedan utan. Samma logik behövs i Kotlin/JS för `endsAt`.

## 11. RewardsView (Dpoints och uppdrag)

Fil: Features/Rewards/RewardsView.swift. Egen tabb. Bakgrund: appBackground-gradienten, vertikal scroll utan indikatorer. Innehålls-padding: horisontell 20, topp 18, botten 112 (tabbarens frihöjd). Sektionsavstånd 18.

Intro-animation: hela innehållet startar opacity 0 + offset y 22 och animeras in med spring(response 0.62, dampingFraction 0.82) vid första visning. Pull-to-refresh laddar om allt med forceRefresh. När authToken ändras laddas allt om.

Login-avgörande: `isLoggedIn = authToken.trim() != ""`.

### 11.1 API-anrop (exakta endpoints)

| Anrop | Metod + path | Auth | Används till |
|---|---|---|---|
| dpointsRewardProducts | GET `/api/dpoints/reward-products` (+ `?refresh=1` vid force) | nej | katalogen (restaurants med reward-produkter) |
| dpointsRewards | GET `/api/dpoints/rewards` | nej | earnRules (sekundärt, fel sväljs) |
| dpointsMeDetailed | GET `/api/dpoints/me` | Bearer | saldo, signup, streak, transaktioner |
| referralStatus | GET `/api/account/referral` | Bearer | Bjud in en vän-kortet |
| appDeals | GET `/api/deals/app?placement=REWARDS&limit=8` | Bearer | uppdragen (missions) |
| claimHomeAppDeal | POST `/api/deals/app/:id/claim` (tom body) | Bearer | starta uppdrag |
| claimDpointsSignupBonusDetailed | POST `/api/dpoints/claim-signup` (tom body) | Bearer | välkomstbonusen, svarar med nytt RewardsMe |

Laddningslogik: katalog + rewards laddas parallellt (async let). Om katalogen är tom och det inte var force-refresh görs automatiskt ett nytt anrop med `refresh=1`. Fel sväljs inte tyst: befintlig data behålls, fel visas bara när inget finns att visa. Felsträngar: katalog `"Kunde inte hämta rewards. Dra för att uppdatera."`, saldo `"Kunde inte hämta ditt saldo. Försök igen."`. referral och missions är try? (tysta). Utloggad nollas me, referral och missions.

Svarsmodeller (exakta fält):

```
DpointsRewardsResponse { enabled?, valuePerKr? (Double), rewards? [LegacyDpointsReward], earnRules [RewardsEarnRule], streakTarget? }
DpointsRewardProductsResponse { enabled?, earnRate? (Double), restaurants [RewardRestaurant] }
RewardsMe { enabled, balance (Int), valuePerKr (Double), signup? { claimable, bonusPoints, sponsorName? }, streak? { target, count, ready, readyInDays }, transactions [DpointsTransaction] }
RewardsEarnRule { key, label, points (Int), repeat? -> repeatLabel }
RewardRestaurant { id, name, slug, cuisine?, imageUrl?, logoUrl?, products [RewardProduct] }
RewardProduct { id, name, description?, price (Double, kr), imageUrl?, categoryId?, categoryName?, pointsPrice (Int), multiplier?, tier? { key, label, rank } }
DpointsTransaction { id, amount (Int), type, reason?, balanceAfter, createdAt (ISO8601) }
ReferralStatusResponse { locked, code?, shareUrl?, enabled, rewardLabel?, couponsPerSide?, deal? { title?, discountType?, discountPercent?, amountKr?, freeDelivery?, minOrderKr?, validUntil? }, stats? { invited, registered, ordered, totalEarnedKr? } }
HomeAppDeal (missions): { id, title, subtitle?, badge?, imageUrl?, ctaLabel?, placement, audience, template, size, claimRequired, dpointsBonus?, missionType?, missionProgress? { target, count, remaining, completed, windowDays, rewardPoints, claimed }, checkoutApplicable?, discountType?, discountPercent?, amountKr?, freeDelivery, minOrderKr, restaurant?, userDealId?, theme? }
```

Obs: earn-reglernas copy (t.ex. poäng per krona) är HELT server-styrd via `earnRules[].label`, appen hårdkodar ingen intjäningstext. missionType-värden som THREE_ORDERS_WEEK bor på servern; klienten renderar bara progress.

### 11.2 Header (alltid)

- Rubrik: `"Rewards"`, 34 pt black rounded, `ink`.
- Underrubrik 14 pt bold `muted`, max 2 rader. Inloggad: `"Tjäna poäng, köp reward-produkter och följ din historik."`. Utloggad: `"Se vilka rewards du låser upp när du loggar in."`

### 11.3 Utloggat läge (guestContent)

1) GuestRewardsHero: kort minHeight 224, radie 28, innehåll bottenvänstrat, padding 22. Bakgrund: linjär 135deg #141417 → #3B1C14 → #F04F1A (orange). Stroke vit 12%, skugga svart 10% radius 14 y 8.
   - Etikett `"Dpoints"` versaliserad, 12 pt black rounded, vit 72%.
   - Rubrik `"Mat som ger tillbaka"` 32 pt black rounded vit (2 rader).
   - Text `"Logga in och använd poäng direkt på markerade produkter."` 14 pt heavy vit 78%.
   - CTA: vit kapsel höjd 48, h-padding 16, text `"Börja samla"` + SF `arrow.right`, 15 pt black rounded, färg `ink`. Klick → onOpenProfile (profil/login).
2) GuestRewardsPerks: tre lika breda kort i rad (spacing 10), padding 13, bakgrund vit 84%, radie 18, `line`-stroke. Innehåll (ikon 14 pt black `orange`, rubrik 14 pt black rounded `ink`, underrad 11 pt bold `muted` 1 rad):
   - `bag.fill` / `"Beställ"` / `"Poäng på köp"`
   - `sparkles` / `"Lås upp"` / `"Reward-varor"`
   - `bolt.fill` / `"Använd"` / `"Direkt i menyn"`
3) Rewards-katalogen i låst läge (locked=true): alla produktkort får låsbadge och 55% opacitet, se 11.6.

### 11.4 Inloggat läge, uppifrån och ner

1) RewardsErrorCard (bara vid loadError): vitt kort radie 16, `line`-stroke, padding 14. Rad: SF `exclamationmark.circle.fill` 18 pt black `orange` + felmeddelandet 13 pt heavy `ink`. Under: knapp `"Försök igen"` 13 pt black vit, full bredd, höjd 42, `ink`-bakgrund radie 12. Klick = force reload.

2) Välkomstbonus-banner (bara om `me.signup.claimable == true`): hel knapp, padding 16, grön bakgrund #2B7D4F, radie 20, vit text.
   - SF `sparkles` 20 pt black i cirkel 42x42 vit 17%.
   - `"Hämta din välkomstbonus"` 15 pt black; `"+\(signup.bonusPoints) Dpoints väntar på dig"` 12 pt bold, opacitet 0.78.
   - Höger: spinner (vit) under claim, annars chip `"Hämta"` 12 pt black, h-padding 12, höjd 34, vit 16%-kapsel.
   - Klick → POST `/api/dpoints/claim-signup`, svaret ersätter hela `me` (bannern försvinner eftersom claimable blir false). Disabled under claim.

3) RewardsHeroCard (saldot): padding 22, minHeight 150, radie 24, bakgrund linjär 135deg #141417 → #4D2114 → #F04F1A, stroke vit 12%, skugga svart 10% radius 14 y 8.
   - Vänster: ruta 64x64 radie 16 vit 16% med DpointsCoin3D storlek 60 (se 11.10).
   - Etikett `"Ditt saldo"` versaliserad 12 pt black rounded vit 72%.
   - Saldo: `"\(balance)"` 46 pt black rounded vit, numericText-contentTransition. Om balance saknas: `"Hämtar..."` vid laddning annars `"0"`, 34 pt black rounded.
   - Undertext: `"Använd poäng direkt på markerade produkter."` 13 pt heavy vit 80%.

4) panelPicker: tre segmentknappar i rad (spacing 8), var och en full bredd, höjd 46, radie 15, `line`-stroke. Vald: vit text på `ink`-bakgrund; ovald: `ink`-text på vit. Innehåll ikon + text 12 pt black. Byte animeras spring(0.32, 0.82).

| Panel | title | symbol |
|---|---|---|
| shop | `"Köp"` | bag.fill |
| earn | `"Tjäna"` | sparkles |
| history | `"Historik"` | clock.fill |

5) Panelinnehållet enligt vald flik (11.5 till 11.8). Default-flik: shop.

### 11.5 Fliken Köp: rewards-katalogen

SectionTitle: `"Köp med poäng"` (20 pt black rounded `ink`) + undertext 12 pt bold `muted` = `"\(count) produkter från restaurangerna"` där count = summan av alla products, eller `"Produkter läggs till av restaurangerna."` om 0.

Tillstånd:
- Laddar och tomt: RewardsLoadingShowcase (se 11.8).
- Tomt: EmptyRewardsCard, vitt kort radie 18 med `"Inga produkter ännu"` 15 pt black `ink` och `"När en restaurang markerar produkter som rewardable i admin visas de här."` 12 pt bold `muted`.
- Annars ett RewardRestaurantBlock per restaurang.

RewardRestaurantBlock:
- Restaurangrad (klickbar → onOpenRestaurant(slug, nil)): logga (logoUrl ?? imageUrl) 38x38, vit bakgrund, radie 11; namn 15 pt black `ink`; underrad `"\(cuisine ?? "Rewards") - välj produkt i menyn"` 12 pt bold `muted`; chevron.right 12 pt black `muted`.
- Horisontell produkträls (spacing 12, trailing 20). Produktkort: 154x220 (topLeading), padding 10, vit, radie 18, `line`-stroke.
  - `affordable = !locked && (balance ?? -1) >= pointsPrice`; `shortfall = pointsPrice - balance` när inloggad, olåst och saldot inte räcker.
  - Bild: höjd 116, contentMode fit, vit bakgrund; utan bild bara ett vitt fält höjd 56.
  - Låsbadge topTrailing (padding 8) när locked eller ej affordable: svart 72%-kapsel höjd 26, h-padding 8, vitt innehåll: SF `lock.fill` 11 pt black + (om shortfall) `"saknas \(shortfall) p"` 9 pt black.
  - Produktnamn 14 pt black `ink` (1 rad).
  - Prisrad: DpointsGlyph 18 + `"\(pointsPrice) p"` 12 pt black `orange`; höger ordinarie pris `priceText(price)` 11 pt black `muted` (kr-formatering).
  - Opacitet: locked 0.55, ej affordable 0.62, annars 1. Stroke: `line` (60% opacitet av line när ej affordable).
  - Klick → onOpenRestaurant(slug, product.categoryId) (öppnar menyn scrollad till kategorin). Inlösen sker alltså i restaurangmenyn, inte här; ingen personlig kod genereras i appen.

### 11.6 Fliken Tjäna: referral + uppdrag + earn-regler

1) ReferralInviteCard (bara om `referral.enabled`): vitt kort padding 16, radie 20, `line`-stroke.
   - Rad: SF `person.2.fill` 18 pt black vit i cirkel 42x42 `ink`; rubrik `"Bjud in en vän"` 16 pt black rounded `ink`; underrad om rewardLabel finns: `"Ni får båda \(rewardLabel.lowercased())"`, annars `"Din vän anger koden i kassan"`, 12 pt bold `muted`.
   - Om `locked`: Label med `lock.fill`: `"Gör din första beställning så låser du upp din kod."` 13 pt bold `muted`, padding 12, bakgrund svart 3.5% radie 14.
   - Annars (kod finns): kopieringsknapp full bredd höjd 50, bakgrund svart 3.5% radie 14: koden 19 pt black monospaced `ink` kerning 2 + SF `doc.on.doc` 13 pt black `muted` (blir grön `checkmark` i 1.8 s efter kopiering, med success-haptik; koden läggs på urklipp). Bredvid: ShareLink-knapp höjd 50, h-padding 16, `orange` radie 14, vit text 14 pt black: SF `square.and.arrow.up` + `"Dela"`.
     - Delningstext: `"Testa Delivera! Använd min kod \(code) i kassan så får vi båda \(reward). \(shareUrl)"` där reward = rewardLabel ?? deal.title ?? "en belöning"; utan shareUrl utelämnas länken.
   - Statistikrad (om stats.invited > 0): tre par i rad (spacing 14), värde 14 pt black rounded `ink` + etikett 11 pt bold `muted`: `"inbjudna"`, `"registrerade"`, `"har beställt"`.

2) SectionTitle `"Uppdrag"` med undertext `"Så tjänar du extra Dpoints"`.

3) MissionCard per deal i missions (REWARDS-placement-feeden, samtliga deals renderas som uppdragskort): vitt kort padding 14, radie 18, `line`-stroke.
   - Rad: SF `flag.checkered` 17 pt black vit i 42x42-ruta med dealBlueGradient radie 14; titel `deal.title` 15 pt black rounded `ink`; `deal.subtitle` 12 pt bold `muted` (2 rader).
   - Poängbadge (om `missionProgress.rewardPoints ?? dpointsBonus > 0`): `"+\(points) p"` 12 pt black vit, h-padding 11, höjd 30, `ink`-kapsel.
   - `isStarted = deal.userDealId` icke-tom. Startat + progress finns: progressbar höjd 8, spår svart 6%, fyllnad dealBlueGradient, bredd `min(1, count/target)` (min 8 px). Statustext 11 pt bold:
     - completed: `"Klart! Poängen läggs till på ditt saldo."` i grönt (systemgrön).
     - windowDays > 0: `"\(count) av \(target) · \(remaining) kvar inom \(windowDays) dagar"` i `muted`.
     - annars: `"\(count) av \(target) beställningar"` i `muted`.
   - Ej startat: CTA-knapp full bredd höjd 42, `ink` radie 14, vit text 13 pt black: `deal.ctaLabel ?? "Starta uppdraget"`, spinner före texten under claim. Klick → POST `/api/deals/app/:id/claim`; svarets `deal` ersätter uppdraget i listan (nu med userDealId + progress). Success-haptik, felhaptik vid fel. Servern spårar progress och betalar ut poängen automatiskt efter betald order.

4) Earn-regler (från `/api/dpoints/rewards`, `earnRules`): en rad per regel, vitt kort padding 14, radie 18, `line`-stroke.
   - Ikon 17 pt black vit i 42x42-ruta dealBlueGradient radie 14. Symbol per `key`: invite → person.badge.plus, order_streak → repeat, new_restaurant → storefront, review_rating → star.fill, review_text → square.and.pencil, övriga → diamond.fill.
   - `rule.label` 15 pt black `ink`; `rule.repeatLabel ?? "Kan tjänas i appen"` 12 pt bold `muted`.
   - Höger: `"+\(rule.points) p"` 12 pt black vit i `ink`-kapsel höjd 30, h-padding 11.

### 11.7 Fliken Historik

SectionTitle `"Historik"` + `"Senaste Dpoints-rörelser"`. Transaktioner sorteras på createdAt fallande, max 10 visas.
- Tomt: `"Ingen historik än."` 14 pt bold `muted` i vitt kort radie 18, padding 16.
- Rad per transaktion: vitt kort padding 14, radie 16, `line`-stroke. Vänster: titel 14 pt black `ink` + datum 11 pt bold `muted`. Höger: belopp `"+X"`/`"-X"` (plus prefixas explicit) 14 pt black, `orange` om >= 0 annars `muted`.
- Titel = `reason` om satt, annars mappning av `type`: EARN_ORDER → `"Köp"`, SIGNUP_BONUS → `"Välkomstbonus"`, CAMPAIGN → `"Kampanj"`, REDEEM → `"Inlöst"`, ADMIN_ADJUST → `"Justering"`, REVERSAL → `"Återtag"`, annars typen rått.
- Datumformat: `"d MMM yyyy"` med locale sv_SE (t.ex. "2 jul 2026"). Oparsbart datum → `"Datum saknas"`.

### 11.8 Laddningsläge (RewardsLoadingShowcase)

Visas i katalogen när isLoading och listan är tom. Detta är appens enda shimmer (medveten design).
- Header-kort: vitt, padding 15, radie 20. Vänster: cirkel 48 i orange 14% som pulserar `scale = 1 + 0.05*sin(t*1.2)` med DpointsGlyph 24 som roterar `t*12` grader (kontinuerligt, TimelineView). Text `"Hämtar rewards"` 17 pt black rounded `ink` + `"Vi laddar restauranger och poängprodukter."` 12 pt bold `muted`. Höger: spinner tonad `orange`.
- 4 produkt-skelettkort 154x220 (samma skal som riktiga kort) med ShimmerBlock-ytor: bild h 116 radie 16, textrad 108x14, rad med DpointsGlyph 16 (72% opacitet) + block 58x12. Varje kort fasförskjuts `index*0.18` och guppar vertikalt `sin(t*0.8+index)*2` px.
- 2 restaurangrads-skelett: vit 90%, radie 18, padding 14: block 44x44 radie 13, rader 142x14 och 198x12, höger DpointsGlyph 20 med opacitet `0.24 + 0.08*sin(t)`. Fas `index*0.24`.
- ShimmerBlock: rundad rektangel svart (opacity 0.06 till 0.08 beroende på yta) med ett diagonalt ljusband: bredd 45% av ytan, lutning 16 grader, gradient transparent → vit 52% → transparent, blur 8, position `x = ((sin(fas*1.1)+1)/2) * bredd*1.4 - bredd*0.45` (svep fram och tillbaka sinusformat, inte linjärt loopande).

### 11.9 DpointsGlyph (2D-märket, återanvänds överallt)

Rundad kvadrat i `orange` (#F04F1A), hörnradie = 0.22 x storlek. Ovanpå: en vit kvadrat-KONTUR (stroke, linjebredd max(1.5, 0.11 x storlek)), 0.42 x storlek stor, hörnradie 0.1 x storlek, roterad 45 grader (diamant). Standardstorlek 18.

### 11.10 DpointsCoin3D (SceneKit-myntet, återskapas i CSS/Compose)

Äkta realtids-3D med transparent bakgrund, antialiasing 4x MSAA, ej interaktivt. Standardstorlek 64 (i saldokortet 60).

Scen:
- Kamera: fieldOfView 32 grader, position (0, 0, 4.6), tittar mot origo.
- Nyckelljus: directional, intensitet 900, eulerAngles (−0.6, 0.5, 0) rad.
- Fyllnadsljus: ambient, intensitet 420.

Myntet:
- Cylinder radie 1.0, höjd (tjocklek) 0.18. Roterad 90 grader runt X så den platta sidan pekar mot kameran.
- Material (PBR): topp/botten guld diffuse #F2BD52, metalness 0.85, roughness 0.28. Kanten (rim) mörkare guld #CC9129, metalness 0.9, roughness 0.35.
- Präglat "D" på framsidan: extruderad text, djup 0.07, systemfont vikt black storlek 1.0, centrerad via bounding-box-pivot, position 0.09 ut från ytan, roterad −90 grader runt X (ligger platt mot myntets framsida). Material: mörkast guld #B8801A, metalness 0.9, roughness 0.2.
- Animation: en yttre spinner-nod roterar 360 grader runt skärmens VERTIKALA axel (y), linjärt, 7 s per varv, oändligt. Myntet ses alltså omväxlande framifrån, från kanten (smal), bakifrån.

CSS-ekvivalent: `perspective` motsvarande fov 32 vid avstånd 4.6 x radien, ett cirkulärt element med guld-gradient + präglat D (text-shadow inåt), sidokant som mörkare guld, `animation: rotateY 360deg 7s linear infinite`, `transform-style: preserve-3d`. Compose: graphicsLayer rotationY driven av infinite animation 0→360 över 7000 ms LinearEasing, med camera distance som ger perspektiv, kant simulerad med skuggad ellips.

### 11.11 Hex-referens för Rewards-specifika färger

| Användning | Swift | Hex |
|---|---|---|
| Signup-banner | Color(0.17, 0.49, 0.31) | #2B7D4F |
| Hero/gäst-gradient steg 1 | Color(0.08, 0.08, 0.09) | #141417 |
| Saldo-gradient steg 2 | Color(0.30, 0.13, 0.08) | #4D2114 |
| Gäst-gradient steg 2 | Color(0.23, 0.11, 0.08) | #3B1C14 |
| Gradient steg 3 (båda) | DeliveraTheme.orange | #F04F1A |
| Mynt-guld (diffuse) | UIColor(0.95, 0.74, 0.32) | #F2BD52 |
| Mynt-kant | UIColor(0.80, 0.57, 0.16) | #CC9129 |
| Mynt-prägling | UIColor(0.72, 0.50, 0.10) | #B8801A |
## 12. RestaurantDetailView

Restaurangdetaljskärmen (`Features/Restaurant/RestaurantDetailView.swift`). Fullskärm, pushas i navigation-stacken. Swipe-back är alltid aktiverad (egen `SwipeBackEnabler` som slår på `interactivePopGestureRecognizer` när stacken har fler än 1 view controller).

### 12.0 Färgtokens som används på skärmen (DeliveraTheme)

| Token | Swift-värde | Hex |
|---|---|---|
| `orange` | Color(red: 0.94, green: 0.31, blue: 0.10) | `#F04F1A` |
| `ink` | Color(red: 0.06, green: 0.06, blue: 0.07) | `#0F0F12` |
| `muted` | Color(red: 0.43, green: 0.42, blue: 0.40) | `#6E6B66` |
| `line` | svart med opacity 0.065 | `rgba(0,0,0,0.065)` |
| `gold` | Color(red: 0.94, green: 0.73, blue: 0.36) | `#F0BA5C` |
| `appBackground` | LinearGradient topLeading till bottomTrailing | `#FCFAF2` → `#F5FAF5` → `#FCF5ED` |

Nästan alla kort på skärmen följer samma mönster: vit bakgrund, `RoundedRectangle` (continuous corners), 1 px stroke i `line`.

### 12.1 Props och state (in till skärmen)

| Prop | Typ | Beskrivning |
|---|---|---|
| `restaurant` | Restaurant | initial data (listobjektet), ersätts av färsk GET vid load |
| `orderMode` | OrderMode | `.delivery` eller `.pickup` |
| `deliveryCoordinate` | Coordinate? | kundens adresskoordinat, används för zonvalidering |
| `activeAddress` | String | aktiv leveransadress (skickas vidare till CartStore) |
| `cartStore` | CartStore | global varukorg (observed) |
| `isFavorite` | Bool | styr hjärtikonen |
| `autoOpenProductId` | String? | om satt (t.ex. från "Din favorit" på hem), öppnas produktens modal automatiskt |
| `onOpenCart` | closure | öppnar varukorgen |
| `onToggleFavorite` | closure | växlar favorit |

Lokal state: `selectedProduct: MenuProduct?` (styr produktmodalen), `pendingCartAdd`, `didAutoOpen`, `showingReplaceCartAlert`, `showingReviews`, `showingInfo`, `isMenuHeaderPinned`, `stickyBlurProgress: CGFloat` (0..1), `heroRevealed`.

### 12.2 Rotlayout

- `ZStack(alignment: .bottom)` med `appBackground.ignoresSafeArea()` i botten.
- Vertikal `ScrollView` utan indikatorer, innehåll: `VStack(spacing: 0) { hero; content }`.
- Bottom-padding på scrollinnehållet: **104** om `cartStore.count > 0`, annars **28**.
- Om `cartStore.count > 0` visas en flytande varukorgsknapp (se 12.11) längst ner, horisontell padding 18, bottom-padding 12, transition `.move(edge: .bottom)` kombinerad med `.opacity`.

### 12.3 `.task` vid visning (laddsekvens)

1. `heroRevealed = false`.
2. `await model.load(orderMode:deliveryCoordinate:)` (se 12.13).
3. `withAnimation(.spring(response: 0.82, dampingFraction: 0.88)) { heroRevealed = true }` (hero-avslöjandet).
4. `cartStore.configure(restaurant:orderMode:address:deliveryFee:deliveryCoordinate:categories:)` där `deliveryFee = 0` om `orderMode == .pickup` ELLER `!model.zoneValidationFinished`, annars `model.displayDeliveryFee`.
5. Auto-öppning: om `!didAutoOpen` och `autoOpenProductId` är satt, sätt `didAutoOpen = true`, hitta produkten i `model.categories.flatMap(\.products)` på id, vänta 350 ms (`Task.sleep 350_000_000 ns`), sätt `selectedProduct = product` (öppnar den riktiga modalen så tillval kan väljas).

### 12.4 Hero (topp)

- Höjd: **292 pt** plus topp-safe-area (heroHeight 292, view:n får `.frame(height: heroHeight + topSafeAreaInset)`, `.padding(.top, -topSafeAreaInset)`, `.ignoresSafeArea(edges: .top)`, `.clipped()`).
- Bild: `restaurant.heroImageUrl ?? restaurant.imageUrl` via RemoteImage (utan fel-ikon). Om restaurangen saknar bild: vit rektangel.
- Reveal-animation: bilden startar på `scaleEffect(1.06)` och `opacity(0.78)`, animeras till 1/1 med springen ovan (response 0.82, damping 0.88).
- Gradient-overlay i botten: `LinearGradient` från transparent (topp) till svart opacity **0.76** (botten), höjd **172 pt**.
- `RestaurantHeroRevealPattern`-overlay medan `!heroRevealed`: en `TimelineView(.animation)` med (a) en diagonal LinearGradient orange opacity 0.18 → vit opacity 0.16 → transparent och (b) 18 st roterande Dpoints-glyfer (storlek `13 + (index % 4) * 5`, opacity 0.16, rotation `t * 22 + index * 17` grader, x-offset `(index % 6) * 74 - 170`, y-offset `(index / 6) * 72 - 92 + sin(t + index) * 9`, scale animeras 1.55 → 1 med `easeOut(0.42)` och delay `index * 0.012`). Allt tonas till opacity 0 när `heroRevealed`. `allowsHitTesting(false)`.

**Knapprad överst** (padding horisontellt 20, top `topSafeAreaInset + 12`), alla är `CircleIconButton`: SF-symbol i storlek 14 weight black, färg ink, 40x40 pt, vit cirkel med opacity 0.94:

| Position | Symbol | Aktion |
|---|---|---|
| Vänster | `chevron.left` | dismiss (tillbaka) |
| Höger 1 | `phone.fill` | visas bara om `restaurant.phone` finns och inte är tom, ringer via `tel://` (numret filtreras till siffror och `+`) |
| Höger 2 | `info` | öppnar info-sheetet (12.12) |
| Höger 3 | `heart.fill` om favorit annars `heart` | `onToggleFavorite()` |
| Höger 4 | `square.and.arrow.up` | tom aktion (dela är inte implementerat) |

**Nedre vänstra hörnet av heron** (VStack spacing 10, padding horisontellt 28, bottom 20):

1. **Statusbadge** (endast om `RestaurantAvailability.statusLabel(for:)` returnerar text, se 12.15): `Label(status, systemImage:)` där ikonen är `sparkles` om `comingSoon == true`, annars `moon.fill`. Font 12 black, vit text, padding horisontellt 10 / vertikalt 7, bakgrund svart opacity 0.78 i Capsule.
2. **Restaurangnamn**: font system 33 weight black design rounded, vit, max 2 rader, `minimumScaleFactor(0.78)`, `allowsTightening`, bredd `max(220, skärmbredd - 56)` vänsterställd.
3. **Rating-rad** (hela raden är en knapp som pushar recensionsvyn, 12.16): HStack spacing 7 med `star.fill` i `gold`, betyget `String(format: "%.1f", rating ?? 4.6)` font 14 black, antal `"(\(ratingCount ?? 0))"` font 13 bold opacity 0.82, samt om `cuisine` finns: `"· \(cuisine.capitalized)"` (mittpunkt, inte bindestreck), 1 rad. Radens basfont 14 bold, vit.

### 12.5 Content-layouten under heron

`LazyVStack(alignment: .leading, spacing: 12, pinnedViews: [.sectionHeaders])`, padding horisontellt **24**, top 6, bottom 18, bakgrund `appBackground`. Ordning uppifrån:

1. **Metrics-raden** (12.6).
2. **Deal-banner** (12.7), endast om `restaurant.dealMaxPercent > 0`.
3. **NoDeliveryBanner** (12.8), endast om `model.zoneAvailable == false` OCH `orderMode == .delivery`.
4. **Beskrivning**: `restaurant.description` om icke-tom, font 14 semibold, färg muted, lineSpacing 3.
5. **Section** med sticky header (12.9) och body: skeleton om `isLoading` (5 st redacted `RoundedRectangle` hörnradie 18, vit opacity 0.75, höjd 112, spacing 12), annars `NoticeBanner(text: error)` om fel, annars `EmptyMenuView` om inga kategorier, annars menysektionerna (12.10).

`EmptyMenuView`: vitt kort (hörnradie 18, line-stroke), padding 16, rubrik `"Menyn är tom"` font 18 black ink, undertext `"Restaurangen har inga aktiva produkter just nu."` font 13 semibold muted.

Felmeddelandet vid misslyckad laddning: `"Kunde inte hämta menyn just nu."`.

### 12.6 Metrics-raden

`HStack(spacing: 7)` med tre `DetailMetric`-kort. Varje kort: VStack leading spacing 4 med SF-ikon (11 black, orange), värde (14 black, ink, 1 rad), etikett (10 bold, muted, 1 rad). Padding h 10 / v 8, fast höjd **78**, maxbredd infinity, vit bakgrund hörnradie 15 continuous, stroke line 1 px.

| Kort | Ikon | Värde | Etikett |
|---|---|---|---|
| Tid | `clock.fill` | `"~\(displayEtaMinutes) min"` | `"Tid"` vid delivery, `"Avhämtning"` vid pickup |
| Avgift | `orderMode.systemImage` | se nedan | `"Avgift"` |
| Minorder | `bag.fill` | se nedan | `"Minorder"` |

Avgiftstexten: `"0 kr"` vid pickup; `"-"` om zonvalideringen inte är klar eller `zoneAvailable == false`; annars `"Gratis"` om avgiften <= 0, annars `"\(Int(fee)) kr"`.
Minorder-texten: `"0 kr"` vid pickup; `"-"` om zonvalideringen inte är klar; annars `priceText(displayMinOrderAmount)`.

### 12.7 Deal-banner (RestaurantDealBanner)

Serverberäknad, data från `/api/restaurants` (`dealMaxPercent: Int?`, `dealCoversAll: Bool?`), noll admin-handpåläggning. Layout: HStack spacing 12, padding 13, bakgrund `PulseThemes.gradient("ember")` (veckans tema-gradient) i RoundedRectangle hörnradie 18 continuous.

- Ikon: `ticket.fill` 16 black vit, i 38x38-ruta med vit opacity 0.18-bakgrund, hörnradie 12.
- Rubrik: `"\(percent)% på hela menyn"` om `coversAll`, annars `"Upp till \(percent)% just nu"`. Font 15 black rounded, vit.
- Undertext: `"Rabatten dras automatiskt i kassan"`, font 12 bold, vit opacity 0.85.

### 12.8 NoDeliveryBanner

Visas när adressen ligger utanför restaurangens leveranszon (bara i delivery-läge). HStack spacing 12, padding 14, förgrund `#B8122E` (Color 0.72/0.07/0.18), bakgrund `#FAE6E8` (0.98/0.90/0.91) hörnradie 16 continuous, stroke samma röd med opacity 0.2.

- Ikon `exclamationmark.circle.fill` 18 black.
- Rubrik: `"Restaurangen levererar inte hit"` font 14 black.
- Undertext: `"Byt adress eller välj avhämtning om restaurangen erbjuder det."` font 12 semibold opacity 0.82.

### 12.9 Sticky menyheader (sök + kategorichips)

Section-headern pinnas vid scroll. Innehåll: VStack spacing 12 med (1) rad: tillbaka-`CircleIconButton` (`chevron.left`) + sökfältet, (2) kategorirälsen om kategorier finns. Padding horisontellt 24, top `8 * stickyBlurProgress`, bottom `6 + 4 * stickyBlurProgress`.

**Sökfältet:** HStack spacing 10: `magnifyingglass` 16 bold orange, `TextField` med placeholder `"Sök i menyn"` (font 15 bold, ingen autokapitalisering), samt rensa-knapp `xmark.circle.fill` i muted när texten inte är tom. Padding h 14, höjd **52**, vit bakgrund hörnradie 16 continuous, stroke line.

**Pin-logik (blur-progress):** headern rapporterar sin globala minY via en PreferenceKey. `fullPinY = topSafeAreaInset + 2`, `fadeStartY = fullPinY + 82`, `progress = clamp((fadeStartY - y) / (fadeStartY - fullPinY), 0, 1)`. `isMenuHeaderPinned = progress >= 0.98` (animeras easeOut 0.18 s). `stickyBlurProgress` uppdateras när diffen > 0.01 (animeras easeOut 0.14 s).

**Bakgrund som funktion av progress:** en `.regularMaterial`-rektangel plus en vit rektangel med opacity 0.34 (pinnad) eller 0.18 (opinnad), båda utsträckta uppåt över safe-arean (+18 pt), hela bakgrunden har `opacity(stickyBlurProgress)`. Skugga: svart opacity `0.14 * progress`, radie `20 * progress`, y `10 * progress`. Bottenlinje: 1 px rektangel i `line` med `opacity(progress)`. `zIndex(10)`.

**Kategorirälsen:** horisontell ScrollView utan indikatorer, HStack spacing 8, trailing-padding 20. Först en chip `"Alla"` (`selectedCategoryID = nil`), sedan en chip per kategori (`category.name`). Chip: font 13 black, höjd **38**, horisontell padding 13, Capsule. Vald: vit text på `orange`. Ovald: ink-text på vitt, stroke line. Val animeras med spring(response 0.38, damping 0.86). Valet FILTRERAR listan (visar bara den kategorin), det är ingen scroll-to.

### 12.10 Menylistan

`LazyVStack(alignment: .leading, spacing: 20)` över `model.visibleCategories` (kategorifilter + sökfilter, se 12.13). Per kategori (VStack spacing 10):

- **Kategorirubrik**: HStack med `category.name` font 24 black rounded ink, Spacer, produktantal `"\(count)"` font 12 black muted.
- **Vanliga produktrader** (`ProductRow`) för alla produkter där `displayMode != "COMPACT"`.
- **Kompakta kort** (`ProductCompactCard`) för produkter med `displayMode == "COMPACT"`, i en `LazyVGrid` med 2 flexibla kolumner, spacing 10 (renderas EFTER de vanliga raderna i kategorin).

**ProductRow** (hela kortet är en knapp som öppnar produktmodalen): HStack spacing 12, padding 12, vitt kort hörnradie 18 continuous, stroke line.

Vänster kolumn (VStack leading spacing 8):
1. Namn font 16 black ink, max 2 rader. Bredvid: badge `"Deal"` om `discountActive == true` (font 10 black vit, horisontell padding 7, höjd 20, orange Capsule).
2. Beskrivning (om `hideDescription != true` och beskrivning finns): font 12 semibold muted, max 2 rader, lineSpacing 2.
3. Prisrad HStack spacing 8: `priceText(effectivePrice)` font 14 black ink; om `discountActive` även ordinarie `priceText(price)` font 12 bold muted genomstruket; sist `DpointsPriceBadge` (se nedan).

Höger: om produkten har bild, `RemoteImage` (contentMode fit) **92x92**, vit bakgrund, hörnradie 15 continuous. I bildens nedre högra hörn (padding 6): plus-knapp, `plus` 13 black, 32x32 cirkel, orange med vit ikon när `orderingEnabled`, annars vit opacity 0.9 med muted-ikon och disabled. Skugga svart 0.16, radie 10, y 4. Plus lägger direkt i varukorgen om produkten saknar tillvalsgrupper (`requiresConfiguration == false`), annars öppnas modalen.

**ProductCompactCard**: VStack leading spacing 9, padding 10, samma kortstil (hörnradie 18). Bild höjd **118** full bredd (fit, hörnradie 15) med plus-knapp 30x30 (`plus` 12 black) i nedre högra hörnet, padding 7; utan bild bara en 8 pt hög spacer (plusknappen ligger kvar). Namn font 14 black max 2 rader, beskrivning font 11 semibold muted max 2 rader (samma hideDescription-villkor), prisrad spacing 6 med `priceText(effectivePrice)` 13 black + genomstruket ordinarie 11 bold vid rabatt + DpointsPriceBadge.

**DpointsPriceBadge** (delad komponent, `Core/DesignSystem/DeliveraTheme.swift`): visas ENDAST om `product.rewardable == true`. HStack spacing 5: DpointsGlyph 16 (orange rundad kvadrat, hörnradie `0.22 * size`, med en vit 45-graders roterad kvadratram i mitten) + texten `"\(dpointsUnitCost(valuePerKr:extrasTotal:) * quantity) Dpoints"` font 12 black orange. Horisontell padding 8, höjd 26, bakgrund orange opacity 0.09 i Capsule. Default `valuePerKr = 10`, `extrasTotal = 0`, `quantity = 1` (i listorna används defaults, i modalen skickas riktiga värden in).

**Prisformat (`priceText`)**: heltal renderas `"\(Int(value)) kr"`, annars `String(format: "%.2f kr", value)` med punkt ersatt av komma (t.ex. `"79 kr"`, `"79,50 kr"`). API:t levererar redan kr (öre/100 gjort på servern), dela ALDRIG igen.

### 12.11 Flytande varukorgsknapp (cartBar)

Knapp som anropar `onOpenCart`. HStack spacing 12, padding h 16, höjd **64**, bakgrund `ink` hörnradie 18 continuous, skugga svart 0.24 radie 24 y 12, all text vit:

- Antal-cirkel: `"\(cartStore.count)"` font 14 black i orange på vit cirkel 32x32.
- VStack spacing 2: `"Varukorg"` font 15 black + `priceText(cartStore.total)` font 12 bold opacity 0.8.
- Spacer + `chevron.right` 14 black.

### 12.12 Info-sheet (RestaurantInfoSheet)

Sheet med detents `[.medium, .large]` och synlig drag-indikator. NavigationStack, appBackground, ScrollView, VStack leading spacing 18, padding 20.

- Titel `"Restauranginfo"` font 30 black rounded ink, under den restaurangnamnet font 14 bold muted.
- **InfoSection**-kort (rubrik font 17 black ink, innehåll, padding 15, vitt kort hörnradie 18, stroke line, inre spacing 12):
  - `"Kontakt"`: InfoLine-rader (visas bara om värdet finns och inte är tomt): `mappin.circle.fill` / `"Adress"`, `building.2.fill` / `"Stad"`, `phone.fill` / `"Telefon"`.
  - `"Öppettider"`: en textrad per veckodag (font 13 bold, ink opacity 0.78) i ordningen `"Måndag"` till `"Söndag"`, format `"Måndag: 10:00-21:00"` (flera slots joinas med `", "`, slot utan close visar bara open-tiden), stängd/tom dag: `"Måndag: Stängt"`. Om `openingHours.specialCount > 0` läggs InfoLine `calendar.badge.exclamationmark` / `"Avvikande öppettider"` / `"Finns"` till. Saknas öppettider helt: enda raden `"Inga öppettider angivna"`.
  - `"Juridik"`: `doc.text.fill` / `"Juridiskt namn"` (legalName) och `number` / `"Org.nr"` (organizationNumber), båda villkorade på icke-tomt värde.
- **InfoLine**: HStack top spacing 10: ikon 13 black orange i 24 pt bred kolumn, sedan titel font 11 black muted över värde font 13 bold ink.

### 12.13 ViewModel (RestaurantDetailViewModel) och datainladdning

`load(orderMode:deliveryCoordinate:)`:
1. `isLoading = true`, `errorMessage = nil`, `zoneValidationFinished = false`.
2. **Sekventiella** anrop (medvetet inte parallella, `async let` kraschade vid task-teardown): `GET /api/restaurants/:slug` → färsk `Restaurant`, sedan `GET /api/menu/categories?slug=<slug>&v=swift` → `MenuResponse`.
3. `MenuResponse` tål BÅDA svarsformerna: en ren array av kategorier ELLER `{ "categories": [...] }`.
4. Kategorierna **dedupliceras defensivt på id i alla nivåer** (kategorier, produkter, extraGroups, extras; första förekomsten vinner) eftersom dubblett-id:n kraschar ForEach, och kategorier utan produkter filtreras bort. `selectedCategoryID = nil`.
5. Om `orderMode == .delivery` och koordinat finns: zonvalidering (nedan). Annars `zoneAvailable = nil`, `zoneValidationFinished = true`.
6. Vid fel: `errorMessage = "Kunde inte hämta menyn just nu."`, `zoneValidationFinished = true`.

**Zonvalidering** (`POST /api/cities/validate-location` med body `{lat, lng}`):
- Om `response.covered == false`: `zoneAvailable = false`, MEN om `restaurant.isOpen == false` sätts `nil` (stängd-status trumfar zonbannern).
- Annars letas restaurangen upp i `response.cities.flatMap(\.restaurants)` på `id` eller case-insensitive `slug`. Saknas match: samma false/nil-logik som ovan.
- Vid match: `zoneAvailable = true` (nil om matchens `isOpen == false`). Zonöverskrivningar: `zoneDeliveryFee = match.matchedZone?.feeKr ?? match.deliveryFee / 100`, `zoneMinOrderAmount = match.matchedZone?.minOrderKr ?? match.minOrderAmount / 100`, `zoneEtaMinutes = match.matchedZone?.etaMinutes ?? match.etaMinutes`. OBS: just här delas `deliveryFee`/`minOrderAmount` från validate-location med 100 (den endpointen svarar i öre, till skillnad från list/detalj).
- Nätverksfel: `zoneAvailable = nil` (ingen banner). `zoneValidationFinished = true` i defer.

**Härledda värden:**
- `displayDeliveryFee = zoneDeliveryFee ?? restaurant.deliveryFee ?? 0`
- `displayMinOrderAmount = zoneMinOrderAmount ?? restaurant.minOrderAmount ?? 0`
- `displayEtaMinutes = zoneEtaMinutes ?? restaurant.etaMinutes ?? 30`
- `orderingEnabled = RestaurantAvailability.isOrderingEnabled(restaurant) && zoneAvailable != false` (dvs `comingSoon != true && isOpen != false` och inte utanför zonen)
- `visibleCategories`: utgå från alla kategorier; om `selectedCategoryID` är satt behåll bara den; om `searchQuery` (trimmad) inte är tom, filtrera produkter per kategori på case-insensitive träff i `name` ELLER `description` och släng kategorier utan träff.

### 12.14 Produktmodellen (Models/Menu.swift)

`MenuCategory`: `id, name, slug?, description?, imageUrl?, products: [MenuProduct]`.

`MenuProduct`-fält (exakta namn): `id, slug?, name, description?, price: Double, discountActive: Bool?, discountPercent: Double?, discountPrice: Double?, discountLabel: String?, imageUrl?, isVegan: Bool?, isVegetarian: Bool?, isGlutenFree: Bool?, rewardable: Bool?, rewardPointsMultiplier: Double?, rewardPointsPrice: Int?, displayMode: String?, hideDescription: Bool?, extraGroups: [MenuExtraGroup]?`.

- `effectivePrice` = `discountPrice` om `discountActive == true` och discountPrice finns, annars `price`.
- `requiresConfiguration` = `extraGroups` finns och är icke-tom.
- `hasImage` = imageUrl finns och är icke-tom efter trim.
- `dpointsUnitCost(valuePerKr:extrasTotal:)`: om `rewardPointsPrice > 0` returneras det rakt av; annars `Int(ceil(max(0, effectivePrice + extrasTotal) * factor))` där `factor = rewardPointsMultiplier` om den är > 0, annars `valuePerKr`.

`MenuExtraGroup`: `id, name, description?, type: String?` (`"RADIO"` = single-select, annars multi/checkbox), `required: Bool?, minSelections: Int?, maxSelections: Int?, displayStyle: String?` (`"BOX_IMAGE"` = rutnätskort med bilder), `allowQuantity: Bool?, extras: [MenuExtra]`.

`MenuExtra`: `id, name, priceAddon: Double?, isDefault: Bool?, imageUrl: String?` (+ `hasImage` på samma sätt).

`DpointsMe` (`GET /api/dpoints/me`): `enabled: Bool, balance: Int, valuePerKr: Double`.

### 12.15 Öppettider och tillgänglighet (RestaurantAvailability + Restaurant-modellen)

**Dual-shape-parsning** (`RestaurantOpeningHours`): öppettids-JSON kan vara platt `{ "monday": {...}, ... }` ELLER nästlad `{ "regular": { "monday": {...} }, "special": [...] }`. Decodern itererar alla nycklar: nyckeln `"regular"` merge:as in i `days`, nyckeln `"special"` räknas bara (`specialCount` = antal element, innehållet parsas inte), övriga nycklar tolkas som dagnamn direkt. Detta är Swift-motsvarigheten till webbens `oh.regular?.[k] ?? oh[k]`, implementera samma fallback.

**Per dag** (`OpeningDay`): tål tre former: (a) en ren array av slots, (b) objekt med `closed: Bool` + `shifts: [slot]`, (c) objekt med `closed` + `open`/`close`-strängar (blir en slot). `OpeningSlot = { open: String, close: String? }`, tider som `"HH:mm"`.

**Statusregler** (`RestaurantAvailability`):

| Funktion | Logik |
|---|---|
| `statusLabel` | `comingSoon == true` → `"Kommer snart"`. Annars om `pausedUntil` (ISO8601, med eller utan fraktionssekunder) ligger i framtiden → `"Pausad · HH:mm"` (sv_SE, mittpunkt). Annars om `isOpen == false` → nästa-öppning-etikett, fallback `"Stängt"`. Annars `nil` (ingen badge). |
| `nextOpenLabel` | Gå igenom dagens index + 6 framåt (veckodagsnycklar sön-index 0: `sunday, monday, ...`). Hoppa över stängda dagar. Slots filtreras på att `open` innehåller `":"` och sorteras på minuter. Idag: hoppa slots som redan öppnat (`openMinutes <= nowMinutes`), annars `"Öppnar HH:mm"`. Imorgon: `"Öppnar imorgon HH:mm"`. Senare: `"Öppnar <kort dagnamn> HH:mm"` med korta namn `sön, mån, tis, ons, tor, fre, lör`. |
| `isOrderingEnabled` | `comingSoon != true && isOpen != false` |
| `isDimmed` | `comingSoon == true \|\| isOpen == false` |
| `isAccessible` | `comingSoon != true` |

### 12.16 Recensioner (RestaurantReviewsView)

Öppnas som **navigation-push** (inte sheet) när man trycker på rating-raden i heron. Data: `GET /api/restaurants/:slug/reviews` → `RestaurantReviewsResponse { averageRating, totalCount, reviews }`, laddas i `.task`.

- Bakgrund appBackground, ScrollView, VStack leading spacing 18, padding 20.
- Titel `"Recensioner"` font 34 black rounded ink + restaurangnamn font 15 bold muted.
- Sammanfattningsrad: `RatingBadge` (medelvärdet, `response.averageRating` om > 0 annars `restaurant.rating ?? 4.6`) + `"\(totalCount) recensioner"` font 14 black ink.
- **Filterräls** (horisontell chip-rad, font 12 black, höjd 34, horisontell padding 12, Capsule, vald = vit på orange, ovald = ink på vitt med line-stroke): `"Alla"`, `"5 stjärnor"` (rating == 5), `"4+"` (rating >= 4), `"Med kommentar"` (icke-tom trimmad comment), `"Med svar"` (icke-tom trimmad reply).
- Tomt filterresultat: `"Inga skrivna recensioner ännu."` font 14 bold muted i vitt kort (padding 16, hörnradie 18).
- **ReviewRow** (vitt kort hörnradie 18, stroke line, padding 15, spacing 10): kundnamn font 15 black ink; under det upp till 3 `likedItems` joinade med `", "` (font 12 bold muted, 1 rad); höger `star.fill` i gold + `"\(rating ?? 0)"` font 13 black; kommentaren font 14 semibold ink opacity 0.78 lineSpacing 3; restaurangens svar (`reply`) font 13 bold muted i grå bubbla (svart opacity 0.04, hörnradie 12, padding 10).
- Laddning: 4 redacted skeleton-kort höjd 116. Fel: `NoticeBanner` med `"Kunde inte hämta recensioner."`.

### 12.17 Byt-restaurang-alert

Om varukorgen redan tillhör en annan restaurang (`cartStore.requiresRestaurantSwitch(to:)`) sparas tillägget som `PendingCartAdd { product, extras, quantity, paidWithPoints, dpointsUnitCost }` och en alert visas:

- Titel: `"Töm varukorgen från föregående restaurang?"`
- Meddelande: `"Du har redan artiklar från \(cartStore.restaurant?.name ?? "en annan restaurang"). Vill du tömma den och börja från \(model.restaurant.name)?"`
- Knappar: `"Nej"` (cancel, nollar pending) och `"Ja"` (destructive: `cartStore.replaceCartContext(...)` med samma parametrar som configure, sedan `cartStore.add(...)` med pending-värdena, stäng modalen).

Vid normalt tillägg (samma restaurang): `cartStore.configure(...)` följt av `cartStore.add(product:extras:quantity:paidWithPoints:dpointsUnitCost:)`, sedan `selectedProduct = nil` (stänger modalen).

## 13. Produktmodalen (ProductQuickView)

### 13.1 Presentation

- SwiftUI-sheet via `.sheet(item: $selectedProduct)`, detents `[.fraction(0.92), .large]`, synlig drag-indikator. (Standard sheet-animation, ingen egen öppningsanimation.)
- Öppnas genom tap på produktrad/kompaktkort, genom plus-knappen när produkten HAR tillvalsgrupper, samt vid auto-öppning (`autoOpenProductId`, 350 ms fördröjning). Plus på produkt UTAN tillvalsgrupper lägger direkt i varukorgen med quantity 1 utan att öppna modalen.
- Props: `product: MenuProduct`, `restaurantIsOrderingEnabled: Bool`, `initialExtras: [SelectedExtra] = []`, `initialQuantity = 1`, `primaryActionTitle = "Lägg till"` (kan overridas, t.ex. vid redigering från varukorgen), `onAdd: ([SelectedExtra], Int, Bool, Int?) -> Void` (extras, quantity, paidWithPoints, dpointsUnitCost).
- State: `selectedExtras: [SelectedExtra]`, `quantity` (start 1), `selectionError: String?`, `dpoints: DpointsMe?` (hämtas i `.task` via `GET /api/dpoints/me`, fel sväljs tyst).
- `onAppear` och vid ändring av `product.id`/`initialQuantity` körs `resetConfiguration()`: `selectedExtras = initialExtras` om icke-tom, annars default-extras (alla extras med `isDefault == true` i alla grupper, quantity 1); `quantity = max(1, initialQuantity)`; `selectionError = nil`.

### 13.2 Layout

`VStack(spacing: 0)` med scrollande innehåll överst och fast CTA-panel i botten. Bakgrund appBackground.

**Scrollinnehåll** (VStack leading spacing 16, padding h 20, top 20, bottom 18):

1. **Produktbild** (om `hasImage`): RemoteImage fit, höjd **210**, full bredd, vit bakgrund, hörnradie 20 continuous.
2. **Rubrikblock** (spacing 8): namn font 28 black rounded ink; `DpointsPriceBadge(product:valuePerKr:extrasTotal:quantity:)` med live-värden (`dpoints?.valuePerKr ?? 10`, aktuell extras-summa, aktuellt antal), visas bara om `rewardable == true`; beskrivning (om `hideDescription != true` och icke-tom) font 14 semibold muted lineSpacing 3.
3. **En `ExtraGroupView` per tillvalsgrupp** (13.3).
4. **StepperRow** (antal, 13.5).
5. **Valideringsfel** (om satt): font 12 black i orange, horisontell padding 2.

**CTA-panelen** (VStack spacing 10, padding 20, bakgrund `.ultraThinMaterial`): se 13.6.

### 13.3 Tillvalsgrupper (ExtraGroupView)

Varje grupp är ett vitt kort: padding 14, hörnradie 18 continuous, stroke line, inre spacing 12.

**Grupphuvud:** gruppnamn font 17 black ink, under det `"Obligatoriskt"` om `required == true` annars `"Valfritt"` (font 12 bold muted). Till höger, ENDAST om `maxSelections > 1` ELLER `allowQuantity == true`: räknaren `"\(selectionCount)/\(maxSelections ?? 99)"` font 12 black orange. `selectionCount` = summan av valda quantities i gruppen om `allowQuantity`, annars antal valda rader.

**Visa mer/färre:** om gruppen har fler än 8 extras visas bara de 8 första tills man expanderar. Knapp full bredd, höjd 38, font 13 black orange, bakgrund orange opacity 0.08 i Capsule, text `"Visa mer"` / `"Visa färre"`, togglas med spring(response 0.32, damping 0.88).

**displayStyle-varianter:**

a) **`BOX_IMAGE`** (case-insensitive jämförelse mot `group.displayStyle`): `LazyVGrid` med **2 kolumner om gruppen har <= 2 extras, annars 3**, spacing 8. Varje `ExtraBoxOptionCard`:
   - Kortet är en toggle-knapp: VStack spacing 7 med bild (om `extra.hasImage`: fit, höjd 54, full bredd), namn font 12 black ink centrerat max 2 rader minScale 0.78, samt pris `"+\(priceText(priceAddon))"` font 11 black muted ENDAST om `priceAddon > 0`.
   - Padding 9, minHeight **126** med bild / **82** utan, hörnradie 15 continuous.
   - Vald (selected eller quantity > 0): bakgrund orange opacity 0.1, stroke orange 1.5 px. Ovald: vit bakgrund, stroke line 1 px.
   - Om `allowQuantity == true` visas under kortet en mini-stepper: minus/plus 24x24 (ikon 10 black, minus disabled vid 0), antal font 12 black bredd 16, spacing 7, bakgrund svart opacity 0.05 Capsule, färg ink.

b) **Standard (radlista)**: VStack spacing 8 av `ExtraOptionRow` (vertikal padding 2 per rad):
   - Toggle-knapp över hela raden: ikon 18 bold, för `type == "RADIO"`: `largecircle.fill.circle` (vald) / `circle`; annars `checkmark.square.fill` / `square`. Vald ikon orange, ovald muted opacity 0.7. Namn font 14 bold ink 1 rad. Höger: `"+\(priceText(priceAddon))"` font 12 black muted endast om `priceAddon > 0`.
   - Om `allowQuantity == true`: stepper till höger, minus/plus 26x26 (ikon 11 black), antal font 13 black bredd 18, spacing 8, svart opacity 0.05 Capsule.

### 13.4 Urvalslogik

`SelectedExtra` (det som lagras per val): `{ groupId, groupName, extraId, name, price: Double (= extra.priceAddon ?? 0), quantity: Int }`, `id = "\(groupId)-\(extraId)"`, `total = price * quantity`.

**Toggle (`toggleExtra`)**, nollar alltid `selectionError` först:
- `allowQuantity == true`: tap togglar via quantity-vägen: om extran redan är vald sätts delta till minus hela nuvarande quantity (avmarkera), annars +1.
- `type == "RADIO"`: tap på redan vald gör inget; annars ersätts gruppens alla val med det nya (exakt ett val per RADIO-grupp).
- Checkbox (övriga): tap på vald tar bort den; tap på ovald lägger till ENDAST om `selectedCount(gruppen) < (maxSelections ?? 99)` (tyst stopp, inget felmeddelande vid tak).

**Quantity-ändring (`updateQuantityExtra`)**: `nextQuantity = max(0, min(current + delta, (maxSelections ?? 99) - summan av övriga extras quantities i gruppen))`, dvs taket delas av hela gruppen. Extran tas bort helt vid 0, annars skrivs den om med nya antalet.

### 13.5 Antal-stepper (StepperRow)

Vitt genomskinligt kort (bakgrund vit opacity 0.76, hörnradie 18 continuous, stroke line, padding 14). Vänster: `"Antal"` font 16 black ink. Höger: kapsel (vit, line-stroke) med minus/plus 34x34 och antalet font 16 black bredd 24, spacing 10, färg ink. Minus disabled vid quantity <= 1 (`quantity = max(1, quantity - 1)`), plus obegränsad.

### 13.6 Priser, Dpoints och CTA-knappar

**Beräkningar (exakta formler):**
- `extrasTotal = summan av selectedExtras.map { price * quantity }`
- `totalPrice = (product.effectivePrice + extrasTotal) * quantity` (kontraktet pris x antal, samma överallt)
- `dpointsUnitCost = product.dpointsUnitCost(valuePerKr: dpoints?.valuePerKr ?? 10, extrasTotal: extrasTotal)` (se 12.14)
- `dpointsCost = dpointsUnitCost * quantity`
- `canBuyWithDpoints = dpoints?.enabled == true && product.rewardable == true && dpointsCost > 0 && (dpoints?.balance ?? 0) >= dpointsCost && restaurantIsOrderingEnabled`

**Dpoints-knappen** (visas endast om `canBuyWithDpoints`): vit knapp höjd 52, hörnradie 16 continuous, stroke `gold` opacity 0.7, font 15 black ink. Innehåll: DpointsGlyph 18 + `"Köp med Dpoints"` + Spacer + `"\(dpointsCost) Dpoints"`. Vid tap: validera (13.7), sedan `onAdd(selectedExtras, quantity, true, dpointsUnitCost)`.

**Primärknappen**: höjd 56, hörnradie 16 continuous, font 16 black vit, horisontell padding 16. Text vänster: `primaryActionTitle` (default `"Lägg till"`) om `restaurantIsOrderingEnabled`, annars `"Stängt"`. Text höger: `priceText(totalPrice)`. Bakgrund orange när ordering är på, annars muted, och knappen är disabled. Vid tap: validera, sedan `onAdd(selectedExtras, quantity, false, nil)`.

### 13.7 Validering (validateSelection)

Körs före båda CTA:erna, itererar alla grupper som har extras, i ordning. Första felet visas och stoppar:

| Villkor | Felsträng (exakt) |
|---|---|
| `required == true` och 0 valda i gruppen | `"Välj \(group.name.lowercased())."` |
| valda < `minSelections ?? 0` | `"Välj minst \(minSelections) i \(group.name)."` |
| valda > `maxSelections ?? 99` | `"Välj max \(maxSelections) i \(group.name)."` |

Lyckad validering nollar felet och returnerar true.

### 13.8 Vad som skickas till varukorgen

`onAdd` går via `requestCartAdd` i RestaurantDetailView (inkl. byt-restaurang-flödet i 12.17) till `cartStore.add(product:extras:quantity:paidWithPoints:dpointsUnitCost:)`. Radmodellen (`CartDraftItem`) som skapas:

| Fält | Värde |
|---|---|
| `lineKey` | `"\(productID)#\(paidWithPoints ? "points" : "cash")#\(extrasKey)"` där extrasKey = extras sorterade på id, formaterade `"\(id):\(quantity)"`, joinade med `"\|"` |
| `productID` / `product` / `name` | från produkten (hela MenuProduct sparas med) |
| `unitPrice` | **0 om `paidWithPoints`**, annars `product.effectivePrice` |
| `extras` | `[SelectedExtra]` som valdes |
| `quantity` | valt antal |
| `paidWithPoints` | true vid Dpoints-köp |
| `dpointsUnitCost` | poängkostnad per enhet vid Dpoints-köp, annars nil |

Finns redan en rad med samma `lineKey` ökas dess quantity med tillägget i stället för att skapa en ny rad. Radens `unitTotal = 0` om paidWithPoints, annars `unitPrice + summan av extras.total`; `total = unitTotal * quantity`. Efter lyckat tillägg stängs modalen (`selectedProduct = nil`).

Specialönskemål/note-fält per produkt finns INTE i modalen (implementera inte något).
## 14. CartStore (varukorgens tillstånd)

`CartStore` är en `@MainActor final class CartStore: ObservableObject`. All prislogik i klienten räknar i KRONOR (API:t har redan dividerat öre /100). Alla `@Published`-fält utom feedbackfälten triggar persistens via `didSet { persist() }`.

### Published-fält

| Fält | Typ | Default | Persisteras |
|---|---|---|---|
| `items` | `[CartDraftItem]` | `[]` | Ja |
| `restaurant` | `Restaurant?` | `nil` | Ja (som snapshot) |
| `orderMode` | `OrderMode` (.delivery/.pickup) | `.delivery` | Ja (rawValue-sträng) |
| `address` | `String` | `""` | Ja |
| `deliveryFee` | `Double` (kr) | `0` | Ja |
| `deliveryCoordinate` | `Coordinate?` (lat/lng) | `nil` | Ja (lat+lng separat) |
| `recommendedProducts` | `[MenuProduct]` | `[]` | Nej (byggs om vid configure) |
| `appliedDiscount` | `DiscountValidationResponse?` | `nil` | Ja |
| `discountError` | `String?` | `nil` | Nej |
| `discountSuccess` | `String?` | `nil` | Nej |
| `isApplyingDiscount` | `Bool` | `false` | Nej |

Alla setters är `private(set)`, mutation sker via metoder.

### CartItem-strukturen (CartDraftItem)

Definieras i `RestaurantDetailViewModel.swift`. `Identifiable, Codable, Hashable`.

| Fält | Typ | Kommentar |
|---|---|---|
| `id` | `UUID` | genereras vid skapande |
| `lineKey` | `String` | dedupe-nyckel, se nedan |
| `productID` | `String` | |
| `product` | `MenuProduct` | hela produkten sparas i raden |
| `name` | `String` | `product.name` vid tillägg |
| `unitPrice` | `Double` | `product.effectivePrice`, MEN `0` om `paidWithPoints` |
| `extras` | `[SelectedExtra]` | |
| `quantity` | `Int` | enda muterbara fältet (`var`) |
| `paidWithPoints` | `Bool` | Dpoints-köpt rad |
| `dpointsUnitCost` | `Int?` | poängkostnad per styck för poängrader |

`SelectedExtra`: `groupId: String`, `groupName: String`, `extraId: String`, `name: String`, `price: Double`, `quantity: Int`. Beräknade: `id = "\(groupId)-\(extraId)"`, `total = price * quantity`.

Radprisformler:
- `unitTotal` = `0` om `paidWithPoints`, annars `unitPrice + summa(extras.total)` (extras.total = `price * quantity` per extra).
- `total` = `unitTotal * quantity`.

`lineKey` (statisk funktion): extras sorteras på `id`, mappas till `"\(id):\(quantity)"`, joinas med `|`. Nyckeln blir `"\(productID)#\(paidWithPoints ? "points" : "cash")#\(extrasKey)"`. `add()` slår ihop rader med samma lineKey genom att öka quantity, annars ny rad.

### Beräknade värden

| Namn | Formel |
|---|---|
| `count` | summa av alla `quantity` |
| `subtotal` | summa av alla `item.total` |
| `discount` | 0 om ingen `appliedDiscount`. Annars `codeDiscount = max(0, appliedDiscount.discountAmount ?? 0)`, `deliveryDiscount = deliveryFee om freeDelivery == true annars 0`, resultat = `min(subtotal + deliveryFee, codeDiscount + deliveryDiscount)` |
| `vatRate` | `restaurant?.vatPercent ?? 12` |
| `vatAmount` | `subtotal * vatRate / (100 + vatRate)` (moms ingår i priset) |
| `total` | `max(0, subtotal + deliveryFee - discount)` |

### Persistens

Nyckel: `UserDefaults`-nyckeln `"delivera.swift.cart.v1"`. Varje mutation JSON-encodar en `CartSnapshot`:

```
{ items, restaurant (CartRestaurantSnapshot?), orderModeRawValue, address,
  deliveryFee, deliveryLatitude?, deliveryLongitude?, appliedDiscount }
```

`CartRestaurantSnapshot` speglar alla Restaurant-fält: `id, name, slug, cuisine, description, address, city, phone, latitude, longitude, selfDelivery, legalName, organizationNumber, imageUrl, heroImageUrl, rating, ratingCount, deliveryFee, minOrderAmount, vatPercent, etaMinutes, isOpen, comingSoon, pausedUntil, featuredClass, tags` (openingHours återställs som `nil`).

`restore()` körs i `init()`: läser snapshot, sätter fälten, tvingar `deliveryFee = 0` om orderMode är pickup. Korgen ÖVERLEVER alltså appomstart, inklusive tillämpad rabattkod.

### Konfigurering och en-restaurang-regeln

- `configure(restaurant:orderMode:address:deliveryFee:deliveryCoordinate:categories:)` sätter kontext + bygger `recommendedProducts`. Om `requiresRestaurantSwitch(to:)` är sant gör den INGENTING (tidig return), anroparen måste själv visa byt-restaurang-dialog.
- `requiresRestaurantSwitch(to:)` = `true` om korgen har items OCH nuvarande restaurang-id skiljer sig från den nya.
- `replaceCartContext(...)` = "ja, byt": tömmer `items`, nollar `appliedDiscount/discountError/discountSuccess`, sätter ny kontext.
- `updateFulfillment(orderMode:address:deliveryFee:deliveryCoordinate:)` uppdaterar bara leveransläget. Pickup tvingar alltid `deliveryFee = 0` (i configure, replaceCartContext, updateFulfillment och restore).

### Mutationer

- `add(product:extras:quantity:paidWithPoints:dpointsUnitCost:)`, defaults `extras=[], quantity=1, paidWithPoints=false, dpointsUnitCost=nil`. Merge på lineKey.
- `replace(item:with:extras:quantity:paidWithPoints:dpointsUnitCost:)` = `remove` + `add` (används av redigeringsmodalen).
- `increment(item)` +1. `decrement(item)`: om quantity <= 1 tas raden bort, annars -1. `remove(item)` på id.
- `firstItem(for product:)` = första raden med samma `productID`.
- `clear()` nollar ALLT: items, restaurant, address, deliveryFee, deliveryCoordinate, recommendedProducts, appliedDiscount, discountError, discountSuccess. (Anropas efter lyckad betalning.)
- `clearDiscount()` nollar appliedDiscount + båda feedbackfälten. `clearDiscountFeedback()` nollar bara error/success (används när en vänkod lyckas i stället).

### Rabattkod: applyDiscount(code:)

1. Trimma. Tom sträng: `appliedDiscount = nil`, `discountError = "Skriv en rabattkod först."`, return.
2. `isApplyingDiscount = true`, nolla error/success, `defer` sätter false.
3. `POST /api/discount/validate` med body `{ code, subtotal }` (subtotal i kr, Double).
4. Svar `DiscountValidationResponse`: `{ valid: Bool, code: String, description?, type?, value?, discountAmount?, minOrder?, freeDelivery? }`.
5. `valid == false`: `appliedDiscount = nil`, `discountError = "Rabattkoden gäller inte."`.
6. Lyckat: `appliedDiscount = response`, `discountSuccess = "\(code versalerad) är tillagd."` (t.ex. "SOMMAR10 är tillagd.").
7. Nätverksfel/serverfel: `appliedDiscount = nil`, `discountError = error.localizedDescription` (serverns `error`-fält bubblar upp som `APIError.message`).

### Rekommendationer ("Ofta köpta med")

Byggs vid `configure`/`replaceCartContext` från menyns kategorier:
1. Platta ut alla produkter, filtrera `0 < effectivePrice < 70` kr, dedupe på produkt-id.
2. Tre hinkar: >= 45 kr, 25 till 44.99 kr, < 25 kr.
3. Inom varje hink: produkter MED bild först (shufflade), sedan utan bild (shufflade).
4. Interleava hinkarna rund-robin (hög, mellan, låg, hög, mellan, låg, ...).

### Gäst-fälten

Bor INTE i CartStore utan i CartView som `@AppStorage`: `"delivera.cart.guestName"`, `"delivera.cart.guestPhone"`, `"delivera.cart.note"`. De persisteras alltså i UserDefaults och överlever appomstart. Noteringen delas mellan sessioner.

### API-strukturer definierade i CartStore.swift (delade kontrakt)

- `MyDealsRequest { subtotalKr: Double, deliveryFeeKr: Double, orderMode: String, restaurantId: String? }`
- `MyDealsResponse { deals: [MyDealItem] }`
- `MyDealItem { userDealId, title, valueLabel?, favoritePercent?, applicable: Bool, reason?, minOrderKr?, discountAmountKr: Double, deliveryDiscountKr?, dpointsBonus: Int, freeDelivery? }`, `id = userDealId`
- `AppDealQuoteRequest { userDealId, subtotalKr, deliveryFeeKr, orderMode, restaurantId? }` och `AppDealQuoteResponse { applicable, reason?, minOrderKr?, discountAmountKr, deliveryDiscountKr, subtotalDiscountKr, dpointsBonus, deal: HomeAppDeal? }` (quote-endpointen `POST /api/deals/app/quote` finns i API-klienten men kassan använder numera my-deals-listan, se 15)
- `CartOrderRequest`, `CartOrderItemRequest`, `CartOrderExtraRequest`, `CartOrderResponse` (se 15)
- `AdyenPaymentCreateRequest/Response`, `AdyenSession { id, sessionData }`, `AdyenVerifyRequest/Response`, `AbandonOrderRequest { phone? }`
- `AuthenticatedCustomerProfile { id?, name?, firstName?, lastName?, phone?, email? }` med `displayName` = "firstName lastName" om ifyllda, annars `name`, annars `"Kund"`
- `FlexibleOrderNumber`: decodar orderNumber som String ELLER Int ELLER Double till en sträng

## 15. CartView (kassan) uppifrån och ner

Props: `cartStore`, `isLoggedIn: Bool`, `dpointsEarnRate: Double = 0`, callbacks `onPaymentCompleted(ActiveHomeOrder)`, `onExploreRestaurants()`, `onPickRecommended(MenuProduct)`, `onEditItem(CartDraftItem)`.

Bakgrund: `DeliveraTheme.appBackground`, en LinearGradient topLeading till bottomTrailing med stoppen `#FCFAF2`, `#F5FAF5`, `#FCF5ED`. Färger som används: orange `#F04F1A`, ink `#0F0F12`, muted `#6E6B66`, gold `#F0BA5C`, dealBlue `#1287F5`, dealBlueDeep `#0A54D9` (dealBlueGradient = dealBlue till dealBlueDeep, topLeading till bottomTrailing), line = svart 6.5% opacitet.

Layout: ScrollView (vertikal, inga indikatorer), VStack spacing 18, horisontell padding 20, topp-padding 18, botten-padding 112. `scrollDismissesKeyboard(.interactively)`. Tangentbords-toolbar med Spacer + knapp `"Klar"` (14, black) som släpper fokus.

Prisformat överallt: `priceText(value)` = heltal ger `"\(Int) kr"`, annars `"%.2f kr"` med punkt ersatt av komma (t.ex. "129,50 kr").

### Sektionsordning

Header alltid överst. Om korgen är tom visas empty state. Annars, med entrance-animation (opacity 0 till 1, y-offset 14 till 0, scale 0.988 till 1, spring response 0.46 dampingFraction 0.86) med stigande delay:

| # | Sektion | Delay |
|---|---|---|
| 1 | orderModeCard | 0 |
| 2 | contactSection (bara gäst) | 0.04 |
| 3 | itemsSection | 0.08 |
| 4 | frequentlyBoughtSection | 0.12 |
| 5 | collapsedFields (notering, kod, dricks) | 0.16 |
| 6 | appDealSection | 0.18 |
| 7 | totalsSection | 0.2 |

### Header

`"Varukorg"` (34, black, rounded, ink). Under: restaurangens namn eller `"Lägg till något gott"` (14, bold, muted).

### Empty state

Animerad TimelineView-scen (höjd 250): 3 koncentriska cirkelringar (stroke 1.4, växlande orange/gold 18% opacitet, diameter 118/176/234, andas med scaleEffect `1 + 0.035*sin`), tre flytande brickor 56x56 (symboler `takeoutbag.and.cup.and.straw.fill` orange, `fork.knife` gold, `sparkles` grön `#2B7D4F`; vit 90% bakgrund, hörnradie 20, line-stroke, svag skugga, gungar med sin/cos), central orange kvadrat 112x112 (hörnradie 36, gradient orange till `#FA802E`, roterar -3 till +3 grader, skugga orange 28% radie 30 y18) med vit `bag.fill` (42, black) som guppar -3/+3 y, plus en roterande DpointsGlyph (30) i omloppsbana. Gungningen drivs av `withAnimation(.easeInOut(duration: 1.35).repeatForever(autoreverses: true))` vid onAppear.

Texter: `"Redo när du är"` (30, black, rounded, ink), `"Hitta något gott och bygg din nästa beställning."` (14, bold, muted, centrerad). Knapp: ikon `safari.fill` + `"Utforska restauranger"` (15, black, vit text, orange Capsule, padding h18 v16) som kör `onExploreRestaurants`.

### orderModeCard

HStack spacing 12, padding 15, vit bakgrund hörnradie 18 (continuous), line-stroke 1. Ikon `cartStore.orderMode.systemImage` (17, black, orange) i cirkel 42x42 med orange 12% bakgrund. Titel: `"Leverans"` eller `"Avhämtning"` (15, black, ink). Underrad: adressen vid leverans, annars `"Hämtas hos restaurangen"` (12, bold, muted, max 2 rader). Ej klickbar (adress ändras inte här).

### contactSection (endast gäst, `!isLoggedIn`)

`CollapsibleSection` med titel `"Kontakt"`, symbol `person.crop.circle`, expanderad som default (`showContact = true`). Innehåll: två `CartTextField` med placeholders `"Namn"` (default-tangentbord) och `"Telefonnummer"` (phonePad). CartTextField: 14 semibold, h-padding 12, höjd 46, bakgrund svart 3.5%, hörnradie 14. Värdena binds till AppStorage `delivera.cart.guestName`/`delivera.cart.guestPhone`.

CollapsibleSection generellt: vit panel, padding 15, hörnradie 18, line-stroke; header-knapp med orange symbol + titel (15, black, ink) + chevron.down som roterar 180 grader; toggle animeras med spring response 0.32 dampingFraction 0.84.

### itemsSection

Rubrik `"Artiklar"` (18, black, ink). Per rad `CartItemRow` (hela raden är en knapp):
- Tap: om ett textfält har fokus släpps bara fokus, annars `onEditItem(item)` (öppnar produktmodalen för redigering, som använder `cartStore.replace`).
- Vänster kolumn: namn (15, black, ink); extras som `"2x Extra ost, 1x Bacon"` (`"\(quantity)x \(name)"` joinat med `", "`, 12 semibold muted, max 3 rader); pris: om `paidWithPoints` visas DpointsGlyph(15) + `"\(dpointsUnitCost ?? 0) Dpoints"` (13, black, orange), annars `priceText(unitTotal)` (13, black, ink). Observera: radens visade pris är per styck (unitTotal), inte gånger antal.
- Höger: stepper i Capsule (svart 5% bakgrund): minus-knapp (11, black, 28x28), quantity (13, black, bredd 18), plus-knapp (28x28). Minus vid quantity 1 tar bort raden (decrement-logiken). Ingen separat ta bort-knapp.
- Kortstil: padding 14, vit, hörnradie 18, line-stroke.

### frequentlyBoughtSection (upsell)

Visas när `recommendedProducts` inte är tom. Rubrik: `"Glömde du drycken?"` om korgen SAKNAR dryck men rekommendationerna innehåller dryck, annars `"Ofta köpta med"` (18, black, ink). Dryck detekteras med gemen-substring mot nyckelorden: `dryck, läsk, cola, fanta, sprite, vatten, juice, ramlösa, loka, zero, champis, trocadero`.

Horisontell scroll (inga indikatorer), HStack spacing 10, trailing-padding 20. Kort `RecommendedProductCard`: bredd 124, padding 10, vit, hörnradie 18, line-stroke; ev. bild 104x78 (contentMode fit, hörnradie 14); namn (12, black, ink, max 2 rader); pris (12, black, orange) + DpointsPriceBadge. Tap kör `onPickRecommended(product)` (öppnar produktmodal, lägger inte direkt i korg).

### collapsedFields

Tre CollapsibleSections i VStack spacing 10, alla hopfällda som default:

1. `"Extra notering"`, symbol `text.bubble`. TextField placeholder `"Ex. ring inte på dörren"` (flerradig, axis .vertical, 14 semibold, padding 12, svart 3.5% bakgrund, hörnradie 14). Binder AppStorage `delivera.cart.note`.
2. `"Rabatt- eller vänkod"`, symbol `ticket`. En rad: CartTextField placeholder `"Kod"` med `.textInputAutocapitalization(.characters)` + knapp `"Checka"` (13, black, vit text, 82x46, orange, hörnradie 14; visar vit ProgressView när `isApplyingDiscount`, knappen disabled då). Feedback under fältet (12, black):
   - `discountSuccess` med `checkmark.circle.fill`, grön.
   - `discountError` med `exclamationmark.circle.fill`, orange.
   - `referralRedeemMessage` med `person.2.fill` (grön) vid succé eller `exclamationmark.circle.fill` (orange) vid fel.
3. `"Dricks"`, symbol `heart`. Fyra knappar för 0/10/20/30: label `"Ingen"` för 0 annars `"10 kr"` osv (12, black), höjd 36, Capsule, vald = orange med vit text, ovald = svart 4.5% med ink-text. Vald dricks läggs på betalsumman (inte på cartTotal-rabattbasen).

### Kodfältet: rabattkod OCH väns referral-kod (fallback-ordningen)

`applyCode()`:
1. Trimma koden, nolla `referralRedeemMessage`.
2. Kör ALLTID `cartStore.applyDiscount(code:)` först, dvs `POST /api/discount/validate` body `{ code, subtotal }`.
3. Om `appliedDiscount` fortfarande är nil (rabattkoden misslyckades), koden inte tom och kunden är inloggad: prova `POST /api/account/redeem-code` (Bearer-token) med body `{ code }`.
4. Svar `RedeemReferralResponse { ok: Bool, inviterName?, dealsCreated?, userDealId? }`. Kräver `ok == true` och icke-tomt `userDealId`, annars behålls rabattkodens felmeddelande.
5. Vid succé: `cartStore.clearDiscountFeedback()` (döljer "Rabattkoden gäller inte."), sätt `activeUserDealId = userDealId`, `activeUserDealSnapshot = ""`, kör `refreshMyDeals()` (dealen appliceras alltså direkt i kassan), meddelande `"Kod från \(namn) aktiverad. Ha så gott!"` där namn = `inviterName` eller `"en vän"`, plus haptics `UINotificationFeedbackGenerator .success`.
6. Vid `APIError.message`: om meddelandet INTE innehåller "hittades inte" (case-insensitive) visas serverns text som referral-fel (t.ex. "Du har redan använt en referral-kod") och rabattkodsfelet döljs. Innehåller det "hittades inte" behålls rabattkodens generiska fel. Andra fel sväljs tyst.

### Aktiv deal (appDealSection)

AppStorage-kontraktet: `delivera.activeUserDealId` (String) och `delivera.activeUserDealSnapshot` (JSON-sträng av HomeAppDeal), delade med hemskärmens DealsRail, profilens Mina deals och favorit-flödet. Kassan LÄSER id:t och nollar alltid snapshot när den själv sätter/byter deal.

Hämtning: `.task(id: appDealQuoteKey)` kör `refreshMyDeals()`. Nyckeln är `"\(Int(subtotal*100))|\(Int(deliveryFee*100))|\(orderMode.rawValue)|\(restaurantId eller "")|\(items.count)"`, dvs omkörning när korgens innehåll/belopp/läge/restaurang ändras, MEDVETET inte när valet ändras (val är lokalt). Ingen explicit debounce, SwiftUI:s task-id ger avbrytning av pågående anrop.

`refreshMyDeals()`: kräver inloggad + icke-tom korg, annars `myDeals = []`. Anropar `POST /api/deals/app/my-deals` (Bearer) med body `{ subtotalKr, deliveryFeeKr, orderMode: "DELIVERY"|"PICKUP", restaurantId }`. Svar: lista av `MyDealItem` (fält i 14). Vid nätverksfel behålls gamla listan (servern validerar ändå vid order). Efter svar körs `reconcileSelection()`: om vald deal fortfarande finns och är applicable behålls den; annars väljs automatiskt FÖRSTA applicerbara dealen; finns ingen nollas `activeUserDealId` + snapshot. En enda deal blir alltså automatiskt vald.

(Det äldre singel-quote-anropet `POST /api/deals/app/quote` med `AppDealQuoteRequest` finns kvar i API-klienten men används inte av kassan.)

UI: visas bara om inloggad och `myDeals` inte tom. Rubrik med `ticket.fill` (14, black, dealBlue) + `"Dina erbjudanden"` (flera) eller `"Ditt erbjudande"` (en) (15, black, ink). Per deal en rad-knapp:
- Ikonplatta 40x40 hörnradie 13: dealBlueGradient om applicable annars svart 8%; symbol `bicycle` om `freeDelivery == true` annars `ticket.fill` (15, black, vit/muted).
- Titel (14, black rounded, ink om applicable annars muted, 1 rad). Statusrad (12, semibold, grön om applicable annars muted, max 2 rader), text från `dealRowStatus`:
  - Applicable: delar joinas med `" · "`. Med `favoritePercent > 0`: `"\(percent)% på din favorit (−\(priceText(discountAmountKr)))"`. Annars om `discountAmountKr > 0`: `"−\(priceText(...)) på den här ordern"`. Om `dpointsBonus > 0` läggs `"+\(dpointsBonus) Dpoints"` till. Tomt ger `"Gäller den här beställningen"`.
  - Ej applicable per `reason`: `MIN_ORDER` ger `"Handla för minst \(minOrderKr) kr"`, `RESTAURANT_SCOPE` ger `"Gäller hos en annan restaurang"`, `ALREADY_FREE_DELIVERY` ger `"Leveransen är redan gratis här"`, `PICKUP_ONLY` ger `"Gäller vid leverans, inte avhämtning"`, default `"Kan inte användas här"`.
- Vid reason `MIN_ORDER` med minOrderKr > 0: progressbar (höjd 5, Capsule, svart 6% spår, orange fyllnad, bredd = min(1, subtotal/minOrder) av radbredden, minst 6pt).
- Höger: val-indikator bara för applicable: `checkmark.circle.fill` (vald, dealBlue) eller `circle` (line-färg), 20 black.
- Radstil: padding 12, vit, hörnradie 18; stroke dealBlue 2pt vid vald annars line 1pt. Ej applicable rader är disabled.
- Tap: vald deal togglas av (`clearActiveAppDeal`, nollar id + snapshot), annars väljs den (`selectDeal`: sätter id, nollar snapshot, `UISelectionFeedbackGenerator` haptics).

Rabattförhandsvisning: `appDealDiscountPreview = min(selectedDeal.discountAmountKr, subtotal + deliveryFee)` om vald deal är applicable, annars 0. `selectedDeal` = deal i listan med `userDealId == activeUserDealId`.

Ingen welcome-offer-toggle och ingen Dpoints-inlösen finns i kassan. Dpoints förekommer bara som (a) poängköpta rader (`paidWithPoints`) och (b) intjänings-uppskattningen nedan.

### totalsSection (prissummeringen)

Vit panel, padding 16, hörnradie 20, line-stroke, kortskugga. `TotalLine` = HStack titel/Spacer/värde; normal rad 13 bold muted, prominent 18 black ink. Rad för rad:

| Villkor | Label | Värde |
|---|---|---|
| alltid | `"Subtotal"` | `priceText(subtotal)` |
| alltid | `"Leverans"` | `priceText(displayedDeliveryFee)` (0 vid pickup) |
| `appliedDiscount != nil` | `"Rabatt"` | `"-\(priceText(discount))"`, eller `"0 kr"` om discount är 0 |
| `appDealDiscountPreview > 0` | `"Din deal"` | `"-\(priceText(appDealDiscountPreview))"` |
| inloggad och `estimatedEarnedPoints >= 1` | DpointsGlyph(15) + `"Du får ~\(poäng) Dpoints tillbaka"` | (12, black, orange) |
| alltid | `"Moms \(Int(vatRate))%"` | `priceText(vatAmount)` |
| Divider | | |
| alltid | `"Totalt"` (prominent) | `priceText(displayedPaymentTotal)` |

Beräkningar: `displayedDeliveryFee` = 0 vid pickup annars `cartStore.deliveryFee`. `displayedCartTotal = max(0, subtotal + displayedDeliveryFee - cartStore.discount - appDealDiscountPreview)`. `displayedPaymentTotal = displayedCartTotal + tip`. `estimatedEarnedPoints = Int(((max(0, subtotal - discount - appDealDiscountPreview)) * dpointsEarnRate).rounded())` (leverans/dricks räknas inte, servern är facit).

Eventuellt `paymentError` visas som Label med `exclamationmark.circle.fill` (12, black, orange) ovanför knappen.

Betalknapp: höjd 58, ink-bakgrund, hörnradie 18, vit text. Vänster: vit ProgressView + `"Väntar"` när `isStartingPayment`, annars `"Betala"` (17, black). Höger: totalbeloppet (19, black, rounded). Disabled under start.

Ingen klientvalidering av minOrder finns i kassan (servern validerar; min-order syns bara i deal-radernas progress).

### Orderskapande: startAdyenPayment()

Valideringar i ordning, alla sätter `paymentError` och avbryter:
1. Ingen restaurang: `"Välj en restaurang först."`
2. Gäst med trimmat namn < 2 tecken: expandera Kontakt, `"Skriv namn innan betalning."`
3. Gäst med trimmat telefonnummer < 6 tecken: expandera Kontakt, `"Skriv ett giltigt telefonnummer."`

Sedan `isStartingPayment = true` (defer false). Om `pendingPaymentOrderId` redan finns (kunden stängde betalsheeten och tryckte igen) körs `reopenAdyenPayment(orderId:)` i stället, ingen ny order skapas.

Identitet: gäst använder trimmade fälten. Inloggad: token krävs (annars kastas `"Logga in igen innan du beställer."`), profilen hämtas via `GET /api/profile` (cachas i `cachedCustomerProfile`); telefonnummer < 6 tecken kastar `"Telefonnummer saknas på profilen. Lägg till nummer innan du beställer."`; namn = `displayName` eller `"Kund"`; namn+telefon skrivs tillbaka till guestName/guestPhone (används för order-uppföljning).

Leveransadress-normalisering (endast delivery, pickup ger street/city = nil): staden härleds från sista kommadelen av adressen (hoppar "Sweden"/"Sverige", skalar bort inledande sifferpostnummer-tokens), fallback till restaurangens stad; gatan = adressen med staden avskalad från slutet (", Stad" eller " Stad", trimmar kommatecken/blanksteg); tom gata faller tillbaka till hela råadressen.

`POST /api/orders` med header `Idempotency-Key` (format `"swift-adyen-\(UUID)"`, återanvänds inom samma kassa-session, nollas när korgen ändras eller ordern slutförs) och Bearer om inloggad. Request-fält:

| Fält | Värde |
|---|---|
| `restaurantId` / `restaurantSlug` | restaurangens id/slug |
| `type` | `"DELIVERY"` eller `"PICKUP"` |
| `paymentMethod` | `"ADYEN"` |
| `customerName` / `customerPhone` | från identiteten |
| `customerEmail` | `nil` |
| `deliveryStreet` / `deliveryCity` | normaliserade (nil vid pickup) |
| `deliveryZip` | `nil` |
| `deliveryLatitude` / `deliveryLongitude` | `deliveryCoordinate?.lat/lng` |
| `deliveryNote` / `note` | noteringen (samma värde i båda), nil om tom |
| `discountCode` | `appliedDiscount?.code` |
| `userDealId` | `activeUserDealId` OM vald deal är applicable, annars nil |
| `items` | per rad: `{ productId, quantity, note: nil, selectedExtras: [{ groupId, groupName, extraId, extraName, priceAddon, quantity }], paidWithPoints: true eller nil }` |
| `stripePaymentIntentId` | `nil` |
| `lat` / `lng` | samma koordinat igen |
| `pendingPayment` | `true` (ordern skapas i väntande läge) |
| `tip` | dricksen om > 0, annars nil |

Svar `CartOrderResponse { orderId?, id?, orderNumber?, estimatedTime?, accessToken?, dpointsEarned?, pointsEarned? }`, `resolvedOrderId = orderId ?? id`. Saknas id: `paymentError = "Servern returnerade inget order-ID."`.

`.onChange` på `cartStore.count` och `cartStore.subtotal` kör `resetCheckoutSession()`: nollar idempotensnyckeln och abandonerar ev. väntande order.

### Betalning: POST /api/payments/create + native Adyen

Efter ordern: `pendingPaymentOrderId = orderId`, `returnUrl = "https://delivera.se/adyen-return?orderId=\(orderId)"`, sedan `POST /api/payments/create` med body `{ orderId, returnUrl, channel: "iOS", storePaymentMethod: false }`. Svar `{ provider?, paymentRef?, checkoutUrl?, session: { id, sessionData }?, total?, discountAmount? }`. Saknad session: `paymentError = "Adyen-session saknas i serversvaret."`.

Innan sheeten öppnas byggs `pendingHomeOrder = ActiveHomeOrder.paid(...)` med orderId, orderNumber, restaurant, mode, address, `total` (serverns total, fallback lokala), coordinate, accessToken, customerPhone, `dpointsEarned ?? pointsEarned`, deliveryFee, `discountAmount` (serverns, fallback `cartStore.discount + appDealDiscountPreview`) samt items som `ActiveOrderLine { name, quantity, unitPrice (inkl extras), extras: ["2x Extra ost", ...] }`.

Betalsheet (`.sheet` med `presentationDetents([.height(610)])` och synlig drag-indikator): header DpointsGlyph(30) + `"Betalning"` (24, black rounded, ink) + beloppet (18, black rounded, orange) + `"Klar"`-knapp (döljer tangentbordet) + X-knapp (40x40, vit 90% cirkel).

Metodväljare, fyra knappar (höjd 46, hörnradie 17; vald = ink-bakgrund vit text + orange 35% stroke + orange 18% skugga, oval = vit + line-stroke):

| Metod | Titel | Adyen-typ | Beskrivning |
|---|---|---|---|
| Kort | `"Kort"` | `scheme` | `"Betala genom kort"` |
| Apple Pay | `"Apple Pay"` | `applepay` | `"Betala med Apple Pay"` |
| Klarna | `"Klarna"` | `klarna` | `"Betala nu eller senare"` |
| Swish | `"Swish"` | `bolt.fill`-ikon, typ `swish` | `"Betala genom Swish"` |

Byte av metod animeras (spring 0.28/0.82) och monterar om komponenten (`.id(rawValue)`).

Native Adyen SDK (UIViewControllerRepresentable, ingen WebView): `CheckoutConfiguration` med environment `.liveEurope` om `AppConfig.adyenEnvironment` (lowercased) är `"live"` annars `.test`, `Amount(value: Int((total * 100).rounded()), currencyCode: "SEK", localeIdentifier: "sv_SE")` (kronor tillbaka till minor units här, enda stället), `clientKey = AppConfig.adyenClientKey`, `CardConfiguration().showCardholderName(true).showStorePaymentMethod(false)`, `AuthenticationConfiguration().requestorAppURL(returnURL)` (3DS). `Checkout.setup(with: SessionResponse(id, sessionData), ...)`, `createPaymentComponent(for: paymentMethodType)`.

Felfall i sheeten (visas som orange Label i sheeten):
- Metod saknas i sessionen: `"\(metod) finns inte i den här Adyen iOS-sessionen. Kontrollera att \(metod) är aktiverad för iOS/native i Adyen-testkontot och att merchant account får använda metoden i Sverige."`
- Komponent utan viewController: `"Adyen kunde inte visa \(metod) i native iOS. Kontrollera Adyen-konfigurationen för metoden."`
- Om Adyen-ramverken inte kan importeras (build-fallback): panel med `"Kortbetalning är inte tillgänglig just nu."` + `"Försök igen om en stund."`

### Verify-flödet

`onComplete` från Adyen ger `sessionId` + `sessionResult` som skickas till `verifyNativeAdyenPayment`:
1. Saknas `pendingPaymentOrderId`: fel `"Ordern saknas för betalningen."`
2. `POST /api/payments/adyen/verify` body `{ orderId, sessionId, sessionResult }`. Svar `{ paid?, pending?, failed?, status? }`.
3. `paid == true`: bästa-försök `GET /api/orders/\(id)` (query `phone` + ev. `token` = accessToken, Bearer om inloggad) och `pendingHomeOrder` uppdateras med databasordern (`applyingDatabaseOrder`). Fel här loggas bara. `pendingPaymentOrderId = nil`, success.
4. `failed == true`: status `"refused"` ger `"Adyen nekade betalningen. I testläge behöver du använda ett godkänt Adyen-testkort eller en aktiverad testmetod."`, annars `"Betalningen misslyckades: \(status)"` (eller `"Betalningen misslyckades."` utan status).
5. Varken paid eller failed: `"Betalningen väntar fortfarande hos Adyen. Försök igen om en stund."`

### Efter lyckad betalning (sheetens onCompleted)

1. `onPaymentCompleted(pendingHomeOrder)` anropas (HomeView tar över: sätter aktiv order-nycklarna, visar tracking, nollar aktiv deal, startar ev. Live Activity; det ligger utanför CartView).
2. `pendingPaymentOrderId = nil`, `pendingHomeOrder = nil`, `checkoutIdempotencyKey = ""`.
3. `cartStore.clear()` (tömmer hela korgen inkl. rabattkod).
4. Sheeten stängs.

Observera: CartView nollar INTE `activeUserDealId` själv, det gör hemskärmen efter betald order.

### Abandon-flödet

`abandonPendingPayment()` körs vid: betalfel i sheeten (onFailed), stängd sheet (onClose), fel under orderskapandet, samt när korgen ändras med väntande order. Den nollar `pendingPaymentOrderId`, `pendingHomeOrder` och idempotensnyckeln, och fire-and-forget-postar `POST /api/orders/\(orderId)/abandon` med body `{ phone }` (nil om tomt). Fel ignoreras (`try?`).

`reopenAdyenPayment(orderId:)` (retry på samma order): bygger samma returnUrl, kör `POST /api/payments/create` igen och öppnar sheeten med den nya sessionen; fel ger `"Adyen-session saknas i serversvaret."` eller `error.localizedDescription`.

### Felhantering, samlade exakta strängar

| Situation | Text |
|---|---|
| Tom kod | `"Skriv en rabattkod först."` |
| Ogiltig rabattkod | `"Rabattkoden gäller inte."` |
| Lyckad rabattkod | `"\(KOD) är tillagd."` |
| Lyckad vänkod | `"Kod från \(namn) aktiverad. Ha så gott!"` |
| Ingen restaurang | `"Välj en restaurang först."` |
| Gästnamn saknas | `"Skriv namn innan betalning."` |
| Gästtelefon saknas | `"Skriv ett giltigt telefonnummer."` |
| Token saknas (inloggad) | `"Logga in igen innan du beställer."` |
| Telefon saknas på profil | `"Telefonnummer saknas på profilen. Lägg till nummer innan du beställer."` |
| Inget order-ID | `"Servern returnerade inget order-ID."` |
| Session saknas | `"Adyen-session saknas i serversvaret."` |
| Order saknas vid verify | `"Ordern saknas för betalningen."` |
| Refused | `"Adyen nekade betalningen. I testläge behöver du använda ett godkänt Adyen-testkort eller en aktiverad testmetod."` |
| Failed med status | `"Betalningen misslyckades: \(status)"` |
| Pending | `"Betalningen väntar fortfarande hos Adyen. Försök igen om en stund."` |

Övriga fel visar `error.localizedDescription`; serverns `{ "error": "..." }` decodas till `APIError.message` så servertexter visas ordagrant.
## 16. Auth-flödet (login/registrering)

Auth i profilen är lösenordsfri och har TVÅ vägar: telefon-OTP via Supabase, och Sign in with Apple (nativ `AuthenticationServices`, inte Supabase OAuth). Det finns INGEN Google-knapp i ProfileView (en `GoogleLogoMark`-komponent finns i filen men används inte i den utloggade vyn). Kontot är alltid ankrat i telefonnumret: Apple-login utan nummer tvingar in ett "länka nummer"-steg.

### 16.1 Tillståndsmaskin

Enum `ProfileAuthStep` med fyra lägen:

| Steg | Betydelse |
|---|---|
| `start` | Inget flöde igång, bara knapparna visas |
| `phone` | Nummerinmatning för ren telefon-login |
| `linkPhone` | Nummerinmatning för att koppla nummer till ett Apple-konto (`pendingOAuthToken` är satt) |
| `code` | OTP-kodinmatning (delas av båda vägarna) |

State-fält: `phone` (inmatat nummer), `code` (OTP), `pendingPhone` (normaliserat E.164-nummer som koden skickades till), `pendingOAuthToken` (plattformstoken från Apple-login som väntar på nummerlänkning, tom sträng = ren telefon-login), `isLoading`, `errorMessage`.

### 16.2 Basadresser och headers

- Backend: `AppConfig.apiBaseURL` = env `DELIVERA_API_URL` eller default `https://api.delivera.se`.
- Supabase: `AppConfig.supabaseURL` = env `SUPABASE_URL` eller default `https://qiviwmhunmqemqylmwkr.supabase.co`.
- Supabase-anrop skickar headers `apikey: <supabaseAnonKey>` och `Authorization: Bearer <supabaseAnonKey>` plus `Content-Type: application/json`. Timeout 18 s för POST, 15 s för GET mot backend.
- Backend-anrop med token skickar `Authorization: Bearer <token>`.

### 16.3 Nummer-normalisering (klientsidan)

`normalizeSwedishPhone(raw)`: filtrera fram enbart siffror, strippa ledande `46` eller ledande `0`, kräv att resten är exakt 9 siffror och börjar på `7`, returnera `+46XXXXXXXXX`. Annars nil, vilket ger felmeddelandet `"Ange ett giltigt mobilnummer, t.ex. 070 000 00 00."` utan något nätverksanrop.

### 16.4 Telefon-login, steg för steg

1. Kund trycker "Fortsätt med telefon" (steg blir `phone`, spring-animation response 0.4, damping 0.86, `errorMessage` nollas).
2. Kund skriver nummer, trycker "Skicka kod" (`sendPhoneCode`):
   - Normalisera numret (se 16.3).
   - `POST {api}/api/auth/lookup-phone` body `{"phone":"+46..."}`, svar `{exists: Bool, hasFullAccount: Bool, isVerified: Bool}`. OBS: anropet görs med `try?` och resultatet ignoreras helt, det är bara en förvarmning/telemetri. Fel här stoppar inte flödet.
   - `POST {supabase}/auth/v1/otp` body `{"phone":"+46...","channel":"sms","should_create_user":true}`. Tomt svar ok (dekodas till tom struct).
   - Vid lyckat: `pendingPhone = normaliserat nummer`, steg blir `code`.
3. Kund skriver koden, trycker "Verifiera" (`verifyPhoneCode`):
   - `POST {supabase}/auth/v1/verify` body `{"phone": pendingPhone, "token": <kod trimmad>, "type": "sms"}`. Svar: `{access_token, refresh_token?}` (dekodas som `accessToken`/`refreshToken`).
   - Eftersom `pendingOAuthToken` är tom: `POST {api}/api/auth/phone-token` med TOM body `{}` och header `Authorization: Bearer <supabase access_token>`. Svar `PlatformAuthResponse` = `{token: String, user: CustomerProfile}`.
   - `authToken = token` (skrivs till Keychain via `@AuthToken`, se 16.7), `profile = user`, steg tillbaka till `start`, `phone` och `code` nollas.
4. Refresh-token sparas INTE i profilens flöde, bara plattformstoken.

### 16.5 Apple-login, steg för steg

1. Kund trycker "Fortsätt med Apple". Nativ `ASAuthorizationAppleIDProvider`-request med scopes `[.fullName, .email]`.
2. Callback bygger `AppleIdentityPayload` = `{identityToken (JWT-sträng), userIdentifier (credential.user), email?, fullName?}`. Namnet formateras med `PersonNameComponentsFormatter`, tom sträng blir nil. Om identityToken inte har exakt 3 punkt-separerade JWT-delar kastas fel med texten `"Apple kunde inte returnera en giltig identitet."` (i coordinatorn) respektive `"Apple skickade ingen giltig inloggningstoken. Testa igen."` (i handleApple-guarden).
3. `POST {api}/api/auth/oauth-token` UTAN auth-header, body: `{"provider":"apple","idToken":"<jwt>","email":<string|null>,"name":<string|null>,"providerId":"<userIdentifier>"}`. Svar `{token, user}`.
4. `authToken = token`, `profile = user`. Om `user.needsPhone == true` ELLER `user.phone == nil`: `pendingOAuthToken = token` och steg blir `linkPhone` (kunden MÅSTE koppla nummer, samma nummerformulär men rubrik "Lägg till nummer").
5. Länknings-vägen: samma `sendPhoneCode` (lookup + Supabase-OTP) och sedan i `verifyPhoneCode`, eftersom `pendingOAuthToken` inte är tom: efter Supabase-verify anropas `POST {api}/api/profile/link-phone` body `{"phone": pendingPhone}` med `Authorization: Bearer <pendingOAuthToken>`. Svar `{user: CustomerProfile}`. Sedan `authToken = pendingOAuthToken`, `profile = user`, `pendingOAuthToken = ""`.
6. Felhantering Apple: `ASAuthorizationError.canceled` ger INGET felmeddelande (tyst). Andra ASAuthorization-fel ger `"Apple kunde inte auktorisera inloggningen. Kontrollera att Sign in with Apple är aktivt för appen och testa igen."` Övriga fel visar `error.localizedDescription`.

### 16.6 Serverfel-parsning

Icke-2xx-svar försöker dekoda `{error?} | {msg?} | {message?}` (prioritetsordning: `error`, `msg`, `message`) och visar den strängen. Annars kastas generisk `APIError.requestFailed(statusCode)`.

### 16.7 Token-lagring och session

- `@AuthToken` är en property wrapper (App/DeliveraSwiftApp.swift) som är drop-in-ersättning för `@AppStorage("delivera.authToken")` men backas av Keychain via singleton `SessionStore.shared` och delas mellan alla vyer. Läs/skriv `authToken` som en vanlig String, tom sträng = utloggad.
- Vid app-/vy-start (`.task`): om token finns men `profile == nil` visas restore-läget och `restoreProfile()` körs: `GET {api}/api/profile` med Bearer-token, svar = `CustomerProfile`.
- Viktig regel: bara HTTP 401 loggar ut (token töms, profile nil). Nätverks-/serverfel behåller token och visar `"Kunde inte hämta profilen. Kontrollera nätet."` med en "Försök igen"-knapp.
- Utloggning (`logout()`): sätter `authToken = ""`, `profile = nil`, `authStep = .start` och nollar `phone`, `code`, `pendingPhone`, `pendingOAuthToken`. Inget server-anrop, inget annat rensas (aktiv deal-snapshot i AppStorage rörs INTE av logout).

### 16.8 CustomerProfile (svar från /api/profile och auth-endpoints)

| Fält | Typ |
|---|---|
| `id` | String |
| `name` | String? |
| `firstName` | String? |
| `lastName` | String? |
| `phone` | String? |
| `email` | String? |
| `isVerified` | Bool |
| `image` | String? |
| `needsPhone` | Bool? |
| `needsName` | Bool? |
| `profileComplete` | Bool? |

`displayName`: "firstName lastName" (trimmade, tomma bort) om något finns, annars `name` om icke-tom, annars `"Din profil"`.

### 16.9 Exakta UI-strängar i utloggat läge

| Element | Sträng | Typografi |
|---|---|---|
| Rubrik | `"Logga in"` | 34 pt black rounded, ink, centrerad |
| Underrubrik | `"Fortsätt med telefon eller Apple. Kontot kopplas säkert till ditt nummer."` | 14 pt heavy, muted, centrerad |
| Knapp 1 | `"Fortsätt med telefon"` | ikon `phone.fill`, vit bakgrund, ink-text, 1 pt line-border, höjd 56, radie 18, 16 pt black rounded |
| Knapp 2 | `"Fortsätt med Apple"` | ikon `apple.logo` (19 pt black), ink-bakgrund, vit text, höjd 56, radie 18, 16 pt black rounded |
| Nummerkortets rubrik | `"Telefonnummer"` (phone) / `"Lägg till nummer"` (linkPhone) | 17 pt black rounded, ink |
| Landskods-chip | `"+46"` | 15 pt black, 58x50, bakgrund ink 6 % opacitet, radie 16 |
| Nummerfältets placeholder | `"70 000 00 00"` | 16 pt black, phonePad, höjd 50, vit bakgrund, radie 16 |
| Skicka-knapp | `"Skicka kod"`, laddande: `"Skickar..."` | ikon `paperplane.fill`, orange bakgrund, vit text, höjd 52, radie 18, 15 pt black |
| Kod-rubrik | `"Ange SMS-koden"` | 17 pt black rounded |
| Kod-undertext | `"Vi skickade en kod till <pendingPhone>."` | 12 pt bold, muted |
| Kodfältets placeholder | `"123456"` | 24 pt black rounded, centrerad, numberPad, oneTimeCode, höjd 58, vit, radie 18 |
| Verifiera-knapp | `"Verifiera"`, laddande: `"Verifierar..."` | ikon `checkmark.seal.fill`, disabled om laddar eller kod < 4 tecken (trimmad) |
| Byt-nummer-länk | `"Ändra nummer"` | 13 pt black, muted, centrerad. Går tillbaka till `phone` eller `linkPhone` beroende på om `pendingOAuthToken` finns, nollar `code` och fel |
| Fotlänkar | `"Support"` • `"Villkor"` • `"Policy"` | 12 pt black, muted, separerade med `"•"`, spacing 14. URL:er: `https://delivera.se/contact`, `/terms`, `/privacy` |
| Restore-laddning | `"Hämtar din profil"` (24 pt black rounded) + `"Ett ögonblick"` (13 pt bold muted) + orange ProgressView skala 1.15 |
| Restore-fel | ikon `wifi.exclamationmark` (34 pt black, orange) + `"Kunde inte ladda"` (24 pt black rounded) + feltext + knapp `"Försök igen"` (vit text, ink-kapsel, höjd 48, horisontell padding 22) |

Formulärkorten använder `profileCard()`-stilen: padding 14, bakgrund vit 92 % opacitet, radie 22 continuous, 1 pt border i `line` (svart 6,5 % opacitet). Fel visas i `NoticeBanner(text:)` under knapparna. Auth-knappkolumnen har maxbredd 360 och spacing 10.

### 16.10 Färger (konverterade till hex)

| Namn | Swift | Hex |
|---|---|---|
| `DeliveraTheme.orange` | red 0.94, 0.31, 0.10 | `#F04F1A` |
| `DeliveraTheme.ink` | 0.06, 0.06, 0.07 | `#0F0F12` |
| `DeliveraTheme.muted` | 0.43, 0.42, 0.40 | `#6E6B66` |
| `DeliveraTheme.line` | svart 6,5 % opacitet | `rgba(0,0,0,0.065)` |
| `DeliveraTheme.gold` | 0.94, 0.73, 0.36 | `#F0BA5C` |
| App-bakgrund | gradient topLeading→bottomTrailing | `#FCFAF2` → `#F5FAF5` → `#FCF5ED` |

## 17. ProfileView (alla rader och undervyer)

ProfileView är fliken "Profil". Rot: `ZStack` med `DeliveraTheme.appBackground` (gradienten ovan) som fyller skärmen. Innehållet fadear/glider in vid visning (opacity 0→1, offset y 18→0, spring response 0.54 damping 0.86). Tre topplägen:

1. `profile != nil` → inloggad vy.
2. token finns men profil ej laddad → `ProfileRestoreView` (se 16.9).
3. annars → utloggad vy (se 16.9).

Panelnavigering är INTE NavigationStack: en `activePanel: ProfilePanel?` byter ut hela innehållet mot `ProfilePanelPage` med transition `.move(edge: .trailing) + .opacity` och spring 0.36/0.88. Panelen har egen custom swipe-back-gest: drag som startar < 28 pt från vänsterkanten, translation.width > 76, |höjd| < 80. ScrollView med horisontell padding 20, topp-padding 18, botten-padding 118 (plats för tabbaren).

### 17.1 Inloggad vy, exakt ordning

1. **Hero-kort** (`ProfileLoggedInHero`): minHöjd 218, radie 28 continuous, gradient topLeading→bottomTrailing `#141417` → `#331F14` → orange `#F04F1A`, 1 pt border vit 12 % opacitet, skugga svart 10 % radie 14 offset y 8, padding 20, innehåll bottenvänsterjusterat.
   - Overline `"PROFIL"` (`"Profil"` med `.textCase(.uppercase)`), 12 pt black rounded, vit 62 %.
   - Namn = `displayName`, 34 pt black rounded vit, max 2 rader, minimumScaleFactor 0.78.
   - Underrad: `profile.phone ?? profile.email ?? "Kund"`, 13 pt black, vit 78 %, 1 rad.
   - Uppe till höger: penn-knapp (ikon `pencil`, 15 pt black, ink på vit cirkel 42x42) som öppnar Inställningar-panelen (förifyller `editName`/`editEmail` från profilen).
   - Chips-rad (spacing 8): chip 1 ikon `phone.fill` text `"Telefon klar"` om nummer finns, annars `"Lägg till nummer"`; chip 2 ikon `gift.fill` text `"Deals redo"`. Chip-stil: 11 pt black vit, höjd 31, horisontell padding 10, kapsel med vit 15 % bakgrund.
2. **Två snabbtiles** sida vid sida (spacing 10), `ProfileQuickTile`: vit bakgrund, radie 22, line-border, padding 15, cirkelikon 42x42 med tint-bakgrund och vit ikon 18 pt black, titel 17 pt black rounded ink, undertitel 12 pt bold muted.
   - Tile 1: ikon `ticket.fill`, titel `"Deals"`, undertitel `"Dina rabatter"`, tint orange. Öppnar deals-panelen.
   - Tile 2: ikon `clock.fill`, titel `"Historik"`, undertitel `"Order & kvitton"`, tint grön `#26784D` (0.15, 0.47, 0.30). Öppnar orders-panelen.
3. **Menyrader** (spacing 9), `ProfileMenuRow`: vit, radie 20, line-border, padding 12, ikon 42x42 i orange på orange 10 %-platta radie 14, titel 15 pt black ink, undertitel 12 pt bold muted 1 rad, chevron `chevron.right` 12 pt black muted.
   - Rad 1: ikon `info.circle.fill`, `"Information"`, `"Support, villkor och policy"` → information-panelen.
   - Rad 2: ikon `gearshape.fill`, `"Inställningar"`, `"Namn och telefon"` → settings-panelen (förifyller editName/editEmail).
4. **Logga ut-knapp**: label `"Logga ut"` med ikon `rectangle.portrait.and.arrow.right`, 14 pt black, röd text på röd 8 %-bakgrund, höjd 48, radie 16. Beteende: se 16.7 (rensar bara auth-state i minnet + Keychain-token).

Saker som INTE finns i ProfileView (viktigt för paritet, lägg inte till dem): ingen adresslista, ingen Dpoints-rad (Dpoints/belöningar bor i Rewards-fliken), ingen "radera konto"-knapp, ingen Google-inloggning, inget recensionsflöde i orderhistoriken (recensioner triggas från hemskärmens tracking-kort, profilen exponerar bara `reviewedAt` i orderdatat).

### 17.2 Panelramverket

Varje panel har samma header: tillbaka-knapp (`chevron.left` 17 pt black, ink, vit cirkel 46x46 med line-border), titel 29 pt black rounded ink, undertitel 12 pt bold muted.

| Panel | Titel | Undertitel |
|---|---|---|
| deals | `"Mina deals"` | `"Personliga rabatter och erbjudanden"` |
| orders | `"Orderhistorik"` | `"Tidigare köp, kvitton och recensioner"` |
| information | `"Information"` | `"Support, villkor och trygghet"` |
| settings | `"Inställningar"` | `"Namn och telefon"` |

Data laddas i `.task(id: activePanel)`: orders → `GET /api/profile/orders`, deals → `GET /api/profile/deals`, information/settings laddar inget. Laddningsläge: `ProfileLoadingRows` = 4 skeletonkort (första 82 pt högt, resten 74, radie 18, vit 86 %, inuti en 44x44-platta i orange 10 % + två kapslar i svart 8 %/5,5 % med bredd 160/110, höjd 12/10). Fel: `NoticeBanner(text: felmeddelande)`.

### 17.3 Mina deals

Endpoint: `GET /api/profile/deals` med Bearer-token, svar = array av `ProfileDeal`:

| Fält | Typ |
|---|---|
| `id` | String |
| `code` | String? |
| `userDealId` | String? |
| `source` | String? |
| `amountKr` | Double? |
| `discountPercent` | Double? |
| `freeDelivery` | Bool? |
| `minOrderKr` | Double? |
| `dpointsBonus` | Int? |
| `campaign` | ProfileDealCampaign? = `{id?, title?, name?, description?, discountType?, discountValue?, minOrder?, freeDelivery?, appDpointsBonus?}` |

Härledda strängar: `title` = `campaign.title ?? campaign.name ?? "Personlig deal"`. `subtitle` = `"Kod: <code>"` om kod finns, annars campaign-rabattext, annars `"Redo att användas i kassan"`. Rabattext (`displayDiscount`): `"Fri leverans"` om freeDelivery eller discountType `FREE_DELIVERY`; `"<N>% rabatt"` om `PERCENTAGE`; annars `"<N> kr rabatt"` (avrundade heltal).

**Tomtillstånd:** ikon `ticket.fill`, titel `"Inga deals än"`, text `"När du får personliga erbjudanden hamnar de här direkt."` (PlaceholderPanel: orange ikon 24 pt black på orange 10 %-platta 54x54 radie 18, titel 25 pt black rounded ink, text 14 pt bold muted, i profileCard-stil).

**Hero-kortet** (`ProfileDealsHero`, visas ovanför listan när deals finns): minHöjd 154, radie 24, gradient ink `#0F0F12` → `#381F14` (0.22, 0.12, 0.08) → orange, skugga svart 10 % radie 14 y 8. Dekorativa animerade cirklar: 4 st, stroke vit 12 % linjebredd 1.2, diameter 92+index*50, skala `1 + 0.03*sin(t*0.8+index)` via TimelineView (kontinuerlig, subtil andning). Texter: `"<count> AKTIVA"` (`"\(count) aktiva"` uppercased, 12 pt black rounded, vit 70 %), `"Deals redo att användas"` (28 pt black rounded vit), `"Dina personliga erbjudanden ligger här och kan användas direkt i kassan."` (13 pt bold, vit 74 %).

**Deal-kort** (`ProfileDealFeatureCard`): vit, radie 22, line-border, padding 18, minHöjd 152, cardShadow. Titel 20 pt black rounded ink max 2 rader, subtitle 13 pt bold muted max 2 rader. Om kod finns: kod-chip i orange kapsel (13 pt black rounded vit, höjd 34, horisontell padding 12). Till höger: ikon `ticket.fill` 34 pt black orange roterad -10 grader. Knapp: ikon `bag.badge.plus.fill` + `"Använd i kassan"` + `arrow.right`, 13 pt black vit på ink-kapsel höjd 42.

**Aktivering av en deal** (`applyDeal`): bygger en `HomeAppDeal`-snapshot via `homeAppDealSnapshot`:
- `userDealId` = `deal.userDealId ?? deal.id` (måste vara icke-tom, annars avbryts tyst).
- `freeDelivery` = `deal.freeDelivery ?? campaign.freeDelivery ?? (discountType == "FREE_DELIVERY")`.
- `discountPercent` = `deal.discountPercent`, annars `campaign.discountValue` om discountType `PERCENTAGE` (avrundat Int).
- `amountKr` = `deal.amountKr`, annars `campaign.discountValue` om discountType `FIXED` eller `FIXED_PRICE` (avrundat Int).
- `minOrderKr` = `deal.minOrderKr ?? campaign.minOrder ?? 0` (avrundat Int).
- Konstanta fält: `id` = campaign.id ?? deal.id, `subtitle` = campaign.description ?? deal.subtitle, `badge` = `"Fri leverans"` vid fri leverans annars displayDiscount, `imageUrl` = nil, `ctaLabel` = `"Använd"`, `placement` = `"PROFILE"`, `audience` = `"LOGGED_IN"`, `template` = `"DEAL_HERO"`, `size` = `"LARGE"`, `claimRequired` = false, `dpointsBonus` = deal.dpointsBonus ?? campaign.appDpointsBonus, `missionType`/`missionProgress`/`restaurant`/`theme` = nil, `checkoutApplicable` = true, `discountType` = `"FREE_DELIVERY"` vid fri leverans annars campaignens discountType.
- Sedan: haptik `UINotificationFeedbackGenerator().notificationOccurred(.success)`, skriv AppStorage `delivera.activeUserDealId` = userDealId och `delivera.activeUserDealSnapshot` = JSON-strängen av HomeAppDeal, stäng panelen och anropa `onOpenHome()` (växlar till hem-fliken där kassan sedan quotar mot servern med userDealId).

### 17.4 Orderhistorik

Endpoint: `GET /api/profile/orders` med Bearer-token. Svaret är flexibelt: antingen en rå array av ordrar ELLER `{orders: [...]}` (klienten provar array först). Alla fält dekodas tolerant (siffror/strängar accepteras korsvis, se `decodeFlexibleString/Double/Int`; `selectedExtras` kan även komma som JSON-STRÄNG som dubbeldekodas).

`ProfileOrder`-fält: `id` (fallback UUID), `orderNumber?`, `status` (fallback `"PENDING"`), `type?` (`"PICKUP"`/leverans), `total` (kr, Double, fallback 0), `deliveryFee?`, `discountAmount?`, `tipAmount?`, `deliveryStreet?`, `reviewedAt?`, `createdAt`, `restaurant?` = `{id?, name?, slug?, address?, zip?, city?, phone?, legalName?, organizationNumber?, vatPercent?}`, `items` = `[{id (fallback productId, sedan UUID), productName (fallback "Artikel"), basePrice, quantity (fallback 1), subtotal (fallback basePrice*quantity), selectedExtras: [{name?, extraName? (fallback extraId), quantity?}]}]`.

Visningslogik:
- Datum: ISO8601 (med och utan fraktionssekunder) → format `"d MMM yyyy"` i locale `sv_SE`, annars `"Datum saknas"`.
- Belopp: `"<avrundat heltal> kr"`.
- Status-mappning (`displayStatus`, jämförs uppercasat):

| API-status | Text | Färg (`statusTint`) |
|---|---|---|
| PENDING | `"Väntar"` | orange |
| PREPARING, ACCEPTED | `"Tillagas"` | orange |
| READY | `"Redo"` | grön (system green) |
| DELIVERING, OUT_FOR_DELIVERY | `"På väg"` | blå `#2B7DE6` (0.17, 0.49, 0.90) |
| DELIVERED, COMPLETED | `"Levererad"` | grön |
| CANCELLED, CANCELED, REJECTED | `"Avbruten"` | röd |
| övrigt | status.capitalized | orange |

**Tomtillstånd:** ikon `clock.arrow.circlepath`, titel `"Ingen historik än"`, text `"När du beställer med ditt verifierade nummer visas ordern här."`

**Orderrad** (knapp, spacing 10 mellan rader): vit, radie 18, line-border, padding 15. Restaurangnamn (fallback `"Restaurang"`) 16 pt black rounded ink, datum 12 pt bold muted, totalsumma till höger 16 pt black rounded ORANGE. Under: två pills (`ProfilePill`: 11 pt black, tint-färgad text på tint 10 %-kapsel, höjd 28, horisontell padding 10): status-pill i statusTint + typ-pill i ink med text `"Avhämtning"` om `type == "PICKUP"` annars `"Leverans"`. Chevron höger.

**Orderdetalj** (`ProfileOrderDetailPage`, ersätter panelinnehållet med spring 0.34/0.88, samma swipe-back): ordern mappas till `ActiveHomeOrder` (samma modell som hemskärmens tracking). Mappningsdetaljer: `mode` = pickup om type PICKUP annars delivery; restaurangadress = address+zip+city kommaseparerade; `restaurantVatPercent` = `vatPercent ?? 12`; `address` = `deliveryStreet ?? restaurangadressen`; extras-rader formateras `"<qty|1>x <namn>"`; hårdkodade fallback-koordinater Lund/Malmö-området (55.6046, 13.0038 restaurang/kurir; 55.5969, 13.0007 kund); `selfDelivery` = false, kurirfält nil/false.
- Header: tillbaka-cirkel + restaurangnamn 27 pt black rounded 1 rad + `"<ordernummer> • <datum>"` 12 pt bold muted.
- Infokort (vit, radie 20, line-border, horisontell padding 16, vertikal 4, rader separerade av Divider): `"Status"` = displayStatus; `"Avhämtning"` eller `"Leverans"` = adress; `"Juridiskt namn"` = legalName (bara om icke-tom); `"Org.nr"` = organizationNumber (bara om icke-tom).
- Kvittokort (vit, radie 20, padding 16): rubrik `"Artiklar"` 18 pt black rounded; per artikel `"<qty>x <namn>"` + radpris 14 pt black, extras kommaseparerade 11 pt bold muted; Divider; `"Delsumma"`; `"Avhämtning"`/`"Leverans"` = leveransavgift eller `"Fri"` om 0; `"Rabatt"` = `"-<belopp>"` i grönt (bara om discountAmount > 0); `"Varav moms <procent>%"`; Divider; `"Totalt"` 21 pt black rounded.
- Knapp `"Skapa nytt kvitto"` med ikon `arrow.down.doc.fill` (14 pt black vit på ink, höjd 50, radie 16): genererar PDF lokalt via `makeReceiptPDF(order:settings:)` och öppnar iOS share-sheet. Plattformsinställningar för kvittot hämtas i bakgrunden via `GET`-anropet `DeliveraAPI().settings()`. Fel visas som röd 11 pt bold-text under knappen.

### 17.5 Information

Tre länkrader (`ProfileInfoRow`: vit, radie 18, line-border, padding 14, orange ikon 17 pt black i 42x42-ruta UTAN platta, titel 15 pt black ink, undertitel 12 pt bold muted max 2 rader, `arrow.up.right`-ikon höger). Öppnas i extern browser via `openURL`:

| Ikon | Titel | Undertitel | URL |
|---|---|---|---|
| `bubble.left.and.bubble.right.fill` | `"Support"` | `"Kontakta oss om en order eller betalning."` | `https://delivera.se/contact` |
| `shield.checkered` | `"Integritet"` | `"Hur vi hanterar konto, plats och betalningsdata."` | `https://delivera.se/privacy` |
| `doc.text.fill` | `"Villkor"` | `"Köpvillkor, integritet och Dpoints-regler."` | `https://delivera.se/terms` |

### 17.6 Inställningar

- Textfält placeholder `"Namn"` (profileInput-stil: 15 pt black, höjd 50, vit, radie 16, line-border). Förifylls med `profile.name`.
- OBS: `editEmail` finns som state och skickas i PATCH, men det finns INGET e-postfält i settings-UI:t (förifylls från `profile.email` och skickas tillbaka oförändrat; tom sträng skickas som null).
- Telefonblock (readonly): etikett `"Telefonnummer"` 11 pt black muted, värde `profile.phone ?? "Ej angivet"` 15 pt black muted på ink 6 %-platta höjd 50 radie 16, förklaring `"Numret är låst. För att byta nummer verifierar vi ett nytt SMS-flöde separat."` 11 pt bold muted.
- Spara-knapp `"Spara"`, laddande `"Sparar..."`, ikon `checkmark`, orange primärknapp (höjd 52, radie 18). Anropar `PATCH {api}/api/profile` body `{"name": <trimmad>, "email": <trimmad eller null>}` med Bearer-token, svar `{success?}`. Vid lyckat: hämta om `GET /api/profile` och stäng panelen. Fel visas i NoticeBanner ovanför knappen.

### 17.7 Värva vän / referral (modellerna, UI:t bor i Rewards-fliken)

Referral-UI:t ligger INTE i ProfileView utan i Rewards-fliken (Features/Rewards/RewardsView.swift, dpoints-sidan). `Models/Referral.swift` definierar kontraktet (Wolt-stil: kompisen anger min kod i kassan, båda belönas):

- `GET /api/account/referral` (Bearer) → `ReferralStatusResponse`:

| Fält | Typ | Betydelse |
|---|---|---|
| `locked` | Bool | true tills kunden låst upp sin kod (1 betald order) |
| `code` | String? | kundens egen värvningskod |
| `shareUrl` | String? | delningslänk, formen `https://delivera.se/i/<kod>` (öppnar appen om installerad via AASA, annars webben) |
| `enabled` | Bool | om referral-programmet är på (admin-styrt) |
| `rewardLabel` | String? | serverstyrd belöningscopy, hårdkoda aldrig |
| `couponsPerSide` | Int? | antal kuponger per part |
| `deal` | ReferralDealInfo? | `{title?, discountType?, discountPercent?, amountKr?, freeDelivery?, minOrderKr?, validUntil?}` |
| `stats` | ReferralStats? | `{invited: Int, registered: Int, ordered: Int, totalEarnedKr: Double?}` |

- `POST /api/account/redeem-code` (Bearer) body `{"code": "<väns kod>"}` → `{ok: Bool, inviterName?: String, dealsCreated?: Int, userDealId?: String}`. `userDealId` i svaret används av kassan för att applicera REFERRAL_INVITEE-dealen direkt (samma aktiva-deal-kontrakt som 17.3). Anropas från kassans kodfält (fallback-ordning: discount/validate först, sedan redeem-code).
## 18. Bud-läget (Courier)

### 18.1 Hur bud-läget nås

Bud-läget är INTE nåbart inifrån kundappen. Det är samma Xcode-target (`DeliveraSwift`) som kompileras om till en separat app med Swift-kompileringsflaggan `DELIVERA_COURIER_APP`. I `DeliveraSwiftApp.swift`:

```swift
#if DELIVERA_COURIER_APP
CourierAppRootView()
#else
HomeView()
#endif
```

Byggscriptet `Scripts/build-install-customer-and-courier-jalle-iphone.sh` bygger två appar från samma projekt:

| Variabel | Kundapp | Kurirapp |
|---|---|---|
| Bundle-id | `se.delivera.swift` | `se.delivera.kurir` |
| Widget-bundle | `se.delivera.swift.OrderWidget` | `se.delivera.kurir.OrderWidget` |
| Display-namn | `Delivera` | `Delivera Kurir` |
| Entitlements | `DeliveraSwift/DeliveraSwift.entitlements` | `DeliveraSwift/DeliveraCourier.entitlements` |
| Plats-beskrivning (`DELIVERA_LOCATION_USAGE`) | "Delivera använder din plats för att visa restauranger och leveranser nära dig." | "Delivera använder din plats för att dela kurirposition, hitta uppdrag nära dig och beräkna rutter." |
| Extra flaggor | (inga) | `OTHER_SWIFT_FLAGS=$(inherited) -D DELIVERA_COURIER_APP` |

**CourierAppRootView** (login-gate):

```swift
struct CourierAppRootView: View {
    @StateObject private var store = CourierStore()
    var body: some View {
        Group {
            if store.token.isEmpty {
                CourierLoginView().environmentObject(store)
            } else {
                CourierShellView().environmentObject(store)
            }
        }
        .task { await store.bootstrap() }
    }
}
```

Villkor: `store.token.isEmpty` (token läses från Keychain vid init) visar login, annars shell. `bootstrap()` körs alltid som `.task` på roten.

### 18.2 CourierTheme (färgpalett)

Kurirappen har en EGEN tema-enum, inte kundappens `DeliveraTheme`. Alla `Color(red:green:blue:)` konverterade till hex (kanal x 255, avrundat):

| Namn | Swift-värde | Hex | Användning |
|---|---|---|---|
| `accent` | (1.000, 0.353, 0.122) | `#FF5A1F` | Primär orange, CTA, online-status |
| `accentSoft` | (1.000, 0.936, 0.902) | `#FFEFE6` | Ljus orange bakgrund |
| `routeBlue` | (0.106, 0.090, 0.078) | `#1B1714` | "Smart rutt"-accent (OBS: trots namnet samma mörka färg som ink) |
| `routeBlueSoft` | (0.945, 0.941, 0.934) | `#F1F0EE` | Ljus bakgrund för rutt-inslag |
| `pickup` | (0.122, 0.376, 0.933) | `#1F60EE` | Blå, hämtnings-stopp |
| `pickupSoft` | (0.918, 0.949, 1.000) | `#EAF2FF` | Ljusblå bakgrund |
| `drop` | (0.000, 0.654, 0.463) | `#00A776` | Grön, lämnings-stopp |
| `dropSoft` | (0.894, 0.984, 0.949) | `#E4FBF2` | Ljusgrön bakgrund |
| `background` | (0.976, 0.973, 0.965) | `#F9F8F6` | Skärmbakgrund |
| `card` | `Color.white` | `#FFFFFF` | Kortbakgrund |
| `ink` | (0.106, 0.090, 0.078) | `#1B1714` | Primär text |
| `muted` | (0.514, 0.494, 0.471) | `#837E78` | Sekundär text |
| `line` | (0.878, 0.867, 0.847) | `#E0DDD8` | Kantlinjer |
| `track` | (0.933, 0.925, 0.910) | `#EEECE8` | Inaktiva ytor, fält-bakgrund |
| `green` | = `drop` | `#00A776` | Alias |
| `greenSoft` | = `dropSoft` | `#E4FBF2` | Alias |

### 18.3 Delade byggstenar

**CourierScreen** (wrapper): ZStack med `CourierTheme.background` som `ignoresSafeArea`, `navigationBarTitleDisplayMode(.inline)`.

**CourierCard**: padding 16, `maxWidth: .infinity` vänsterjusterad, bakgrund `fill` (default vit) i RoundedRectangle cornerRadius 18 (continuous), stroke `border` (default `line`) med lineWidth 1.5 om border är `accent`, `green` eller `routeBlue`, annars 1. Skugga: svart 5.5% opacity, radius 16, y 8. Om `action` finns wrappas innehållet i en Button med `.plain`-stil.

**CourierHeader**: HStack, vänster VStack (spacing 4) med titel (system 30, heavy, ink) och subtitel (14, semibold, muted), Spacer, valfri `trailing` AnyView.

**OnlineSwitch**: knapp som togglar `store.goOnline()` / `store.goOffline()`. Innehåll: cirkel 8x8 (fylld `accent` om online, annars `muted`) + text `"Online"` / `"Offline"` (13, bold). Textfärg accent/muted. Horisontell padding 12, höjd 38, kapsel-bakgrund `accentSoft` (online) / `track` (offline). Disabled när `store.loading`.

**Pill**: text (12.5, bold), horisontell padding 10, höjd 28, kapsel. `filled=true`: vit text på `color`. `filled=false`: `color`-text på `color.opacity(0.1)`. Default-color `accent`.

**EmptyCourierState** (tomtillstånd): VStack spacing 14, toppadding 54. Cirkel 78x78 med streckad kant (`line`, lineWidth 1, dash [5,5]) och SF-ikon (28, semibold, muted) i mitten. Titel (18, bold, ink), subtitel (14, medium, muted, centrerad, horisontell padding 18). Valfri knapp (`PrimaryButtonStyle`, toppadding 4).

**OfflineCourierState**: pulsanimation `easeInOut(duration: 1.45).repeatForever(autoreverses: true)` startas i `onAppear`. Innehåll:
- Bakgrundscirkel 132x132 i `accent.opacity(0.13)`, scaleEffect 0.92 till 1.12, opacity 0.85 till 0.25.
- Logga: RoundedRectangle 92x92, cornerRadius 28 (continuous), fylld `ink`, med `"K"` (44, black, accent). Skugga accent 24%, radius 24, y 14.
- `"Du är offline"` (25, black, ink), `"Gå online när du vill ta emot nya leveranser."` (14.5, semibold, muted, centrerad, horisontell padding 22).
- Knapp: ikon `bolt.fill` (15, black) eller vit ProgressView vid loading; text `"Startar..."` (loading) / `"Gå online"` (17, black). Vit text, höjd 58, `accent`-bakgrund radius 18. Skugga accent 18% till 34% opacity, radius 12 till 22, y 7 till 12 (pulserar), scaleEffect 1 till 1.018. Horisontell padding 18.

**PrimaryButtonStyle**: text 17 bold vit, `maxWidth: .infinity`, höjd 56, bakgrund `accent` (opacity 0.84 vid tryck), RoundedRectangle radius 16 continuous.

**DeliveryButtonStyle**: identisk men bakgrund `green`.

**Avatar**: cirkel 48x48 fylld `accentSoft` med text uppercased (18, heavy, accent).

**StatBox**: CourierCard med label (12.5, bold, muted) och värde (20, heavy, ink), spacing 4.

**SummaryRow**: HStack, label (14, semibold, muted), Spacer, värde (14, bold, ink).

**courierField()** (View-extension för inputfält): font 16 semibold, horisontell padding 14, höjd 54, bakgrund `track` radius 14 continuous, stroke `line`.

**SwipeConfirm** (svep-för-att-bekräfta):
- VStack spacing 7. Spår: kapsel höjd 56 fylld `track`. Fyllnadskapsel med `color` (opacity 1 om ready, annars 0.35), bredd `56 + drag`.
- Etikett-text (15, bold, ink om ready annars muted) centrerad, opacity `max(0, 1 - drag/width)` (tonas ut under svep).
- Knopp: cirkel 52x52 fylld `color` (ready) / `muted`, ikon `chevron.right` (18, heavy, vit), offset x = drag.
- DragGesture: bara aktiv om `ready`. `width = proxy.size.width - 56`, drag klampas till [0, width]. Släpp: om `drag > width * 0.82` körs async-action och drag nollas, annars fjädrar tillbaka med `spring(response: 0.3, dampingFraction: 0.8)`.
- Hela spåret opacity 0.55 om inte ready. Under spåret visas `hint` (12.5, semibold, muted) endast när inte ready.

**RadioRow**: cirkel 24x24 med stroke 2 (`green` vald / `line`), inre fylld cirkel 11x11 `green` när vald. Titel (16, bold, ink). Padding 14, bakgrund `greenSoft` (vald) / vit, radius 14, stroke `green`/`line`.

**CourierMap**: SwiftUI `Map` (MapKit) med `Marker(title, coordinate:)` tintad `accent`. Initial region: center = koordinaten, span 0.018 x 0.018. Om `coord.isValid == false`: `track`-bakgrund med texten `"Karta saknas"` (14, bold, muted).

### 18.4 CourierLoginView

Layout: `CourierScreen`, VStack (leading, spacing 22), padding 24, Spacer över och under.

- Logga: RoundedRectangle 76x76, radius 22 continuous, fylld `accent`, `"K"` (48, black, vit).
- `"Kurir"` (36, heavy), `"Logga in för att ta emot uppdrag."` (15, semibold, muted), spacing 6.
- Fält (spacing 12): TextField placeholder `"E-post"` (ingen autokapitalisering, e-post-tangentbord, textContentType `.username`), SecureField placeholder `"Lösenord"` (textContentType `.password`). Båda med `courierField()`-stil.
- Knapp: `"Loggar in..."` under loading, annars `"Logga in"`. `PrimaryButtonStyle`. Disabled + opacity 0.55 om loading eller något fält tomt.

Inloggning: `store.login(email:password:)` anropar `POST /api/courier/login` med `{ email (trimmad), password }`. Svar `CourierLoginResponse { token, courier }`. Token sparas i Keychain under nyckeln `"delivera.courierToken"` (INTE UserDefaults). Efter login: `online = false`, profil sätts, `selectedVehicle` från profilens vehicle, sedan `refreshActive()`, `refreshHistory()` och push-registrering. Fel visas via `errorMessage`-alerten.

Utloggning (`store.logout()`): avbryter poll- och ping-tasks, stoppar GPS, sätter token till `""` (Keychain-posten raderas eftersom tomt värde = delete), nollar profil/online/jobs/active/history/knownJobIds/newJobSignalCount/currentCoordinate.

### 18.5 CourierShellView (tabbstruktur)

TabView med tre flikar, `tint` = `accent` (`#FF5A1F`):

| Flik | Label | SF-ikon | Extra |
|---|---|---|---|
| 1 | `"Uppdrag"` | `list.bullet.rectangle` | JobsTabView i NavigationStack |
| 2 | `"Pågående"` | `circle.dashed` | Badge = `store.active.count` när ej tom |
| 3 | `"Profil"` | `person.fill` | CourierProfileView i NavigationStack |

Fel-alert på shell-nivå: titel `"Meddelande"`, meddelande = `store.errorMessage`, en knapp `"OK"` (role cancel) som nollar errorMessage.

### 18.6 CourierStore (tillstånd och livscykel)

`@MainActor final class CourierStore: NSObject, ObservableObject, CLLocationManagerDelegate`.

Published state:

| Fält | Typ | Default |
|---|---|---|
| `token` | String | Keychain `"delivera.courierToken"` eller `""` |
| `profile` | CourierProfileData? | nil |
| `online` | Bool | false |
| `bootstrapped` | Bool | false |
| `loading` | Bool | false |
| `jobs` | [CourierJob] | [] |
| `active` | [CourierDelivery] | [] |
| `history` | [CourierHistoryOrder] | [] |
| `errorMessage` | String? | nil |
| `selectedVehicle` | CourierVehicle | `.ebike` |
| `newJobSignalCount` | Int | 0 |
| `currentCoordinate` | CourierCoordinate? | nil |

Privat: `pollTask`, `pingTask`, push-observers, `knownJobIds: Set<String>`, `CLLocationManager`, `lastLocationSent` (init `Date.distantPast`).

**init**: locationManager.delegate = self, `desiredAccuracy = kCLLocationAccuracyBest`, `distanceFilter = 10` (meter), `pausesLocationUpdatesAutomatically = false`. Lyssnar på `Notification.Name("delivera.courier.push.received")` (kör `handlePushRefresh`) och `"delivera.courier.push.token.updated"` (kör `registerPushTokenIfPossible`).

**bootstrap()** (körs en gång, guard på `bootstrapped`):
1. `NotificationSignal.shared.prepare()` (begär notisbehörighet alert+badge+sound).
2. `UIApplication.shared.registerForRemoteNotifications()`.
3. Om token tom: sätt `bootstrapped = true` och returnera.
4. Parallellt: `GET /api/courier/me` (profil) + `GET /api/courier/session` (online-bool).
5. `selectedVehicle` = profilens vehicle (fallback `.ebike`).
6. `refreshActive()`, `refreshHistory()`, `registerPushTokenIfPossible()`.
7. Om online: `startLocation()`, `startPolling()`, `startPing()`, `refreshJobs(signal: false)`.
8. Vid `CourierError.unauthorized`: logout. Fel visas via `friendly(error)`.

**goOnline()**: `POST /api/courier/session/start`, sätt `online = true`, starta GPS + polling + ping, registrera push, `refreshJobs(signal: false)`, `refreshActive()`.

**goOffline()**: sätt `online = false`, töm `jobs` och `knownJobIds`, avbryt poll/ping-tasks, stoppa GPS, sedan `POST /api/courier/session/stop`.

**Polling**: loop var 10:e sekund: `refreshJobs()` (med signal) + `refreshActive()`.

**Ping**: loop, `sendCurrentLocation(force: true)` direkt och sedan var 8:e sekund.

**refreshJobs(signal:)**: `GET /api/courier/jobs` (guard online). Om `signal == true` och `knownJobIds` inte tom: `added = nya id:n som inte fanns`; om added > 0: `newJobSignalCount += added` + `NotificationSignal.newOrder(count: added)`. Uppdatera `knownJobIds` och `jobs`. 401 = logout (fel visas ej).

**refreshActive()**: `GET /api/courier/active`. **refreshHistory()**: `GET /api/courier/history`. Båda: 401 = logout, övriga fel tysta.

**accept(job)**: `POST /api/courier/jobs/{id}/accept` med tom body. Svar = `CourierDelivery`. Ta bort jobbet ur `jobs` och `knownJobIds`, appenda leveransen till `active`. Vid fel: errorMessage + `refreshJobs(signal: false)` och returnera nil.

**markPicked(delivery)**: `POST /api/courier/deliveries/{id}/picked-up`, tom body. Svar = uppdaterad CourierDelivery som ersätter posten i `active` (matchning på id). Returnerar Bool.

**complete(delivery, method, photoDataUrl, message)**: `POST /api/courier/deliveries/{id}/complete` med body `{ method: "HANDED"|"LEFT_AT_DOOR", photoDataUrl?: String, message?: String }`. Vid success: ta bort ur `active` + `refreshHistory()`.

**Felmeddelande-fallback** (`friendly`): LocalizedError-beskrivning eller `"Något gick fel. Försök igen."`.

### 18.7 GPS-tracking

`startLocation()` (körs när kuriren går online):
- Behörighet: om `.notDetermined` eller `.authorizedWhenInUse` begärs `requestAlwaysAuthorization()`.
- `allowsBackgroundLocationUpdates = true`, `showsBackgroundLocationIndicator = true` (blå statusindikator), `startUpdatingLocation()` + `startMonitoringSignificantLocationChanges()`. Alltså AKTIVT bakgrundsläge.

`didUpdateLocations`: sista positionen sätter `currentCoordinate` och triggar `sendCurrentLocation()`.

`sendCurrentLocation(force:)`: guard online + giltig koordinat. Icke-forcerade anrop throttlas: minst 5 sekunder sedan `lastLocationSent`. Skickar `POST /api/courier/location` med `{ lat, lng }` (fel sväljs). Effektivt intervall: ping-loopen forcerar var 8:e sekund, plus rörelse-drivna uppdateringar (distanceFilter 10 m) max var 5:e sekund.

`stopLocation()` (vid offline/logout): stoppar båda uppdateringstyperna.

### 18.8 Push-registrering och notissignal

**CourierPushRegistry** (singleton, @MainActor): håller `deviceToken: String?`; vid ändring postas `Notification.Name("delivera.courier.push.token.updated")`.

AppDelegate (delas med kundappen): `didRegisterForRemoteNotificationsWithDeviceToken` hexkodar token (`%02x` per byte) och sätter `CourierPushRegistry.shared.deviceToken`. Remote notification (bakgrund), `willPresent` och `didReceive` postar alla `Notification.Name("delivera.courier.push.received")`. `willPresent` visar `[.banner, .sound, .badge]`.

**registerPushTokenIfPossible()**: guard auth-token + device-token finns; `POST /api/courier/push/register` med `{ token: <hex>, platform: "ios-apns" }` (fel sväljs). Körs vid bootstrap, login, goOnline och när device-token ändras.

**handlePushRefresh()** (vid mottagen push): `NotificationSignal.newOrder(count: 1)` + `refreshJobs(signal: false)` + `refreshActive()`.

**NotificationSignal** (actor):
- `prepare()`: begär `UNUserNotificationCenter`-behörighet `[.alert, .badge, .sound]` (en gång).
- `newOrder(count:)`: spelar systemljud 1005 (`AudioServicesPlaySystemSound(1005)`) + vibration (`kSystemSoundID_Vibrate`) + haptik (`UINotificationFeedbackGenerator .success` och `UIImpactFeedbackGenerator(style: .heavy)`), och lägger en lokal notis: titel `"Nytt uppdrag"` (count == 1) eller `"{count} nya uppdrag"`, body `"Öppna Uppdrag för att se nya leveranser."`, default-ljud, ingen trigger (direkt).

### 18.9 Jobblistan (JobsTabView)

ScrollView, VStack spacing 16, bottenpadding 100, pull-to-refresh = `refreshJobs(signal: false)`.

- Header: titel `"Uppdrag"`, subtitel: online: `"{N} tillgängliga i närheten"`, offline: `"Du tar inte emot uppdrag just nu"`. Trailing = OnlineSwitch. Horisontell padding 18, toppadding 16.
- Offline: `OfflineCourierState` (se 18.3).
- Online, om `newJobSignalCount > 0`: signalkort (CourierCard border `accent`, fill `accentSoft`): ikon `bell.badge.fill` (24, bold, accent), titel `"Ny order"` (count 1) / `"{N} nya ordrar"` (17, heavy, ink), text `"Signal mottagen. Listan är uppdaterad."` (13, semibold, muted), knapp `"OK"` (13, heavy, vit, horisontell padding 14, höjd 34, accent-kapsel) som nollar räknaren.
- Om `active` ej tom och `matchCount() > 0`: rutt-banner (CourierCard border `routeBlue`, fill `routeBlueSoft`): `"{N} uppdrag passar din pågående rutt"` (15, bold), `"Sorterade efter bästa flöde med din rutt"` (13, semibold, muted).
- Tom lista: EmptyCourierState titel `"Inga uppdrag just nu"`, subtitel `"Du får signal när en ny order kommer in."`, ikon `radar`.
- Annars LazyVStack spacing 12 med `store.sortedJobs()`; varje kort är NavigationLink till JobDetailView.

**Sortering** (`sortedJobs()`): varje jobb paras med `courierMatch(...)`. Om inga aktiva leveranser: ursprungsordning. Annars stigande på `match.score`.

**JobCard**: CourierCard, border `accent` om `match.perfect` annars `line`. VStack spacing 14:
1. Om `match.showMatch`: Pill med `match.badge` (accent, filled om perfect).
2. Rad: restaurangnamn (18, bold, ink) + stad (13, semibold, muted; `"Restaurang"` om stad tom). Höger: avståndspill `"{X.X} km"` (13, bold, horisontell padding 10, höjd 30, vit kapsel med `line`-stroke).
3. Om `match.addedKm`/`addedMinutes` finns: rad med ikon `arrow.triangle.turn.up.right.diamond.fill` (routeBlue), `"+{X.X} km"` (13, heavy), `"~{N} min extra på rutten"` (13, semibold, muted). Padding 10, `routeBlueSoft`, radius 12.
4. StopRow `"Hämta"` (pickupAddress) + StopRow `"Lämna"` (dropoffAddress).
5. Om `customerEtaLabel`: Label med `clock.fill`, text t.ex. `"Förväntas hos kund om {N} min"` (13, heavy, green, horisontell padding 10, höjd 34, greenSoft-kapsel).
6. Om showMatch: `match.reason` (13, semibold, routeBlue).

**StopRow**: prick 12x12 (stroke 2 i färgen; fylld med färgen för pickup, vit för drop), färg pickup `#1F60EE` / drop `#00A776`. Titel UPPERCASED (11.5, bold, färgen), värde = `courierDecodedAddress(...)` (14.5, semibold, ink).

### 18.10 Jobbdetalj (JobDetailView)

Navigationstitel `"Orderdetaljer"`. Matchen räknas om lokalt med `courierMatch(job:accepted:base:vehicle:)`. ScrollView (padding 18, spacing 16) + fast knapp under:

1. Restaurangkort: Avatar (första bokstaven), namn (20, heavy), stad (14, semibold, muted; `"Restaurang"` om tom).
2. Stoppkort: StopRow `"Hämta"` (pickupAddress), Divider (`line`), StopRow med titel = `job.dropoffName` (kundnamnet, inte "Lämna") och dropoffAddress.
3. Två StatBoxar sida vid sida: `"Avstånd"` = `"{X.X} km"`, `"Antal varor"` = `"{N} st"` (N = summan av qty).
4. Om addedKm/addedMinutes: "Smart rutt"-kort (border accent om perfect): rubrik `"Smart rutt"` (16, heavy) + ev. badge-pill, `"+{X.X} km / ~{N} min extra om du accepterar"` (14, bold, ink), `match.reason` (13, semibold, muted).
5. Beställningskort: rubrik `"Beställning"` (12.5, bold, muted); per vara: `"{qty}x"` (15, bold, muted) + namn (15, semibold).
6. Knapp: `"Accepterar..."` (pågår) / `"Acceptera uppdrag"` (PrimaryButtonStyle, padding 18). Vid tryck: `store.accept(job)` och sedan dismiss (oavsett resultat).

### 18.11 Pågående (ActiveTabView)

Header: titel `"Pågående"`, subtitel `"Inget pågår just nu"` (tom) / `"{N} uppdrag pågår"`. Pull-to-refresh = `refreshActive()`. Bottenpadding 100.

- Om aktiva finns: SmartRouteCard överst (se 18.12).
- Tom: EmptyCourierState `"Inga pågående uppdrag"`, `"Acceptera ett uppdrag så hamnar det här."`, ikon `shippingbox`.
- Annars LazyVStack spacing 12, varje kort NavigationLink till `DeliveryFlowView(deliveryId:)`.

**ActiveDeliveryCard**: `picked = delivery.status != EN_ROUTE_PICKUP`. `actionColor` = drop-grön om picked, annars pickup-blå; `actionSoft` motsvarande soft-färg. Kortets border och fill blir actionColor/actionSoft om `picked` ELLER `readyForPickup == true`, annars line/vit.
1. Rad: statuspill med text `"Redo att hämtas"` (readyForPickup och inte picked) / `"Lämna"` (picked) / `"Hämta"` (annars); filled om readyForPickup eller picked. Höger `"#{orderNumber}"` (13, bold, muted).
2. Restaurangnamn (18, heavy, ink).
3. StopRows: picked: en rad `"Nästa stopp"` (drop, dropoffAddress). Ej picked: `"Först"` (pickup, pickupAddress) + `"Sedan"` (drop, dropoffAddress).
4. Ev. ETA-kapsel (som jobbkortet, höjd 32).
5. Footer-rad: `"{X.X} km"` (14, bold), Spacer, `"Fortsätt lämning"` (picked) / `"Hämta"` (14, bold, actionColor) + `chevron.right` (13, bold, actionColor).

### 18.12 Smart rutt (SmartRouteCard + SmartRouteSheet)

**SmartRouteCard** (klickbar CourierCard, border `routeBlue.opacity(0.2)`): ikon `point.topleft.down.curvedto.point.bottomright.up` (16, black, routeBlue) i cirkel 38x38 `routeBlueSoft`. Titel `"Smart rutt"` (18, black, ink). Underrad (13, heavy, muted): `"{N} stopp"` och, endast om `plan.hasReliableDistance`, `"·"` `"{X.X} km"` `"·"` `"~{N} min"` (minuter via `courierRouteMinutes` med valt färdmedel). Höger: knapp med `arrow.up.right` (12, black) + `"Visa"` (13, black), vit text, horisontell padding 12, höjd 34, `routeBlue`-kapsel. Öppnar sheet med detents `[.medium, .large]` och synlig drag-indicator.

**SmartRouteSheet**: NavigationStack, titel `"Smart rutt"` (inline), toolbar-knapp `"Klar"` (15, heavy) som stänger. Innehåll (padding 18, spacing 12):
1. InfoBox-rad (spacing 10): `"Stopp"` = antal; om reliable: `"Rutt"` = `"{X.X} km"` + `"Tid"` = `"~{N} min"`; annars `"Avstånd"` = `"GPS"`. RouteInfoBox: label (11, bold, muted) + värde (15, heavy, ink), padding 10, vit 80% opacity, radius 12.
2. Legend: RouteLegendPill `"Hämtning"` (pickup-blå) + `"Lämning"` (drop-grön). Pill: prick 8x8 + text (12, heavy), färgad text, horisontell padding 10, höjd 28, färg 11% opacity kapsel.
3. Stopplista (spacing 7): RouteStopRow per stopp, numrerade från 1.
4. Knapp `"Öppna i Google Maps"` med ikon `map.fill` (15, heavy, vit), höjd 50, `routeBlue`, radius 14. Bygger URL via `courierGoogleMapsURL` med alla stopp, färdmedlets travelMode, profilens stad och aktuell GPS-position, öppnas med `UIApplication.shared.open`.

**RouteStopRow**: nummercirkel 28x28 fylld i stoppfärgen med index (12, black, vit). Ikon `bag.fill` (pickup) / `house.fill` (drop) (11, black). `stopLabel` (12.5, black, färgen): `"Hämta"` / `"Hämta {N} ordrar"` (grupperad pickup) / `"Lämna"`. Namn (14.5, heavy, ink). Adress som Label med `mappin.and.ellipse` (12, semibold, muted). Om `orderLabel` (t.ex. `"#123, #124"`): kapsel med `number`-ikon (10, black) + text (12, black) i färgen på vit 78% opacity. Radens bakgrund = soft-färgen, radius 14, plus en vänsterkant: 4 px bred rundad rektangel (radius 3) i färgen, vertikal padding 10.

### 18.13 Leveransflödet (DeliveryFlowView)

Steg-enum: `.pickup`, `.deliver`, `.done`. Navigationstitel per steg: `"Hämta"` / `"Leverera"` / `"Klar"`. Leveransen slås upp live ur `store.active` på id; om den försvunnit visas EmptyCourierState `"Leveransen är klar"` / `"Den finns inte längre bland pågående uppdrag."`, ikon `checkmark.circle`. `onAppear`: om `delivery.picked` sätts steget till `.deliver`; samma vid `onChange` av picked. (Steget `.done` sätts aldrig i koden; DoneStepView är i praktiken oanvänd men beskrivs nedan för paritet.)

**Steg 1, PickupStepView** (plocklista):
- Överst: `"#{orderNumber} · {checked}/{total} plockade"` (14, semibold, muted).
- Kort 1: restaurangnamn (19, heavy) + Pill `"#{orderNumber}"`; StopRow `"Hämta hos"` (pickupAddress); kundrad: Avatar 36x36 (första bokstaven i dropoffName), `"Kund"` (12, bold, muted), namn (15, bold).
- Kort 2: rubrik `"Att plocka"` (12.5, bold, muted); checklista per vara: checkbox 26x26 (radius 6, fylld `pickup`-blå med vit `checkmark` 12 heavy när ibockad, annars vit med `line`-stroke) + `"{qty}x {name}"` (15, semibold, ink). Bock togglas per rad (lagras som Set av item-UUID).
- Footer: SwipeConfirm label `"Svep för att bekräfta hämtning"`, hint `"Bocka i alla varor först"`, färg pickup-blå. Ready när `checked.count >= items.count`. Vid bekräftelse: `store.markPicked(delivery)`; vid success: steg = `.deliver`, checklistan nollas.

**Steg 2, DeliverStepView**:
- Överst: `"Till {dropoffName} · {dropoffAddress}"` (14, semibold, muted).
- CourierMap på dropoff-koordinaten, höjd 155, radius 16, `line`-stroke.
- Grönt kundkort (border `green`, fill `greenSoft`): Avatar + namn (19, heavy) + `"{dropoffAddress} · {X.X km}"` (14, semibold, muted). Knapp `"Ring {dropoffName}"` (DeliveryButtonStyle); öppnar `tel:`-URL med telefonnumret rensat från whitespace; disabled + opacity 0.5 om `customerPhone` saknas/tom. Knapp `"Öppna i Google Maps"` (16, bold, green på vit, höjd 48, radius 14, green-stroke); URL med enbart dropoff som destination.
- Leveranssätt-kort (border `green`): rubrik `"Välj leveranssätt"` (12.5, bold, muted); två RadioRows: `"Lämna i handen"` (HANDED) och `"Lämna vid dörren"` (LEFT_AT_DOOR). Om LEFT_AT_DOOR vald: rubrik `"Foto-bevis krävs"` (12.5, bold, muted); ev. fototminiatyr (höjd 150, radius 14, green-stroke); knapp `"Ta foto vid dörren"` (inget foto) / `"Ta om foto"` med ikon `camera.fill` (15, heavy, vit, höjd 48, green, radius 14) som öppnar kameran. Sist: TextField placeholder `"Kort notering till admin (valfritt)"` (flerradig, 14, semibold, padding 13, vit, radius 14, line-stroke).
- Kamera: `UIImagePickerController` i sheet (fullskärm), källa `.camera` om tillgänglig annars `.photoLibrary`, ingen redigering.
- Footer: SwipeConfirm label `"Svep för att leverera"`, hint `"Ta foto först"` (LEFT_AT_DOOR utan foto) / `"Välj leveranssätt först"`, färg green. Ready när metod vald och (foto finns om LEFT_AT_DOOR). Vid bekräftelse: `store.complete(...)` med foto som data-URL: JPEG kvalitet 0.68, `"data:image/jpeg;base64,{base64}"`; vid success dismiss.

**Steg 3, DoneStepView** (oanvänd i nuvarande flöde): grön cirkel 92x92 med vit `checkmark` (38, heavy); `"Leverans klar!"` (26, heavy); `"Ordern är levererad till {dropoffName}"` (15, semibold, muted). Summeringskort: `"Restaurang"`, `"Kund"`, `"Leveranssätt"` (method.label: `"I handen"` / `"Vid dörren"`). Footer-knapp `"Klar"` (DeliveryButtonStyle) som kör complete + dismiss.

### 18.14 Profil (CourierProfileView)

Header: titel `"Profil"`, subtitel = `profile.city` eller `"Kurir"`. Kort i ordning (alla horisontell padding 18):

1. Identitet: Avatar med `profile.initials` (fallback `"JE"`), namn eller `"Kurir"` (20, heavy), `"Aktiv kurir"` (14, semibold, muted).
2. Status: `"Status"` (17, bold), `"Du är online och tar emot uppdrag"` / `"Du är offline"` (14, semibold, muted), OnlineSwitch till höger.
3. `"Mina ordrar"` (17, bold) + `chevron.right` (14, bold, accent), NavigationLink till OrdersHistoryView.
4. Färdmedel: rubrik `"Färdmedel"` (12.5, bold, muted); radioval per `CourierVehicle`: label (16, bold) + subtitle (13, semibold, muted); radiocirkel 22x22 (accent vald, inre prick 10); vald rad: bakgrund `accentSoft`, accent-stroke, radius 12, padding 12. Valet sätter bara `store.selectedVehicle` lokalt (skickas ej till API, påverkar tidsberäkningar och Google Maps-läge).
5. Infokort: SummaryRows `"Telefon"` (profilens phone eller `"-"`), `"Område"` (city eller `"-"`), `"Backend"` (host ur `AppConfig.apiBaseURL`, fallback `"api"`).
6. Textknapp `"Logga ut"` (15, bold, accent, toppadding 10) = `store.logout()`.

### 18.15 Historik (OrdersHistoryView)

Navigationstitel `"Mina ordrar"`. Pull-to-refresh = `refreshHistory()`. Data: `GET /api/courier/history`.

Segmenterad picker (`"Period"`) med `HistoryFilter`: `"Idag"`, `"Igår"`, `"7 dagar"`, `"Eget"`. Vid `"Eget"`: kort med två DatePickers `"Från"` och `"Till"` (endast datum; from default = idag minus 7 dagar).

Filtrering på `deliveredAt` (kalenderdagar): Idag = [startOfDay(nu), +1 dag); Igår = [-1 dag, startOfDay); 7 dagar = [-6 dagar, +1 dag); Eget = [startOfDay(from), startOfDay(to) + 1 dag). Sorteras fallande. Grupperas per `historyDateLabel`: `"Idag"`, `"Igår"` eller datumformat `"d MMM"` med locale `sv_SE`; grupper sorterade fallande på nyaste order.

Tomtillstånd: `"Inga leveranser"` / `"Inga leveranser i vald period."`, ikon `calendar`.

Orderkort: grupprubrik (13, heavy, muted); per order: restaurangnamn (16, bold) + `"#{orderNumber}"` (13, bold, muted); `"Till {dropoffName}"` eller `"Levererad"` om namn saknas (14, semibold, muted); `"Lämnad {proof}"` (13, bold, accent) där proof = `"i handen"` (HANDED) / `"vid dörren"` (LEFT_AT_DOOR) / `"-"`.

OBS: ingen intjäning/payout visas i UI:t trots att `payout`/`tip` finns i modellen.

### 18.16 CourierRoutePlanner (algoritmer)

**Haversine** (`courierDistKm`): jordradie 6371 km, standardformel. **courierSafeLegKm**: nil om någon koordinat ogiltig, avståndet icke-finit eller > 80 km.

**courierPlanSmartRoute(accepted:base:)** returnerar `CourierRoutePlan { stops: [CourierRouteNode], totalKm: Double, hasReliableDistance: Bool, usesLiveStart: Bool }`:
1. Pickup-noder: alla ej-plockade leveranser med giltig pickup grupperas på nyckeln `restaurantName (trimmad, lowercased) | dekodad pickupAddress (lowercased) | lat (5 decimaler) | lng (5 decimaler)`; en nod per grupp med alla orderIds/orderNumbers.
2. Drop-noder: en per leverans med giltig dropoff (även redan plockade).
3. Girig närmaste-granne från `base` (aktuell GPS-position om giltig, annars ingen startpunkt). Begränsning: en drop-nod är bara tillgänglig när dess order är plockad (initialt redan plockade, eller efter att pickup-noden lagts i sekvensen). Utan startpunkt väljs första pickup i listan först.
4. `totalKm` summeras per ben; om ett ben saknar säkert avstånd eller ingen nod är tillgänglig (deadlock) sätts `hasReliableDistance = false`.

**courierRouteMinutes(km, vehicle)**: `round(km / speedKmh * 60)`; 0 om km ogiltigt/negativt/> 80. Hastigheter: BIKE 14 km/h, EBIKE 18 km/h, CAR 28 km/h.

**courierMatch(job:accepted:base:vehicle:)** returnerar `CourierJobMatch { showMatch, perfect, badge, reason, score, addedKm?, addedMinutes? }`:
- Stopplista från accepterade: ej-plockade giltiga pickups + giltiga dropoffs. Om listan tom eller jobbets pickup/dropoff ogiltig: `showMatch=false, score=job.distanceKm`, inga added-värden.
- `pickup` = närmaste befintliga stopp till jobbets pickup, `drop` = närmaste till jobbets dropoff (avstånd 99 som fallback).
- `addedKm`: planera rutt utan respektive med jobbet (via `courierCandidateDelivery`, status EN_ROUTE_PICKUP); om båda planer tillförlitliga: `max(0, expanded.totalKm - current.totalKm)`; annars fallback `min(max(job.distanceKm, 0), 20)`.
- `addedMinutes = courierRouteMinutes(addedKm, vehicle)`.
- `proximityScore = pickupDist * 0.6 + dropDist * 0.4`; `score = addedKm + proximityScore * 0.15`.
- `perfect` om `addedKm < 1.2` ELLER `pickupDist < 0.9`; `good` om inte perfect och `addedKm < 3.0`; `showMatch = perfect || good`.
- `badge`: `"Perfekt matchning"` (perfect) / `"Passar din rutt"` (good) / `""`.
- `reason`: prefix `"+{X.X} km / ~{N} min extra."` (tillförlitliga planer) eller `"Passar nära din rutt."`, följt av `" Hämtas nära {din leverans|din hämtning} vid {adress}"` (`"din leverans"` om närmaste stopp är en drop, annars `"din hämtning"`); om `dropDist < 1.6` läggs `" · lämnas nära {adress}"` till.

**courierDecodedAddress**: trimmar, ersätter `+` med mellanslag och URL-avkodar, upp till 3 iterationer tills stabilt.

**Google Maps-URL** (`courierGoogleMapsURL`): ingen Apple Maps. `https://www.google.com/maps/dir/?api=1&destination={sista punkten}&travelmode={mode}&waypoints={övriga|separerade med "|"}`. Punkter byggs av dekodad adress; staden appendas (`"{adress}, {stad}"`) om den inte redan ingår (case-insensitivt). Koordinater och origin ignoreras medvetet (parametrarna finns men används ej). `travelMode`: CAR ger `"driving"`, BIKE/EBIKE ger `"bicycling"`.

### 18.17 CourierAPI (endpoints)

`CourierAPIClient`, bas-URL = `AppConfig.apiBaseURL`, header `Authorization: Bearer {token}` när token finns, `Content-Type`/`Accept: application/json`. JSON-datum avkodas som ISO 8601.

| Metod | Path | Body | Svar |
|---|---|---|---|
| POST | `/api/courier/login` | `{ email, password }` | `{ token, courier: CourierProfileData }` |
| GET | `/api/courier/me` | | `CourierProfileData` |
| GET | `/api/courier/session` | | `{ online: Bool }` |
| POST | `/api/courier/session/start` | `{}` | `{ ok }` |
| POST | `/api/courier/session/stop` | `{}` | `{ ok }` |
| GET | `/api/courier/jobs` | | `[CourierJob]` |
| GET | `/api/courier/jobs/{id}` | | `CourierJob` (finns men oanvänd i UI) |
| POST | `/api/courier/jobs/{orderId}/accept` | `{}` | `CourierDelivery` |
| GET | `/api/courier/active` | | `[CourierDelivery]` |
| POST | `/api/courier/deliveries/{id}/picked-up` | `{}` | `CourierDelivery` |
| POST | `/api/courier/deliveries/{id}/complete` | `{ method, photoDataUrl?, message? }` | `{ ok }` |
| GET | `/api/courier/history` | | `[CourierHistoryOrder]` |
| POST | `/api/courier/location` | `{ lat, lng }` | `{ ok }` |
| POST | `/api/courier/push/register` | `{ token, platform: "ios-apns" }` | `{ ok }` |

Felhantering: status 401 ger `CourierError.unauthorized` med text `"Sessionen har gått ut. Logga in igen."`. Övriga icke-2xx: serverns `{ error: "..." }` om avkodbart, annars `"Serverfel {statuskod}"`. Ingen HTTP-respons: `"Ingen serverrespons"`. Tom svarskropp accepteras som `{ ok: true }` om `CourierOK` förväntas.

### 18.18 CourierModels (fält för fält)

**CourierCoordinate**: `lat: Double`, `lng: Double`. `isValid` = båda finita, inte (0,0), `|lat| <= 90`, `|lng| <= 180`.

**CourierVehicle** (enum, rawValue = API-sträng):

| Case | Raw | label | subtitle | speedKmh | travelMode |
|---|---|---|---|---|---|
| bike | `"BIKE"` | `"Cykel"` | `"Miljövänligt"` | 14 | bicycling |
| car | `"CAR"` | `"Bil"` | `"Långa sträckor"` | 28 | driving |
| ebike | `"EBIKE"` | `"Elcykel"` | `"Snabbast i stan"` | 18 | bicycling |

`fromAPI(raw)`: `"CAR"` ger car, `"EBIKE"` ger ebike, allt annat (inkl. nil) ger bike.

**CourierDeliveryStatus**: `EN_ROUTE_PICKUP`, `PICKED_UP`, `DELIVERED`.

**CourierProofMethod**: `HANDED` (label `"I handen"`), `LEFT_AT_DOOR` (label `"Vid dörren"`).

**CourierProfileData**: `id: String`, `name: String`, `email: String`, `city: String`, `vehicle: String`, `phone: String?`. Beräknat: `initials` = första bokstaven i första + ev. sista namndelen, uppercased, `"?"` vid tomt namn.

**CourierOrderItem**: `qty: Int`, `name: String` (lokalt UUID-id, inte från API; CodingKeys endast qty + name).

**CourierJob**:

| Fält | Typ |
|---|---|
| id | String |
| orderNumber | String |
| city | String |
| restaurantName | String |
| pickupAddress | String |
| pickup | CourierCoordinate |
| dropoffName | String |
| dropoffAddress | String |
| dropoff | CourierCoordinate |
| distanceKm | Double |
| etaMin | Int |
| vehicle | String |
| payout | Double? |
| tip | Double? |
| expiresAt | Int? |
| items | [CourierOrderItem] |
| pickupDistanceKm | Double? |
| etaReadyAt / etaPickupAt / etaCustomerAt | Date? (ISO 8601) |
| etaCustomerMin | Int? |
| etaPriorityScore | Double? |
| etaReason | String? |

Beräknat: `itemCount` = summa qty. `customerEtaLabel`: om `etaCustomerMin` finns: `"Förväntas hos kund om {N} min"`; annars om `etaCustomerAt` finns: `"Förväntas hos kund {HH:mm}"` (kort tid, locale sv_SE); annars nil. Equatable enbart på id.

**CourierDelivery**: alla CourierJob-fält (utom pickupDistanceKm) plus:

| Fält | Typ |
|---|---|
| orderId | String? |
| status | CourierDeliveryStatus |
| acceptedAt / pickedUpAt / deliveredAt | Int? (epoch) |
| pickupMin / deliverMin / totalMin | Int? |
| customerPhone | String? |
| deliveryNote | String? |
| deliveryInstructions | String? |
| proofMethod | String? |
| proofMessage | String? |
| orderStatus | String? |
| readyForPickup | Bool? |

Beräknat: `picked` = `status != EN_ROUTE_PICKUP`; `customerEtaLabel` som ovan; `asJob` konverterar till CourierJob. Equatable på `id && status && readyForPickup` (styr när SwiftUI ritar om).

**CourierHistoryOrder**: `id: String`, `orderNumber: String`, `restaurantName: String`, `deliveredAt: Date`, `distanceKm: Double?`, `payout: Double?`, `tip: Double?`, `totalMin: Int?`, `dropoffName: String?`, `dropoffAddress: String?`, `proofMethod: String?`.

**CourierLoginResponse**: `token: String`, `courier: CourierProfileData`.

### 18.19 Samlade exakta UI-strängar

| Kontext | Sträng |
|---|---|
| Tabbar | `"Uppdrag"`, `"Pågående"`, `"Profil"` |
| Fel-alert | `"Meddelande"`, `"OK"` |
| Login | `"Kurir"`, `"Logga in för att ta emot uppdrag."`, `"E-post"`, `"Lösenord"`, `"Logga in"`, `"Loggar in..."` |
| Online-switch | `"Online"`, `"Offline"` |
| Offline-läge | `"Du är offline"`, `"Gå online när du vill ta emot nya leveranser."`, `"Gå online"`, `"Startar..."` |
| Jobblista | `"{N} tillgängliga i närheten"`, `"Du tar inte emot uppdrag just nu"`, `"Ny order"`, `"{N} nya ordrar"`, `"Signal mottagen. Listan är uppdaterad."`, `"{N} uppdrag passar din pågående rutt"`, `"Sorterade efter bästa flöde med din rutt"`, `"Inga uppdrag just nu"`, `"Du får signal när en ny order kommer in."` |
| Jobbkort/detalj | `"Hämta"`, `"Lämna"`, `"Restaurang"`, `"+{X.X} km"`, `"~{N} min extra på rutten"`, `"Förväntas hos kund om {N} min"`, `"Förväntas hos kund {HH:mm}"`, `"Orderdetaljer"`, `"Avstånd"`, `"Antal varor"`, `"{N} st"`, `"Smart rutt"`, `"+{X.X} km / ~{N} min extra om du accepterar"`, `"Beställning"`, `"Acceptera uppdrag"`, `"Accepterar..."` |
| Matchning | `"Perfekt matchning"`, `"Passar din rutt"`, `"Passar nära din rutt."`, `"Hämtas nära {din leverans/din hämtning} vid {adress}"`, `" · lämnas nära {adress}"` |
| Pågående | `"Inget pågår just nu"`, `"{N} uppdrag pågår"`, `"Inga pågående uppdrag"`, `"Acceptera ett uppdrag så hamnar det här."`, `"Redo att hämtas"`, `"Nästa stopp"`, `"Först"`, `"Sedan"`, `"Fortsätt lämning"` |
| Rutt-sheet | `"Visa"`, `"{N} stopp"`, `"Stopp"`, `"Rutt"`, `"Tid"`, `"GPS"`, `"Hämtning"`, `"Lämning"`, `"Hämta {N} ordrar"`, `"Öppna i Google Maps"`, `"Klar"` |
| Leveransflöde | `"Hämta"`, `"Leverera"`, `"Klar"`, `"#{N} · {x}/{y} plockade"`, `"Hämta hos"`, `"Kund"`, `"Att plocka"`, `"Svep för att bekräfta hämtning"`, `"Bocka i alla varor först"`, `"Till {namn} · {adress}"`, `"Karta saknas"`, `"Ring {namn}"`, `"Välj leveranssätt"`, `"Lämna i handen"`, `"Lämna vid dörren"`, `"Foto-bevis krävs"`, `"Ta foto vid dörren"`, `"Ta om foto"`, `"Kort notering till admin (valfritt)"`, `"Svep för att leverera"`, `"Ta foto först"`, `"Välj leveranssätt först"`, `"Leverans klar!"`, `"Ordern är levererad till {namn}"`, `"Leveranssätt"`, `"I handen"`, `"Vid dörren"`, `"Leveransen är klar"`, `"Den finns inte längre bland pågående uppdrag."` |
| Profil | `"Profil"`, `"Kurir"`, `"Aktiv kurir"`, `"Status"`, `"Du är online och tar emot uppdrag"`, `"Du är offline"`, `"Mina ordrar"`, `"Färdmedel"`, `"Cykel"`, `"Miljövänligt"`, `"Bil"`, `"Långa sträckor"`, `"Elcykel"`, `"Snabbast i stan"`, `"Telefon"`, `"Område"`, `"Backend"`, `"Logga ut"` |
| Historik | `"Period"`, `"Idag"`, `"Igår"`, `"7 dagar"`, `"Eget"`, `"Från"`, `"Till"`, `"Inga leveranser"`, `"Inga leveranser i vald period."`, `"Till {namn}"`, `"Levererad"`, `"Lämnad i handen"`, `"Lämnad vid dörren"`, `"Lämnad -"` |
| Notiser | `"Nytt uppdrag"`, `"{N} nya uppdrag"`, `"Öppna Uppdrag för att se nya leveranser."` |
| Fel | `"Sessionen har gått ut. Logga in igen."`, `"Serverfel {kod}"`, `"Ingen serverrespons"`, `"Något gick fel. Försök igen."` |
## 19. AddressSheetView (adressväljaren)

### 19.1 När och hur den öppnas

Öppnas som sheet från hemskärmen (HomeView) när användaren trycker på adressraden i headern (`showingAddressSheet = true`). Presentation: `.presentationDetents([.height(590), .large])` med synlig drag-indikator (`.presentationDragIndicator(.visible)`). Bakgrund: appens standardgradient `DeliveraTheme.appBackground`, en LinearGradient topLeading till bottomTrailing med tre stopp: #FCFAF2, #F5FAF5, #FCF5ED, som ignorerar safe area. Hela innehållet ligger i en `VStack(alignment: .leading, spacing: 18)` med `.padding(22)`.

### 19.2 Props och state

Vyn tar emot bindningar (skrivs tillbaka till HomeViews AppStorage):

| Binding/prop | Typ | Backas av |
|---|---|---|
| `deliveryAddress` | String | AppStorage `delivera.deliveryAddress` (default `"Malmö, Sweden"`) |
| `deliveryCityName` | String | AppStorage `delivera.deliveryCityName` (default `"Malmö"`) |
| `deliveryCoordinate` | `Coordinate?` (`lat`, `lng` Double) | Setter skriver AppStorage `delivera.deliveryLatitude` och `delivera.deliveryLongitude` (default 0.0, nil-koordinat skriver 0/0) |
| `pickupCityName` | String | AppStorage `delivera.pickupCityName` (default `"Malmö"`) |
| `recentDeliveryAddresses` | [String] | AppStorage `delivera.recentDeliveryAddresses`, JSON-kodad strängarray, default `["Malmö, Sweden"]` |
| `mode` | `OrderMode` (.delivery/.pickup) | Hemskärmens orderMode |
| `cities` | [City] | Från home-API:t |

Intern state: `draftAddress` (utkast, kopieras från `deliveryAddress` vid onAppear), `selectedCity`, `predictions: [PlacePrediction]`, `sessionToken` (ny `UUID().uuidString` per autocomplete-session), `isResolvingLocation`, `addressError: String?`, `hasEditedAddress` (false tills användaren skriver), `autocompleteTask` (avbrytbar debounce-task).

`onAppear`: `draftAddress = deliveryAddress`, `selectedCity` = stad som matchar `pickupCityName`, annars `deliveryCityName`, annars första staden (case-insensitive namnjämförelse), samt att nuvarande `deliveryAddress` läggs in i senaste-listan via `rememberAddress`.

### 19.3 Layout uppifrån och ner

1. **Header-rad:** Titel `"Välj adress"` (system 29, weight black, design rounded, färg ink #0F0F12). Undertitel beroende på läge: delivery = `"Vi visar restauranger som kan leverera hit."`, pickup = `"Välj stad och hämta maten själv."` (13 semibold, muted #6E6B66). Till höger en stäng-knapp: `xmark`-symbol (13 black, ink) i 36x36-cirkel med bakgrund `Color.black.opacity(0.06)`, stänger sheeten.
2. **Lägesväxlare:** `HStack(spacing: 8)` med en kapselknapp per `OrderMode`. OrderMode: `delivery` med titel `"Delivery"` och SF-symbol `bolt.car.fill`, `pickup` med titel `"Pickup"` och symbol `figure.walk`. Knapp: ikon + text (15 black), höjd 54, `maxWidth: .infinity`, aktiv = vit text på ink-bakgrund (Capsule), inaktiv = `ink.opacity(0.62)` på vit kapsel, alla med 1 pt stroke i `line` (svart 6.5 % opacitet). Vid tryck sätts `mode`; väljs pickup sätts `selectedCity` till stad med `deliveryCityName`s namn, annars behålls valet, annars första staden.
3. **Innehåll:** `deliveryContent` eller `pickupContent` (se nedan).
4. **Spacer.**
5. **Bekräfta-knapp:** Text `"Bekräfta"` (16 black, vit), höjd 56, full bredd, bakgrund orange #F04F1A i RoundedRectangle hörnradie 16 (continuous), skugga `orange.opacity(0.28)` radie 16, y 10. Vid tryck: i delivery-läge trimmas `draftAddress`, om icke-tom sätts `deliveryAddress = trimmed` och adressen sparas i senaste-listan; i pickup-läge sätts `pickupCityName = selectedCity.name` (om en stad är vald). Därefter `dismiss()`. Obs: bekräftelsen geokodar INTE, koordinaten sätts bara via prediction-val eller "Använd min position".

### 19.4 Delivery-innehåll

`VStack(alignment: .leading, spacing: 12)`:

**Sökfält:** HStack(spacing 10) med SF-symbol `location.magnifyingglass` (17 bold, orange) och TextField med placeholder `"Gata, område eller stad"` (16 bold, autocapitalization .words). Horisontell padding 14, höjd 54, vit bakgrund, hörnradie 16 continuous, 1 pt line-stroke. Varje tangenttryck sätter `draftAddress`, `hasEditedAddress = true` och anropar `searchPlaces`.

**Autocomplete-lista:** Visas bara om `hasEditedAddress && !predictions.isEmpty`. `VStack(spacing: 6)` med max 4 predictions (`prefix(4)`), `maxHeight: 190`, transition `.opacity.combined(with: .move(edge: .top))`. Varje rad (PredictionRow): pin-ikon `mappin.and.ellipse` (13 black, orange) i 30x30-cirkel med `orange.opacity(0.1)`-bakgrund, prediction-texten (14 bold, ink, lineLimit 1), horisontell padding 12, höjd 44, vit bakgrund, hörnradie 14 continuous, line-stroke.

**Autocomplete-logik (`searchPlaces`):**
- Föregående `autocompleteTask` avbryts alltid först.
- Guard: `mode == .delivery`, `hasEditedAddress == true` och trimmad input >= 3 tecken, annars töms `predictions`.
- Debounce: `Task.sleep(280 ms)`, avbruten task returnerar tyst.
- Anrop: `GET /api/places/autocomplete?input=<trimmad text>&sessiontoken=<sessionToken>`. Svar: `{ "predictions": [ { "description": String, "place_id": String } ] }`. `PlacePrediction.id = place_id`.
- Resultatet appliceras bara om `hasEditedAddress` fortfarande är true och trimmad `draftAddress` fortfarande är exakt samma sträng som söktes. Fel ger tom lista (inget felmeddelande).
- API-klienten har egen guard: input under 3 tecken returnerar `[]` utan nätverksanrop.

**Val av prediction (`selectPrediction`):**
- `GET /api/places/geocode?place_id=<placeID>&sessiontoken=<sessionToken>`. Svar: `{ "location": { "lat": Double, "lng": Double }, "postalCode": String?, "city": String? }`.
- Vid succé: `deliveryAddress` och `draftAddress` = predictionens `description`, adressen sparas i senaste-listan, `deliveryCoordinate = location`, `deliveryCityName = city ?? tidigare värde`, `pickupCityName = deliveryCityName` (pickup-staden följer med), `predictions = []`, `hasEditedAddress = false`, ny `sessionToken = UUID().uuidString` (Google-sessionen avslutas efter geocode).
- Vid fel: `addressError = "Kunde inte välja adressen."`

**"Använd min position"-knapp (AddressRow):** Ikon i 38x38-cirkel med `accent.opacity(0.1)`-bakgrund (accent = orange), titel 15 black ink, undertitel 12 semibold muted, chevron.right (12 black, secondary) till höger, padding 12, bakgrund `white.opacity(0.82)`, hörnradie 16 continuous, line-stroke. Normalläge: symbol `paperplane.fill`, titel `"Använd min position"`, undertitel `"Hämta adress automatiskt"`. Under hämtning (`isResolvingLocation`): symbol `location.circle`, titel `"Hämtar plats..."`, knappen disabled.

Flöde (`useCurrentLocation`): `isResolvingLocation = true`, `addressError = nil`. `LocationService.requestLocation()` (se 19.6), sedan `GET /api/places/reverse?lat=<latitude>&lng=<longitude>`. Svar: `{ "address": String, "postalCode": String?, "city": String? }`. Vid succé: `deliveryAddress`/`draftAddress` = `reverse.address`, adressen sparas, `deliveryCoordinate = Coordinate(lat, lng)` från GPS-positionen, `deliveryCityName = reverse.city ?? tidigare`, `pickupCityName = deliveryCityName`, predictions töms, `hasEditedAddress = false`. Vid fel: `addressError = "Kunde inte hämta platsen. Kontrollera platsbehörighet."`

**Senaste adresser:** Visas om listan är icke-tom. Rubrik `"Senast valda"` (12 black, muted). Max 3 rader (`prefix(3)`), varje rad är en AddressRow med symbol `clock.arrow.circlepath`, titel = adressen, undertitel `"Adress"`, accent = ink. Tryck sätter `draftAddress` OCH `deliveryAddress` direkt till adressen, tömmer predictions och sätter `hasEditedAddress = false` (koordinat ändras inte).

**Felrad:** Om `addressError` finns visas den som text 12 bold i orange längst ner i delivery-innehållet.

**Senaste-listans logik (`rememberAddress`):** trimma; tom sträng ignoreras; ta bort befintlig case-insensitive dubblett; sätt in först; behåll max 3 (`prefix(3)`). Persisteras som JSON-array i `delivera.recentDeliveryAddresses`.

### 19.5 Pickup-innehåll

Rubrik `"Tillgängliga städer"` (13 black, muted). `LazyVGrid` med `GridItem(.adaptive(minimum: 128), spacing: 10)`, radspacing 10. Varje stad: HStack med namnet (14 black), Spacer, samt `checkmark` (12 black, vit) om vald. Vald = vit text på orange bakgrund, ovald = ink-text på vit. Horisontell padding 12, höjd 44, hörnradie 14 continuous, line-stroke. Tryck sätter bara `selectedCity`, `pickupCityName` skrivs först vid "Bekräfta".

### 19.6 LocationService

`CLLocationManager`-wrapper (`@MainActor`, ObservableObject). Published: `authorizationStatus`, `latestLocation`, `errorMessage`. `desiredAccuracy = kCLLocationAccuracyHundredMeters`. `requestLocation()` (async throws): nollar `errorMessage`; om status `.notDetermined` anropas `requestWhenInUseAuthorization()` (behörighetsdialogen visas); därefter one-shot `manager.requestLocation()` bryggad via CheckedContinuation. Delegate: `didUpdateLocations` tar sista positionen, sätter `latestLocation` och resumar; `didFailWithError` sätter `errorMessage = "Kunde inte hämta din plats."` och kastar felet vidare. Obs: ingen retry om användaren nekar, felet fångas av anroparen (adressvyn visar sin egen felsträng).

### 19.7 Zonvalidering (görs i HomeView, inte i sheeten)

- Endpoint: `POST /api/cities/validate-location` med body `{ "lat": Double, "lng": Double }` (ZoneValidationRequest).
- Svar (ZoneValidationResponse): `{ "covered": Bool, "cities": [ZoneCity] }`. ZoneCity: `{ "id": String?, "name": String?, "restaurants": [ZoneRestaurant] }`. ZoneRestaurant: `{ "id": String, "name": String, "slug": String, "isOpen": Bool?, "deliveryFee": Double?, "minOrderAmount": Double?, "etaMinutes": Int?, "matchedZone": MatchedZone? }`. MatchedZone: `{ "deliveryFee": Double?, "minOrder": Double?, "etaMinutes": Int? }` där deliveryFee och minOrder är i ÖRE, klienten exponerar `feeKr = deliveryFee/100` och `minOrderKr = minOrder/100` (detta är undantaget från "dela aldrig igen"-regeln: validate-location returnerar öre).
- Trigger: `.task(id: zoneTaskID)` i HomeView där `zoneTaskID = "<orderMode.rawValue>-<deliveryLatitude>-<deliveryLongitude>"`, dvs varje byte av läge eller koordinat kör om `refreshZoneRestaurants()`, plus en gång vid appstart.
- `refreshZoneRestaurants()`: i pickup-läge töms zonkartan. Utan koordinat (lat/lng = 0) läses cachad karta från AppStorage. Annars anropas API:t, alla restauranger i `cities[].restaurants` läggs i en dictionary nycklad på BÅDE `id` och `slug`, sparas i state och som JSON i AppStorage `delivera.zoneRestaurants` (default `"{}"`). Vid nätverksfel behålls/återläses cachen. Efter varje utfall synkas kundvagnens fulfilment (`syncCartFulfillment`: orderMode, adress, aktuell leveransavgift, koordinat).
- Användning: restaurangkorten och kassan slår upp `zoneRestaurants[restaurant.id] ?? zoneRestaurants[restaurant.slug]`. ETA-prioritet: `matchedZone.etaMinutes ?? zoneRestaurant.etaMinutes ?? restaurant.etaMinutes ?? 30`. Avgiftsprioritet: `matchedZone.feeKr ?? zoneRestaurant.deliveryFee/100 ?? restaurant.deliveryFee ?? 0`. I pickup-läge skickas alltid en tom zonkarta till listorna, dvs restaurangernas defaultvärden gäller. `covered`-flaggan konsumeras inte av hemskärmen, "utanför zon" yttrar sig som att restaurangen saknar zonmatch och faller tillbaka på defaultvärden; separat validering görs även i restaurangdetaljens viewmodel.

## 20. Live Activity och order-widgeten

### 20.1 LiveActivityManager (appen)

Singleton `LiveActivityManager.shared`, allt gated bakom `#if canImport(ActivityKit)` och `#available(iOS 16.2, *)` samt `ActivityAuthorizationInfo().areActivitiesEnabled`.

**startOrUpdate(order:)** anropas från HomeView vid: (1) betalning klar i kassan (`onPaymentCompleted`), (2) varje lyckad poll av aktiv order (5 s-intervall aktiv, 20 s terminal, backoff vid fel), (3) återställd order vid appstart (`restoreActiveOrderIfNeeded`), (4) statusförflyttning och pickup-position-uppdatering. Logik:
- Finns redan en aktivitet med samma `attributes.orderId` (i intern dictionary eller i `Activity.activities`): återanvänd, avsluta ev. dubbletter immediate, uppdatera innehållet och säkerställ token-observation.
- Reentransskydd via `startingOrderIds`-set (pågående start ger bara update).
- Annars: skapa `OrderActivityAttributes` och begär aktivitet med `pushType: .token`. Misslyckas det loggas felet och en lokal aktivitet utan pushType begärs som fallback.

**update(order:)** uppdaterar alla aktiviteter som matchar orderId med nytt ContentState, `staleDate: nil`.

**end(orderId:)** avbryter token-tasken och avslutar alla matchande aktiviteter med `dismissalPolicy: .immediate`. Anropas när ordern blivit terminal och utgången (`shouldExpireActiveOrder`), vid 404 från tracking-API:t (order borttagen), vid restore-404, och när användaren tar bort den aktiva ordern (`abandonOrder`).

**Push-token-flödet:** `observePushToken(orderId:)` startar (en gång per order) en Task som lyssnar på `Activity.activityUpdates` filtrerat på orderId, och för varje aktivitet itererar `pushTokenUpdates`. Varje token hex-kodas (`%02x` per byte, konkatenerad) och registreras via `POST /api/orders/:orderId/live-activity-token` med body `{ "token": String }`. Fel loggas bara. Servern kan därefter pusha uppdateringar via APNs.

**ContentState byggs så här från ActiveHomeOrder:**

| Fält | Värde |
|---|---|
| `status` | pending/accepted -> `"accepted"`, preparing -> `"preparing"`, delivering -> `"ready_pickup"` (pickup) eller `"on_the_way"` (delivery), delivered -> `"delivered"` |
| `statusText` | `order.displayStatusTitle` (samma svenska statustitel som hemskärmens tracker) |
| `progressStep` | pending/accepted = 0, preparing = 1, delivering/delivered = 2 |
| `etaMinutes` | nil om ordern är terminal; annars `ceil(etaEndsAt - nu, i minuter)` klämd till >= 0; fallback: siffrorna extraherade ur `order.etaText` |
| `driverName` | `order.courierName` endast om `order.shouldShowCourierLocation`, annars nil |
| `orderType` | `"PICKUP"` vid pickup, annars `"DELIVERY"` |
| `etaEndsAt` | `order.etaEndsAt` som Unix-sekunder (Double?) |

### 20.2 OrderActivityAttributes (delad modell, måste vara byte-identisk i widget och app)

Statiska attribut: `orderId: String`, `displayOrderNumber: String`, `restaurantName: String`, `orderTotal: String` (färdigformaterad pristext, sätts via `priceText(order.total)`).

ContentState (`OrderState`): `status: String`, `statusText: String`, `progressStep: Int`, `etaMinutes: Int?`, `driverName: String?`, `orderType: String?`, `etaEndsAt: Double?` (Unix-sekunder). Obs: `status` och `driverName` sätts men läses inte av widgetens UI, widgeten styr allt på `progressStep`, `orderType`, `statusText`, `etaMinutes`, `etaEndsAt`.

### 20.3 Widgetens färger (egna definitioner i widget-target)

| Namn | Color(red:green:blue:) | Hex |
|---|---|---|
| deliveraOrange | 0.96, 0.27, 0.08 | #F54514 |
| deliveraInk | 0.05, 0.05, 0.06 | #0D0D0F |
| deliveraMuted | 0.44, 0.44, 0.46 | #707075 |
| deliveraSoft | 1.0, 0.96, 0.91 | #FFF5E8 |
| deliveraGreen | 0.11, 0.70, 0.36 | #1CB35C |
| deliveraGold | 0.96, 0.67, 0.10 | #F5AB1A |

(deliveraMuted och deliveraSoft definieras men används inte i nuvarande layout.)

### 20.4 Statussteg (LiveStep)

Tre steg beroende på `orderType`. Aktivt steg = `clampedStep(progressStep, count)` (klämd 0..count-1). `showsTimer` styr om compact trailing i Dynamic Island visar nedräkning.

Delivery:

| Index | Titel | SF-ikon | Färg | showsTimer |
|---|---|---|---|---|
| 0 | `"Mottagen"` | checkmark.circle.fill | deliveraGold | nej |
| 1 | `"Tillagas"` | flame.fill | deliveraOrange | ja |
| 2 | `"På väg"` | car.fill | deliveraGreen | ja |

Pickup: samma index 0 och 1, men index 2 = titel `"Hämta"`, ikon `bag.fill`, färg deliveraGreen, showsTimer nej.

Aktiv stegfärg (`active.color`) genomsyrar hela widgeten: totalpris, statusikon, countdown, keyline, brandikonens gradient.

### 20.5 Lock screen-layout (OrderLiveExpandedView, showHeader = true)

`VStack(alignment: .leading, spacing: 13)`, padding 16, bakgrund: deliveraInk + RadialGradient (`active.color.opacity(0.34)` -> clear, center topTrailing, startRadius 4, endRadius 170) + LinearGradient (`white.opacity(0.08)` -> clear, topLeading -> bottomTrailing), klippt till RoundedRectangle hörnradie 28 continuous. Aktivitetens systemfärger: `activityBackgroundTint(.deliveraInk)`, `activitySystemActionForegroundColor(.deliveraOrange)`.

1. **Headerrad:** ActivityBrandIcon storlek 32 (rundad kvadrat, hörnradie = 0.28 x storlek, LinearGradient deliveraOrange -> aktiv färg, vit roterad 45-graders kvadratkontur som logotyp, linjebredd max(2, 0.09 x storlek), padding 0.30 x storlek). Bredvid: `"Delivera"` (15 heavy rounded, vit) över `displayOrderNumber` (10 black rounded, `white.opacity(0.48)`, lineLimit 1). Spacer. `orderTotal` (14 heavy rounded, aktiv stegfärg).
2. **Statusrad:** cirkel 38x38 fylld `active.color.opacity(0.16)` med aktiva stegets ikon (17 bold, aktiv färg). Bredvid: `restaurantName` (17 heavy rounded, vit, lineLimit 1) över `statusText` (12 bold rounded, `white.opacity(0.62)`, lineLimit 1). Spacer(minLength 8). CountdownBadge.
3. **ProgressTrack:** horisontell rad med de tre stegen. Varje steg: cirkel 18x18, fylld med stegfärgen om `index <= current`, annars `white.opacity(0.14)`; inuti `checkmark` om steget är passerat (`index < current`), annars stegets egen ikon (8 heavy, vit om done annars `white.opacity(0.52)`). Under cirkeln stegets titel (9, heavy om aktuellt steg annars bold, rounded; aktiv stegfärg om aktuellt annars `white.opacity(0.48)`, lineLimit 1, minimumScaleFactor 0.75). Mellan stegen en kapsel-linje höjd 3, horisontell padding -10, bottom-padding 18, fylld med NÄSTA stegs färg om `index < current`, annars `white.opacity(0.13)`.

**CountdownBadge:** om `etaEndsAt` finns och ligger i framtiden: `Text(timerInterval: nu...etaEndsAt, countsDown: true)` (13 heavy rounded, monospacedDigit, aktiv färg), dvs en live-tickande nedräkning som iOS driver själv. Annars om `etaMinutes` finns: `"~\(etaMinutes) min"` (samma stil). Annars ingenting.

### 20.6 Dynamic Island

Aktiva steget beräknas likadant. `keylineTint(active.color)`. **Deep link:** `.widgetURL(URL(string: "delivera://order/\(orderId)"))`, tap öppnar appen på ordern (gäller Dynamic Island-regionerna; lock screen-vyn öppnar appen som helhet).

- **Expanded leading:** ActivityBrandIcon storlek 24 + `"Delivera"` (14 heavy rounded, vit).
- **Expanded trailing:** CountdownBadge (samma logik som lock screen).
- **Expanded bottom:** `OrderLiveExpandedView(showHeader: false)`: samma statusrad + ProgressTrack men utan headerrad, spacing 10, padding 12, ikoncirkel 34x34, restaurangnamn 15, ikon 15, hörnradie 22.
- **Compact leading:** ActivityBrandIcon storlek 21.
- **Compact trailing:** om aktiva steget har `showsTimer` och `etaEndsAt` ligger i framtiden: tickande timer (11 heavy rounded, monospacedDigit, aktiv färg, fast bredd 45), annars aktiva stegets ikon (13 bold, aktiv färg).
- **Minimal:** ActivityBrandIcon storlek 21.

### 20.7 Livscykel-sammanfattning

| Händelse | Åtgärd |
|---|---|
| Betalning klar | startOrUpdate (aktivitet skapas, pushType .token, fallback lokal) |
| Poll var 5:e s (aktiv) / 20:e s (terminal) | startOrUpdate (uppdaterar state) |
| Ny push-token från iOS | POST /api/orders/:orderId/live-activity-token `{ token }` (hex) |
| App-start med sparad activeOrderId | restore -> startOrUpdate, eller end vid 404/utgången |
| Order terminal + utgången enligt shouldExpireActiveOrder | end (immediate dismissal) |
| Tracking-API svarar 404 | clearActiveOrderState + end |
| Användaren tar bort aktiv order | POST /api/orders/:orderId/abandon + end |
