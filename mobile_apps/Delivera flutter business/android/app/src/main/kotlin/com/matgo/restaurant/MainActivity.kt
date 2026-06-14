package com.matgo.restaurant

import android.content.Context
import android.media.AudioManager
import android.os.Build
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val deviceChannel = "com.matgo.restaurant/device"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        // Lättviktig kanal för att läsa enhetens tillverkare/märke. Används för
        // att avgöra om vi kör på en iMin-enhet (inbyggd skrivare) eller inte.
        // Samma kanal exponerar även volymstyrning för larm-strömmen.
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, deviceChannel)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "getManufacturer" -> result.success(Build.MANUFACTURER ?: "")
                    "getBrand" -> result.success(Build.BRAND ?: "")
                    "getModel" -> result.success(Build.MODEL ?: "")
                    // Maxa enhetens LARM-volym (STREAM_ALARM). Ljudet spelas via
                    // AudioUsage.alarm, så detta gör ny-order-/disconnect-signalen
                    // så hög som hårdvaran tillåter — utan att röra media/ring.
                    // Alarm-strömmen kräver ingen specialbehörighet.
                    "setAlarmVolumeMax" -> {
                        try {
                            val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
                            val max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM)
                            am.setStreamVolume(AudioManager.STREAM_ALARM, max, 0)
                            result.success(true)
                        } catch (e: Exception) {
                            result.success(false)
                        }
                    }
                    else -> result.notImplemented()
                }
            }
    }
}
