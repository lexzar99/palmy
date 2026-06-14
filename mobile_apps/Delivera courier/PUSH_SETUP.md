# Native push (FCM) — aktivering

Koden är klar och **guardad**: utan Firebase-config är push en tyst no-op och
appen funkar via polling. För att slå på notiser-när-appen-är-stängd:

## 1. Skapa/koppla Firebase-projekt
```bash
dart pub global activate flutterfire_cli
cd "mobile_apps/Delivera courier"
flutterfire configure
```
Välj (eller skapa) ett Firebase-projekt och båda plattformarna. Det genererar:
- `lib/firebase_options.dart`
- `android/app/google-services.json`
- `ios/Runner/GoogleService-Info.plist`
- applicerar google-services Gradle-pluginen

> Bundle/applicationId: **se.delivera.courier** (måste matcha i Firebase).

Om du använder `firebase_options.dart`, byt `Firebase.initializeApp()` mot
`Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform)` i
`lib/core/push_service.dart` och `firebaseMessagingBackgroundHandler`.

## 2. iOS — APNs
1. Ladda upp din **APNs Auth Key (.p8)** i Firebase Console → Project Settings →
   Cloud Messaging → Apple app config.
2. I Xcode: lägg till **Push Notifications** + **Background Modes
   (Remote notifications)** capabilities på Runner-targeten.
3. Lägg `ios/Runner/Runner.entitlements` i targetens *Code Signing Entitlements*
   (Build Settings). Byt `aps-environment` till `production` för release.
4. Dra in `ios/Runner/new_order.caf` i Xcode → Runner → *Copy Bundle Resources*
   (custom notisljud).

## 3. Backend
Sätt env-varianten i Railway (API:t):
```
FCM_SERVICE_ACCOUNT_JSON = <hela service-account-JSON:en på en rad>
```
(Service account: Firebase Console → Project Settings → Service accounts →
Generate new private key.) Saknas den är backend-push en no-op.

## Custom-ljud
- Android: `android/app/src/main/res/raw/new_order.wav` (kanal `new_order`).
- iOS: `ios/Runner/new_order.caf` (skickas som `new_order.caf` i APNs-payloaden).

Backend skickar redan `channel_id: new_order` (Android) och `sound: new_order.caf`
(iOS) i `packages/api/src/lib/courierFcm.ts`.
