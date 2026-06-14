import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Ljud + lokala notiser för nya uppdrag. Speglar Business-appens AudioHelper
/// men med ett eget, pitchat larm (`assets/audio/new_job.wav`) så budet hör
/// skillnad. Notisen visas både i förgrund (banner) och i bakgrund (medan
/// platsdelning håller appen vaken).
class Notify {
  static final AudioPlayer _player = AudioPlayer(playerId: 'courier_alert');
  static final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();
  static bool _inited = false;

  /// Idempotent init — kallas när budet går online (kontextuell behörighet).
  static Future<void> ensureInit() async {
    if (_inited) return;
    _inited = true;
    // Spela även i tyst läge / blanda med annan ljuduppspelning.
    try {
      await AudioPlayer.global.setAudioContext(
        AudioContext(
          iOS: AudioContextIOS(
            category: AVAudioSessionCategory.playback,
            options: const {AVAudioSessionOptions.mixWithOthers},
          ),
          android: const AudioContextAndroid(
            contentType: AndroidContentType.sonification,
            usageType: AndroidUsageType.notification,
            audioFocus: AndroidAudioFocus.gainTransientMayDuck,
          ),
        ),
      );
      await _player.setReleaseMode(ReleaseMode.stop);
    } catch (e) {
      debugPrint('Notify audio init: $e');
    }

    try {
      const ios = DarwinInitializationSettings(
        requestAlertPermission: true,
        requestBadgePermission: true,
        requestSoundPermission: true,
      );
      const android =
          AndroidInitializationSettings('@mipmap/ic_launcher');
      await _local.initialize(
        const InitializationSettings(iOS: ios, android: android),
      );
      final androidImpl = _local.resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>();
      // Kanal med custom-ljud (res/raw/new_order). Måste finnas innan en
      // bakgrunds-FCM-notis kommer in — annars faller den tillbaka på default-ljud.
      await androidImpl?.createNotificationChannel(
        const AndroidNotificationChannel(
          'new_order',
          'Nya order',
          description: 'Avisering med larmljud när nya leveranser dyker upp',
          importance: Importance.high,
          sound: RawResourceAndroidNotificationSound('new_order'),
          playSound: true,
        ),
      );
      await _local
          .resolvePlatformSpecificImplementation<
              IOSFlutterLocalNotificationsPlugin>()
          ?.requestPermissions(alert: true, badge: true, sound: true);
      await androidImpl?.requestNotificationsPermission();
    } catch (e) {
      debugPrint('Notify notif init: $e');
    }
  }

  /// Nytt uppdrag: spela det pitchade larmet + visa en banner.
  static Future<void> newJob(int count) async {
    await ensureInit();
    _playAlert();
    await _showBanner(count);
  }

  static Future<void> _playAlert() async {
    try {
      await _player.stop();
      await _player.play(AssetSource('audio/new_job.wav'), volume: 1.0);
    } catch (e) {
      debugPrint('Notify play: $e');
    }
  }

  static Future<void> _showBanner(int count) async {
    try {
      const android = AndroidNotificationDetails(
        'new_order',
        'Nya order',
        channelDescription: 'Avisering med larmljud när nya leveranser dyker upp',
        importance: Importance.high,
        priority: Priority.high,
        sound: RawResourceAndroidNotificationSound('new_order'),
        playSound: true,
      );
      const ios = DarwinNotificationDetails(
        presentAlert: true,
        presentBadge: true,
        presentSound: true,
        sound: 'new_order.caf',
      );
      await _local.show(
        7001,
        'Nytt uppdrag',
        count > 1
            ? '$count nya leveranser i din stad'
            : 'En ny leverans i din stad',
        const NotificationDetails(android: android, iOS: ios),
      );
    } catch (e) {
      debugPrint('Notify banner: $e');
    }
  }

  static Future<void> stop() async {
    try {
      await _player.stop();
    } catch (_) {}
  }
}
