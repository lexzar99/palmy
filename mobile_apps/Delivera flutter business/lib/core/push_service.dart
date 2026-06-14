import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api_client.dart';
import 'audio_helper.dart';
import 'constants.dart';
import 'log_service.dart';

/// Background-handler måste vara top-level (inte instance method) och
/// markerad med @pragma('vm:entry-point') för release builds.
@pragma('vm:entry-point')
Future<void> _firebaseBackgroundHandler(RemoteMessage message) async {
  // Ingen UI här – bara loggning. Notifikationen visas av FCM systemet
  // via meta-data i AndroidManifest. Ljudet styrs av notification channel.
  await Firebase.initializeApp();
  debugPrint('🔔 BG MESSAGE: ${message.messageId} – ${message.data}');
}

class PushService {
  static bool _initialized = false;
  static final ApiClient _api = ApiClient();

  /// Initiera FCM en gång vid app-start. Säkert att anropa flera gånger.
  /// På web hoppar vi över initieringen helt.
  static Future<void> init() async {
    if (kIsWeb || _initialized) return;
    _initialized = true;

    try {
      await Firebase.initializeApp();
    } catch (e) {
      logger.log('PUSH: Firebase init failed (saknas google-services.json?): $e');
      return;
    }

    final messaging = FirebaseMessaging.instance;

    // Be om notification permission (krävs på Android 13+)
    final settings = await messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    logger.log('PUSH: permission = ${settings.authorizationStatus}');

    // Background handler
    FirebaseMessaging.onBackgroundMessage(_firebaseBackgroundHandler);

    // Foreground messages – vi spelar samma alarmljud + visar in-app banner
    FirebaseMessaging.onMessage.listen((message) {
      logger.log('PUSH FG: ${message.messageId} – ${message.data}');
      // Spela alarm – nya ordrar triggar redan socket men push är fallback
      AudioHelper.playAudio('notification.wav');
    });

    // När användaren trycker på notisen och appen var i bakgrund
    FirebaseMessaging.onMessageOpenedApp.listen((message) {
      logger.log('PUSH OPENED: ${message.data}');
    });

    // Hämta initial-token och registrera mot backend
    await _refreshAndRegisterToken();

    // Lyssna på token-rotationer
    messaging.onTokenRefresh.listen((token) {
      logger.log('PUSH: token refreshed');
      _registerWithBackend(token);
    });
  }

  static Future<void> _refreshAndRegisterToken() async {
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) {
        await _registerWithBackend(token);
      }
    } catch (e) {
      logger.log('PUSH: getToken failed: $e');
    }
  }

  static Future<void> _registerWithBackend(String fcmToken) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final lastRegistered = prefs.getString(AppConstants.fcmTokenKey);
      if (lastRegistered == fcmToken) return; // redan registrerad

      // Backend-endpoint som ska ta emot FCM-token. Implementera servern
      // sida att lagra token per restaurang och skicka push vid order:new.
      await _api.post('/api/account/push-token', {
        'platform': 'android',
        'token': fcmToken,
      });
      await prefs.setString(AppConstants.fcmTokenKey, fcmToken);
      logger.log('PUSH: token registrerad mot backend');
    } catch (e) {
      logger.log('PUSH: kunde inte registrera token mot backend: $e');
      // Vi rensar inte cache-token här – nästa app-start försöker igen.
    }
  }

  /// Anropa vid logout så servern slutar skicka push till denna enheten.
  static Future<void> unregister() async {
    if (kIsWeb || !_initialized) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      final token = prefs.getString(AppConstants.fcmTokenKey);
      if (token != null) {
        await _api.post('/api/account/push-token/remove', {'token': token});
      }
      await prefs.remove(AppConstants.fcmTokenKey);
      await FirebaseMessaging.instance.deleteToken();
    } catch (e) {
      logger.log('PUSH: unregister failed: $e');
    }
  }
}
