import 'dart:io' show Platform;

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:dio/dio.dart';

/// Ljudhantering med STRIKT separerade spelare så att ett one-shot-ljud aldrig
/// kan ärva loop-läge och fastna (den gamla buggen: `playAudio` och `playTest`
/// delade spelare → ett "test" satte loop-läge → nästa one-shot loopade för
/// evigt och gick inte att stoppa förrän appen startades om).
///
/// - [_loopPlayer]  : ENDAST den loopande ny-order-larmet (start/stopLooping).
/// - [_oneShotPlayer]: ENDAST korta engångsljud (t.ex. disconnect). Alltid
///                     ReleaseMode.release → kan aldrig loopa.
/// - [_testPlayer]  : ENDAST inställningarnas test-knapp (loopar 5s, isolerad).
class AudioHelper {
  static final AudioPlayer _loopPlayer = AudioPlayer();
  static final AudioPlayer _oneShotPlayer = AudioPlayer();
  static final AudioPlayer _testPlayer = AudioPlayer();
  static bool _isLooping = false;

  static bool get isLooping => _isLooping;

  // Samma native-kanal som device-info (MainActivity.kt). Används för att maxa
  // enhetens LARM-volym så signalen alltid hörs i en stökig restaurang.
  static const MethodChannel _deviceChannel =
      MethodChannel('com.matgo.restaurant/device');

  /// Höjer enhetens larm-ström (STREAM_ALARM) till max så larmet spelas så
  /// högt hårdvaran tillåter. Endast Android; tyst no-op annars.
  static Future<void> maxAlarmVolume() async {
    if (kIsWeb || !Platform.isAndroid) return;
    try {
      await _deviceChannel.invokeMethod('setAlarmVolumeMax');
    } catch (e) {
      debugPrint('⚠️ setAlarmVolumeMax failed: $e');
    }
  }

  static Future<void> initConfigs() async {
    try {
      final audioContext = AudioContext(
        android: const AudioContextAndroid(
          isSpeakerphoneOn: true,
          stayAwake: true,
          contentType: AndroidContentType.sonification,
          usageType: AndroidUsageType.alarm,
          audioFocus: AndroidAudioFocus.gainTransientExclusive,
        ),
        iOS: AudioContextIOS(
          category: AVAudioSessionCategory.playback,
          options: {
            AVAudioSessionOptions.defaultToSpeaker,
            AVAudioSessionOptions.mixWithOthers,
          },
        ),
      );
      await AudioPlayer.global.setAudioContext(audioContext);
      // Spelarna alltid på full appvolym; verklig "höjd" kommer från att vi
      // maxar enhetens larm-ström.
      await _loopPlayer.setVolume(1.0);
      await _oneShotPlayer.setVolume(1.0);
      await maxAlarmVolume();
    } catch (e) {
      debugPrint('AudioContext init error: $e');
    }
  }

  /// Ny-order-larmet: spelas EN gång och loopar sedan tills [stopLooping]
  /// (dvs tills ordern är godkänd). Idempotent — upprepade anrop medan det
  /// redan loopar gör ingenting (ingen dubbel-uppspelning).
  static Future<void> startLooping(String assetName) async {
    if (_isLooping) return;
    _isLooping = true; // Sätt guarden OMEDELBART (före await) → inga race/dubletter
    try {
      debugPrint('🔊 AudioHelper: Starting loop for audio/$assetName');
      await maxAlarmVolume(); // maxa larm-strömmen precis innan larmet hörs
      await _loopPlayer.setReleaseMode(ReleaseMode.loop);
      await _loopPlayer.setVolume(1.0);
      await _loopPlayer.stop(); // rensa ev. tidigare state innan ny loop
      try {
        await _loopPlayer.play(AssetSource('audio/$assetName'));
      } catch (e) {
        debugPrint('⚠️ AssetSource failed, trying web fallback: $e');
        if (kIsWeb) {
          await _loopPlayer.play(UrlSource('assets/assets/audio/$assetName'));
        } else {
          rethrow;
        }
      }

      // NATIVE MAC BRIDGE (FOOLPROOF)
      if (kIsWeb) {
        try {
          await Dio().get('http://localhost:5005/play');
          debugPrint('✅ Mac Sound Bridge triggered successfully');
        } catch (e) {
          debugPrint('ℹ️ Mac Sound Bridge not running (ignore if not on Mac)');
        }
      }
    } catch (e) {
      debugPrint('❌ AudioHelper Error: $e');
      _isLooping = false;
    }
  }

  static Future<void> stopLooping() async {
    _isLooping = false;
    try {
      await _loopPlayer.stop();
    } catch (e) {
      debugPrint('❌ AudioHelper Stop Error: $e');
    }
  }

  /// Test-knapp i inställningarna: loopar i 5s och stoppar sedan. Helt isolerad
  /// spelare → påverkar aldrig larm/one-shot.
  static Future<void> playTest(String assetName) async {
    try {
      debugPrint('🔔 AudioHelper: Playing test for $assetName');
      await _testPlayer.setReleaseMode(ReleaseMode.loop);
      await _testPlayer.stop();
      await _testPlayer.play(AssetSource('audio/$assetName'));
      Future.delayed(const Duration(seconds: 5), () => _testPlayer.stop());
    } catch (e) {
      debugPrint('❌ AudioHelper Test Error: $e');
    }
  }

  /// Kort engångsljud (t.ex. disconnect-pling). ALLTID release-läge så det
  /// aldrig kan fastna i loop. Stoppar ev. pågående one-shot först.
  static Future<void> playAudio(String assetName) async {
    try {
      await maxAlarmVolume(); // maxa larm-strömmen precis innan signalen hörs
      await _oneShotPlayer.setReleaseMode(ReleaseMode.release);
      await _oneShotPlayer.setVolume(1.0);
      await _oneShotPlayer.stop();
      await _oneShotPlayer.play(AssetSource('audio/$assetName'));
    } catch (e) {
      debugPrint('❌ AudioHelper Play Error: $e');
    }
  }

  static Future<void> stopOneShot() async {
    try {
      await _oneShotPlayer.stop();
    } catch (_) {}
  }

  /// Stoppar ALLT (loop + one-shot + test). Säkerhetsnät, t.ex. vid utloggning.
  static Future<void> stopAll() async {
    _isLooping = false;
    try {
      await _loopPlayer.stop();
    } catch (_) {}
    try {
      await _oneShotPlayer.stop();
    } catch (_) {}
    try {
      await _testPlayer.stop();
    } catch (_) {}
  }

  static void dispose() {
    _loopPlayer.dispose();
    _oneShotPlayer.dispose();
    _testPlayer.dispose();
  }
}
