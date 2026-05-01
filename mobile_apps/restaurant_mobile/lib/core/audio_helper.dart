import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart';

class AudioHelper {
  static final AudioPlayer _loopPlayer = AudioPlayer();
  static final AudioPlayer _testPlayer = AudioPlayer();
  static bool _isLooping = false;

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
    } catch (e) {
      debugPrint('AudioContext init error: $e');
    }
  }

  static Future<void> startLooping(String assetName) async {
    if (_isLooping) return;
    try {
      debugPrint('🔊 AudioHelper: Starting loop for audio/$assetName');
      await _loopPlayer.setReleaseMode(ReleaseMode.loop);

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

      _isLooping = true;
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

  static Future<void> playTest(String assetName) async {
    try {
      debugPrint('🔔 AudioHelper: Playing test for $assetName');
      await _testPlayer.setReleaseMode(ReleaseMode.loop);
      await _testPlayer.play(AssetSource('audio/$assetName'));

      // Stop after 5 seconds
      Future.delayed(const Duration(seconds: 5), () {
        _testPlayer.stop();
      });
    } catch (e) {
      debugPrint('❌ AudioHelper Test Error: $e');
    }
  }

  static Future<void> playAudio(String assetName) async {
    try {
      await _testPlayer.play(AssetSource('audio/$assetName'));
    } catch (e) {
      debugPrint('❌ AudioHelper Play Error: $e');
    }
  }

  static void dispose() {
    _loopPlayer.dispose();
    _testPlayer.dispose();
  }
}
