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
      await messaging.requestPermission(alert: true, badge: true, sound: true);
      // iOS: visa även i förgrunden (banner + ljud).
      await messaging.setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );

      // Förgrunds-meddelanden: spela vårt larm + visa banner via local-notis.
      FirebaseMessaging.onMessage.listen((msg) {
        Notify.newJob(1);
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
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null && token != _lastToken) {
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
    } catch (e) {
      debugPrint('[push] register-fel: $e');
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
