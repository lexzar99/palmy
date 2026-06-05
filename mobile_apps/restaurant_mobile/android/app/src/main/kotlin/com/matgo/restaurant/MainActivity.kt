package com.matgo.restaurant

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
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, deviceChannel)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "getManufacturer" -> result.success(Build.MANUFACTURER ?: "")
                    "getBrand" -> result.success(Build.BRAND ?: "")
                    "getModel" -> result.success(Build.MODEL ?: "")
                    else -> result.notImplemented()
                }
            }
    }
}
