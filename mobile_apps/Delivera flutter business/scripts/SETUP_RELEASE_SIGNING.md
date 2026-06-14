# Release signing — VIKTIGT att läsa

## Vad har genererats

- `android/matgo-release-key.jks` — Java keystore (RSA 2048-bit, 10 års giltighet)
- `android/key.properties` — lösenord och alias
- `android/app/build.gradle` använder dessa för release-builds

## ⚠️ KRITISKT — säkerhetskopiera keystore omedelbart

Om denna keystore försvinner kan du **ALDRIG mer publicera uppdateringar**
till samma app på Google Play. Du måste publicera under nytt
package-name och alla användare måste avinstallera + installera om.

### Säkerhetskopiera till minst två ställen:

```bash
# 1Password / Bitwarden / annan password manager
cat android/key.properties
# Lägg in storePassword, keyPassword, keyAlias som secure note

# Krypterad backup (USB-sticka, extern disk, etc)
cp android/matgo-release-key.jks ~/Backups/matgo-keystore-2026-05.jks
cp android/key.properties ~/Backups/matgo-keystore-2026-05.properties
```

### Information du MÅSTE spara:

| Fält | Värde |
|------|-------|
| Keystore file | `matgo-release-key.jks` |
| Alias | `matgo` |
| Store password | (se `key.properties`) |
| Key password | (se `key.properties`, samma som store) |
| Validity | 10 år från 2026-05-03 |
| Algorithm | RSA 2048-bit |
| Distinguished Name | CN=MatGo Business, OU=Mobile, O=MatGo, L=Stockholm, S=Stockholm, C=SE |

## Build release APK

```bash
./scripts/build_apk.sh production
# → build/app/outputs/flutter-apk/app-release.apk
```

Verifiera att den är signerad korrekt:

```bash
$ANDROID_HOME/build-tools/*/apksigner verify --print-certs build/app/outputs/flutter-apk/app-release.apk
# Ska visa "Signer #1 certificate DN: CN=MatGo Business, ..."
```

## Google Play uppladdning

Om du planerar att publicera på Play Store:

1. Använd Google Play App Signing (rekommenderat) — du laddar upp denna
   keystore som "upload key", Google hanterar produktions-keystore
2. Eller lita på din egen keystore — då måste backup vara perfekt

`.gitignore` är redan uppdaterad så `key.properties` och `*.jks`
**aldrig committas**.
