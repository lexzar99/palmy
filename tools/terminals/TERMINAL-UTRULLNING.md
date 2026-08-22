# Rulla ut ViaEats-terminaler

Så här gör du en ny Sunmi V2 Pro redo. Räkna med ett par minuter per platta.

## Innan du börjar

1. **Plattan får inte ha något Google-konto.** Android vägrar sätta Device
   Owner på en enhet som har konton, och det är Device Owner som gör hela
   låsningen möjlig. Har plattan redan ett konto: `Inställningar → Konton`,
   ta bort det, eller fabriksåterställ.
2. Slå på USB-felsökning: `Inställningar → Om enheten` → tryck sju gånger på
   byggnumret → `Utvecklaralternativ → USB-felsökning`.
3. Koppla in via USB och godkänn datorns nyckel på plattans skärm.

## Kör

Bygg APK:n en gång:

```bash
cd "mobile_apps/Delivera Android" && ./gradlew :partner:assembleSunmiRelease
```

Sedan, med en till tre plattor inkopplade:

```bash
cd "mobile_apps/Delivera Android/tools" && ./provision-terminal.sh --all-devices
```

Skriptet kör varje ansluten platta i tur och ordning och skriver en
sammanfattning på slutet. En platta som fallerar stoppar inte de andra.

| Kommando | Gör |
| --- | --- |
| `--all-devices` | Hela presetet på alla anslutna plattor |
| *(inget)* | Hela presetet på en platta |
| `--app-only` | Bara installera om APK:n, rör inte låsningen |
| `--status` | Visa läget utan att ändra något |

## Vad presetet gör

- Installerar partner-appen
- Sätter tidszon (Stockholm eller Bryssel), 24-timmarsklocka och automatisk tid
- Gör appen till **Device Owner** — det är det som ersätter en betald MDM
- Döljer alla appar utom **Inställningar** och **ViaEats**
- Stänger av Sunmis fjärrsupportapp, som inte går att dölja (den är själv en
  device admin)
- Stänger av notiser för alla andra appar
- Undantar ViaEats från batterioptimering
- Låser skärmen till att aldrig slockna, även på batteri
- Spärrar fabriksåterställning, felsäkert läge och avinstallation

Inställningar lämnas kvar med flit: utan den går det inte att byta Wi-Fi på
plats, och varje nätverksbyte hade blivit ett supportärende.

Om skriptet varnar om att tidszonen inte gick att sätta: `setprop` kräver
behörighet som Sunmis ROM sällan ger adb, och automatisk tidszon hämtas från
mobilnätet — plattorna har inget SIM. Sätt den då för hand under
`Inställningar → Datum och tid → Tidszon`. Klockslaget i sig hämtas över
Wi-Fi och blir rätt ändå.

Både `Europe/Stockholm` och `Europe/Brussels` godkänns. Zonerna delar CET/CEST
och följer samma EU-regler för sommartid, så klockan går exakt lika — och
plattorna levereras ofta med Bryssel förvalt. Det är namnet som skiljer, inte
tiden, så det är inget att jaga.

## Efteråt

Para plattan i admin under **Enheter** → *Koppla enhet*.

## Om något går fel

**Servicekoden** låser upp en platta på plats: gå till `Inställningar` i
ViaEats-appen och **håll fingret på versionsraden längst ned**. Skriv in koden
så får du tre val — lås upp, lås igen, eller ta bort låsningen helt.

Koden finns bara i ägarens anteckning. Den ligger inte i appen (bara en
PBKDF2-hash av den), så den går inte att gräva fram ur APK:n.

**Lägg aldrig till ett Google-konto på en låst platta.** Det bryter inte
låsningen som redan sitter, men enheten går inte att provisionera om utan
fabriksåterställning.

## Uppdatera appen på plattor som redan är ute

Gå inte ut med USB-kabel. Ladda upp den nya APK:n i admin under **Enheter →
Ladda upp ny uppdatering**. Personalen trycker sedan `Inställningar → Sök
efter uppdatering` på plattan, får en engångskod och en sida som hämtar och
installerar den. En ny version påminner om sig själv en gång per dygn.

Kom ihåg att **höja `versionCode`** i `partner/build.gradle.kts` före bygget.
Android installerar aldrig samma versionCode igen — plattan svarar
"Appen är inte installerad", vilket ser ut som ett signeringsfel men inte är
det.
