# FCM-setup (Android push notifications)

Push-koden är klar i appen. Det enda manuella steget är att lägga till
`google-services.json` från Firebase Console.

## Steg-för-steg

1. Gå till https://console.firebase.google.com → "Add project" → namn: `MatGo Business`
2. När projektet är skapat: "Add app" → välj **Android**
3. Ange:
   - Android package name: **`com.matgo.restaurant`**
   - App nickname: `MatGo Business`
   - SHA-1: lämna tomt först (kan läggas till senare för App Indexing)
4. Klicka "Register app"
5. **Ladda ner `google-services.json`** och lägg den i:
   ```
   mobile_apps/restaurant_mobile/android/app/google-services.json
   ```
6. Lägg till filen i `.gitignore` om den innehåller hemligheter du inte
   vill committa (vanligen ok att committa eftersom keys är klient-sida)

## Servern

Backend behöver två endpoints (de finns inte än):

- `POST /api/account/push-token` – body: `{ platform: "android", token: "..." }`
  → spara FCM-token kopplat till restaurang/admin
- `POST /api/account/push-token/remove` – body: `{ token: "..." }`
  → ta bort vid logout

När en ny order kommer in: skicka push via FCM HTTP v1 API till alla
registrerade tokens för den restaurangen.

## Testa

```bash
# Bygg APK med push aktiverat
./scripts/build_apk.sh production

# Installera på enhet
adb install build/app/outputs/flutter-apk/app-release.apk

# Skicka test-push från Firebase Console → Cloud Messaging → Send test message
```
