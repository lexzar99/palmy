# Delivera Courier — App Store-inlämning (iOS)

Komplett checklista för att få **Delivera Courier** godkänd och publicerad i App Store.
Bundle ID: **`se.delivera.courier`** · iPhone-only · portrait · iOS 13+.

---

## 0. Förutsättningar (engångs)

| Steg | Vad | Var |
|------|-----|-----|
| Apple Developer Program | 99 USD/år, krävs för att publicera | <https://developer.apple.com/programs/> |
| App Store Connect-record | Skapa appen, koppla bundle-id | <https://appstoreconnect.apple.com> |
| Bundle ID | Registrera `se.delivera.courier` (Identifiers → App IDs) | Developer Portal → Certificates, IDs & Profiles |
| Signing | Använd "Automatically manage signing" i Xcode med ditt team | Xcode → Runner → Signing & Capabilities |

> Bundle-id, display-namn (`Delivera Courier`), iPhone-only och portrait är **redan satta** i `ios/Runner.xcodeproj` + `Info.plist`. Du behöver bara välja ditt Team i Xcode.

---

## 1. Det som redan är gjort i koden ✅

- **Display-namn**: `CFBundleDisplayName = Delivera Courier`.
- **Behörighets-strängar** (annars kraschar/avvisas appen — Guideline 5.1.1):
  - `NSLocationWhenInUseUsageDescription` — position delas medan kuriren är online.
  - `NSCameraUsageDescription` — valfritt leveransfoto.
  - `NSPhotoLibraryAddUsageDescription` — spara leveransfoto.
- **Export compliance**: `ITSAppUsesNonExemptEncryption = false` (bara HTTPS → ingen årlig export-fråga vid varje build).
- **App-ikon**: genererad i alla storlekar inkl. 1024×1024 **utan alpha** (`remove_alpha_ios: true`). Apple avvisar ikoner med transparens.
- **Launch screen**: `LaunchScreen.storyboard` finns.
- **Kontoborttagning** (Guideline 5.1.1(v)): "Begär borttagning av konto" på Konto-fliken (mailto till supporten — konton skapas av admin, så självservice-radering sker via begäran).
- **Endast standardkryptering**, ingen bakgrundsplats → enklare granskning.

---

## 2. App Privacy ("nutrition label") — App Store Connect → App Privacy

Appen samlar **plats** och (valfritt) **foto**. Fyll i exakt så här:

| Datatyp | Samlas? | Kopplad till identitet? | Spårning? | Syfte |
|---------|---------|--------------------------|-----------|-------|
| **Precise Location** | Ja | Ja (kopplas till kurir-kontot) | Nej | App Functionality (leveransspårning) |
| **Email Address** | Ja | Ja | Nej | App Functionality (inloggning) |
| **Name** | Ja | Ja | Nej | App Functionality |
| **Photos** (leveransfoto) | Ja, valfritt | Ja | Nej | App Functionality (leveransbevis) |

- **Tracking**: Nej (vi delar inte data med tredje part för annonsering) → ingen `NSUserTrackingUsageDescription`/ATT behövs.
- **Privacy Policy URL** är **obligatoriskt** eftersom platsdata samlas. Lägg upp en sida (t.ex. `https://delivera.se/privacy-courier`) och ange URL:en i App Store Connect → App Information.

---

## 3. App Review-information (det vanligaste avvisnings-skälet)

Granskaren **måste kunna logga in och se appen fungera**. Annars: Guideline 2.1 (avvisad).

- **Demokonto**: Skapa ett riktigt kurir-konto i admin och lägg in i App Review Notes:
  ```
  E-post: review@delivera.se
  Lösenord: ********
  ```
- **Notes till granskaren** (klistra in):
  ```
  Detta är en B2B-leveransapp för bud anställda/anlitade av Delivera.
  Konton skapas av Delivera-admin; bud kan inte själva registrera sig.
  Logga in med demokontot ovan. Tryck "Gå online" för att se tillgängliga
  uppdrag. Platsdelning sker endast medan man är online och stoppas vid offline.
  För att se ett uppdrags-flöde, lägg ett testköp i kund-appen i staden "Lund"
  så dyker uppdraget upp, eller kontakta oss så lägger vi en testorder i kö.
  ```
- **Viktigt**: Backend (`https://api.delivera.se`) måste vara uppe och demokontot ha minst ett tillgängligt uppdrag under granskningen, annars ser granskaren en tom skärm (risk för Guideline 2.1 "vi kunde inte hitta funktionalitet").

