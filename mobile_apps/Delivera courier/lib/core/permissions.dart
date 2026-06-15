import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';

import 'notify.dart';

/// Ber om de behörigheter budet behöver — notiser, plats och kamera — redan i
/// onboardingen så allt är klart innan första passet. Best effort: varje fråga
/// är fristående och får aldrig krascha flödet.
class Permissions {
  static Future<void> requestOnboarding() async {
    // 1) Notiser: lokal-kanal + FCM/APNs (så nya-order-pushen når budet).
    try {
      await Notify.ensureInit();
      await FirebaseMessaging.instance
          .requestPermission(alert: true, badge: true, sound: true);
    } catch (e) {
      debugPrint('[perm] notiser: $e');
    }

    // 2) Plats: be om "medan appen används" här (iOS visar "Alltid" separat när
    //    budet går online och bakgrundsdelning faktiskt behövs).
    try {
      if (await Geolocator.isLocationServiceEnabled()) {
        var p = await Geolocator.checkPermission();
        if (p == LocationPermission.denied) {
          await Geolocator.requestPermission();
        }
      }
    } catch (e) {
      debugPrint('[perm] plats: $e');
    }

    // 3) Kamera: för leveransfoto vid dörren.
    try {
      final status = await Permission.camera.status;
      if (status.isDenied || status.isRestricted) {
        await Permission.camera.request();
      }
    } catch (e) {
      debugPrint('[perm] kamera: $e');
    }
  }
}
