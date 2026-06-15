import 'dart:async';
import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../firebase_options.dart';
import 'models_api.dart';
import 'notify.dart';

/// Bakgrunds-/killad-app-handler. Måste vara top-level + vm:entry-point.
/// När backend skickar en `notification`-payload visar OS:et notisen automatiskt
/// (med kanalen `new_order` → custom-ljud), så här behöver vi inte göra något
/// mer än att se till att Firebase är initierat i isolatet.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  try {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  } catch (_) {
    /* ingen Firebase-config → no-op */
  }
}

/// Native push via FCM. Levererar notiser ÄVEN när appen är helt stängd
/// (Android direkt, iOS via APNs). Allt är guardat: saknas Firebase-config
/// (GoogleService-Info.plist / google-services.json eller firebase_options.dart)
/// blir tjänsten en tyst no-op och appen funkar som vanligt via polling.
class PushService {
  PushService._();
  static final PushService instance = PushService._();

  bool _inited = false;
  bool _firebaseOk = false;
  bool _permissionGranted = false;
  bool _apnsOk = false;
  bool _fcmOk = false;
  bool _registered = false;
  CourierApi? _api;
  String? _lastToken;

  String get _platform => Platform.isIOS ? 'ios' : 'android';

  /// Kallas när budet går online (kontextuell behörighet). Idempotent.
  Future<void> init(CourierApi api) async {
    _api = api;
    if (_inited) {
      // Redan initierat → se bara till att aktuell token är registrerad.
      await _syncToken();
      return;
    }
    _inited = true;

    try {
      // Firebase initieras redan i main(); init bara om det inte gjorts (annars
      // kastar Firebase.initializeApp [core/duplicate-app]).
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
      }
      _firebaseOk = true;
    } catch (e) {
      debugPrint('[push] Firebase ej konfigurerat — native push inaktiv: $e');
      return; // Guard: appen kör vidare utan push.
    }

    try {
      // Säkerställ Android-kanalen med custom-ljud (för bakgrundsnotiser).
      await Notify.ensureInit();

      final messaging = FirebaseMessaging.instance;
      final settings = await messaging.requestPermission(alert: true, badge: true, sound: true);
      _permissionGranted = settings.authorizationStatus == AuthorizationStatus.authorized ||
          settings.authorizationStatus == AuthorizationStatus.provisional;
      if (!_permissionGranted) {
        debugPrint('[push] notis-behörighet ej beviljad: ${settings.authorizationStatus}');
        // Avbryt inte helt — token kan fås om budet aktiverar notiser senare;
        // resync vid resume/online försöker igen.
      }
      // iOS: visa även i förgrunden (banner + ljud).
      await messaging.setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );

      // Förgrunds-meddelanden: rätt ljud per typ (ny order = larm + 3s-loop,
      // redo för hämtning = diskret bell). iOS visar inte FCM-notisen i
      // förgrunden av sig själv → vi spelar ljudet + visar banner via local-notis.
      FirebaseMessaging.onMessage.listen((msg) {
        final type = msg.data['type'];
        if (type == 'ORDER_READY') {
          Notify.readyForPickup('');
        } else {
          Notify.newJob(1);
        }
      });

      // Token-refresh → registrera om hos backend.
      messaging.onTokenRefresh.listen((t) {
        _lastToken = t;
        unawaited(_register(t));
      });

      await _syncToken();
    } catch (e) {
      debugPrint('[push] init-fel: $e');
    }
  }

  Future<void> _syncToken() async {
    if (!_firebaseOk) return;
    try {
      final messaging = FirebaseMessaging.instance;
      // iOS: getToken() ger NULL om APNs-token inte hunnit bli klar (den kommer
      // asynkront efter registerForRemoteNotifications). Vänta in den först,
      // annars registreras aldrig FCM-token → ingen push. Upp till ~10s.
      if (Platform.isIOS) {
        var apns = await messaging.getAPNSToken();
        var tries = 0;
        while (apns == null && tries < 10) {
          await Future.delayed(const Duration(seconds: 1));
          apns = await messaging.getAPNSToken();
          tries++;
        }
        _apnsOk = apns != null;
        if (apns == null) {
          debugPrint('[push] APNs-token aldrig klar — hoppar getToken (försöker igen senare)');
          return;
        }
      } else {
        _apnsOk = true;
      }
      final token = await messaging.getToken();
      _fcmOk = token != null;
      if (token != null) {
        _lastToken = token;
        await _register(token);
      }
    } catch (e) {
      debugPrint('[push] getToken-fel: $e');
    }
  }

  Future<void> _register(String token) async {
    try {
      await _api?.registerPush(token, _platform);
      _registered = true;
    } catch (e) {
      debugPrint('[push] register-fel: $e');
      // Markera som oregistrerad så resync (resume/online) försöker igen.
      _registered = false;
      _lastToken = null;
    }
  }

  /// Retry-krok: körs vid app-resume + varje goOnline. Om token ännu inte är
  /// registrerad (APNs var långsam, nätfel, eller behörighet beviljades sent)
  /// görs ett nytt försök. Billig no-op när allt redan är klart.
  Future<void> resyncIfNeeded() async {
    if (!_firebaseOk) return;
    if (_registered && _lastToken != null) return;
    await _syncToken();
  }

  // ── Diagnostik (driver push-status-kortet på Konto) ────────────────────────
  bool get firebaseOk => _firebaseOk;
  bool get permissionGranted => _permissionGranted;
  bool get apnsOk => _apnsOk;
  bool get fcmOk => _fcmOk;
  bool get tokenRegistered => _registered && _lastToken != null;
  bool get inited => _inited;

  /// Tvinga ett nytt registreringsförsök (knapp "Registrera token igen").
  /// Säkerställer att init körts, ber om behörighet, och syncar token.
  Future<void> forceRegister(CourierApi api) async {
    if (!_inited) {
      await init(api);
      return;
    }
    try {
      _api = api;
      final messaging = FirebaseMessaging.instance;
      final settings = await messaging.requestPermission(alert: true, badge: true, sound: true);
      _permissionGranted = settings.authorizationStatus == AuthorizationStatus.authorized ||
          settings.authorizationStatus == AuthorizationStatus.provisional;
      _registered = false;
      _lastToken = null;
      await _syncToken();
    } catch (e) {
      debugPrint('[push] forceRegister-fel: $e');
    }
  }

  /// Avregistrera token (vid logout). Best effort.
  Future<void> unregister() async {
    try {
      await _api?.unregisterPush();
      if (_firebaseOk) await FirebaseMessaging.instance.deleteToken();
      _lastToken = null;
    } catch (e) {
      debugPrint('[push] unregister-fel: $e');
    }
  }
}