---

## 4. Material som måste laddas upp

| Artefakt | Krav |
|----------|------|
| **Skärmdumpar** | iPhone 6.7" (1290×2796) **och** 6.5" (1242×2688). 3–5 st: onboarding, uppdragslista, uppdragsdetalj, leveransflöde, konto/intjäning. |
| **Beskrivning** | Svensk + ev. engelsk text. Förklara att det är en bud-app för Delivera-partners. |
| **Nyckelord, support-URL, marknadsförings-URL** | Support-URL obligatorisk. |
| **Åldersgräns** | Fyll i frågeformuläret → troligen 4+. |
| **Kategori** | Primär: *Business* eller *Food & Drink*. |

> Tips: skärmdumpar kan tas i Simulator (iPhone 15 Pro Max = 6.7"). `flutter run` → `Cmd+S` i simulatorn.

---

## 5. Bygg & ladda upp (TestFlight → App Store)

```bash
cd "mobile_apps/Delivera courier"

# 1. Ren build
flutter clean && flutter pub get

# 2. CocoaPods
cd ios && pod install && cd ..

# 3. Öppna i Xcode och välj Team för signering
open ios/Runner.xcworkspace
#    Runner → Signing & Capabilities → Team = <ditt Apple Team>

# 4. Skapa release-arkiv (gör detta i Xcode, INTE expo/flutter run):
#    Xcode → Product → Destination = "Any iOS Device (arm64)"
#            Product → Archive
#    → Organizer öppnas → Distribute App → App Store Connect → Upload
```

> Projektets konvention (minne): **iOS-builds görs via Xcode (Archive), inte `flutter run`/prebuild.** Flutter används bara för `pub get` / kodbygget; arkivering + uppladdning sker i Xcode.

Alternativ helt från terminalen (om signering är förkonfigurerad):
```bash
flutter build ipa --release
# → build/ios/ipa/*.ipa, ladda upp med Transporter-appen eller `xcrun altool`.
```

---

## 6. Capabilities att slå på i Xcode (Signing & Capabilities)

| Capability | Behövs? | Varför |
|------------|---------|--------|
| Push Notifications | **Senare** | Webb-kuriren har web-push. Native push (APNs) kan läggas till i v1.1. Inte krävt för v1. |
| Background Modes → Location updates | **Nej (v1)** | Vi använder bara "when in use". Lägg till endast om ni vill dela plats med släckt skärm (kräver `NSLocationAlwaysAndWhenInUseUsageDescription` + extra granskning). |
| Associated Domains | Nej | Ingen universal-link ännu. |

Inga betalnings-capabilities (StoreKit) behövs — kuriren betalas utanför appen, så **ingen In-App Purchase** krävs (Guideline 3.1.3(e), "Goods & Services Outside the App", gäller för fysiska tjänster).

---

## 7. Vanliga avvisnings-skäl & hur vi undvikit dem

| Guideline | Risk | Status |
|-----------|------|--------|
| 2.1 Completeness | Tom skärm / inget att granska | ⚠️ Säkerställ demokonto + en kö-lagd testorder |
| 5.1.1 Data permission strings | Saknad/otydlig syftes-text | ✅ Tydliga svenska strängar tillagda |
| 5.1.1(v) Account deletion | Ingen väg att radera konto | ✅ "Begär borttagning" på Konto |
| 5.1.2 Privacy policy | Saknas vid platsinsamling | ⚠️ Lägg upp Privacy Policy-URL |
| 4.2 Minimum functionality | "Bara en webbvy" | ✅ Native Flutter, riktiga flöden |
| 2.5.4 Background location | Plats i bakgrund utan synligt behov | ✅ Endast "when in use" |
| Icon alpha | Transparent ikon | ✅ `remove_alpha_ios` |

---

## 8. Återstående TODO innan första submit

- [ ] Välj Apple Team i Xcode (signering).
- [ ] Registrera bundle-id `se.delivera.courier` i Developer Portal.
- [ ] Publicera Privacy Policy och ange URL:en i App Store Connect.
- [ ] Skapa demokonto + se till att en testorder ligger i kö under granskning.
- [ ] Ta 6.7"- och 6.5"-skärmdumpar.
- [ ] (Valfritt v1.1) Native APNs-push så bud får notiser med stängd app.
- [ ] (Valfritt) Byt ut platshållar-ikonen mot en kurir-specifik variant (samma guldmärke används nu som Business-appen).
