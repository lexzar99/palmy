import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'log_service.dart';

/// Android foreground service som visar en persistent notifikation
/// "Levera Business körs · öppen för beställningar". Detta:
///
///   1. Hindrar Android från att killa appen i bakgrunden (oavsett
///      batterioptimeringar)
///   2. Påminner restaurang-personalen att ha appen öppen för att ta
///      emot ordrar
///   3. Tap på notisen tar tillbaka användaren till appen
///
/// Behövs INTE på web/iOS – metoderna failar tyst där.
class AppForegroundService {
  static bool _initialized = false;

  /// Init notification channel + grundkonfiguration. Måste köras en gång
  /// före [start]. Säkert att anropa flera gånger.
  static void init() {
    if (kIsWeb || (!kIsWeb && !Platform.isAndroid) || _initialized) return;
    _initialized = true;
    try {
      FlutterForegroundTask.init(
        androidNotificationOptions: AndroidNotificationOptions(
          channelId: 'matgo_business_running',
          channelName: 'Levera Business körs',
          channelDescription:
              'Visar att appen är öppen och tar emot beställningar.',
          channelImportance: NotificationChannelImportance.LOW,
          priority: NotificationPriority.LOW,
          onlyAlertOnce: true,
        ),
        iosNotificationOptions: const IOSNotificationOptions(),
        foregroundTaskOptions: ForegroundTaskOptions(
          eventAction: ForegroundTaskEventAction.nothing(),
          autoRunOnBoot: false,
          autoRunOnMyPackageReplaced: true,
          allowWakeLock: true,
          allowWifiLock: true,
        ),
      );
    } catch (e) {
      logger.log('FOREGROUND init error: $e');
    }
  }

  /// Starta foreground service (visar persistent notifikation).
  /// Anropas efter lyckad inloggning.
  static Future<void> start() async {
    if (kIsWeb || (!kIsWeb && !Platform.isAndroid)) return;
    init();
    try {
      // Be om POST_NOTIFICATIONS permission på Android 13+
      final permission = await FlutterForegroundTask.checkNotificationPermission();
      if (permission != NotificationPermission.granted) {
        await FlutterForegroundTask.requestNotificationPermission();
      }
      // Be om ignore battery optimizations om det inte redan är beviljat
      if (!await FlutterForegroundTask.isIgnoringBatteryOptimizations) {
        await FlutterForegroundTask.requestIgnoreBatteryOptimization();
      }

      if (await FlutterForegroundTask.isRunningService) {
        await FlutterForegroundTask.updateService(
          notificationTitle: 'Levera Business körs',
          notificationText: 'Öppen för beställningar – håll appen igång',
        );
        return;
      }

      await FlutterForegroundTask.startService(
        serviceId: 4242,
        notificationTitle: 'Levera Business körs',
        notificationText: 'Öppen för beställningar – håll appen igång',
        notificationIcon: null, // använder app-ikonen
      );
      logger.log('FOREGROUND: service startad');
    } catch (e) {
      logger.log('FOREGROUND start error: $e');
    }
  }

  /// Uppdatera notis-text (t.ex. "Stängd · återöppnar 14:30").
  static Future<void> updateText(String text) async {
    if (kIsWeb) return;
    try {
      if (!await FlutterForegroundTask.isRunningService) return;
      await FlutterForegroundTask.updateService(
        notificationTitle: 'Levera Business körs',
        notificationText: text,
      );
    } catch (e) {
      logger.log('FOREGROUND update error: $e');
    }
  }

  /// Stoppa service och ta bort notifikation. Anropas vid logout.
  static Future<void> stop() async {
    if (kIsWeb || (!kIsWeb && !Platform.isAndroid)) return;
    try {
      if (await FlutterForegroundTask.isRunningService) {
        await FlutterForegroundTask.stopService();
        logger.log('FOREGROUND: service stoppad');
      }
    } catch (e) {
      logger.log('FOREGROUND stop error: $e');
    }
  }
}
