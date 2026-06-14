import 'dart:async';
import 'dart:io' show Platform;

import 'package:geolocator/geolocator.dart';

import 'models_api.dart';

/// Hanterar GPS-position och skickar heartbeat till backend medan kuriren är
/// online. Backend broadcastar positionen till order-rummet (kundspårning) och
/// admin-rummet. Speglar `apps/courier/src/lib/geo.ts` (10s heartbeat).
class LocationService {
  LocationService(this._api);

  final CourierApi _api;

  StreamSubscription<Position>? _stream;
  Timer? _heartbeat;
  Position? _last;

  Position? get last => _last;

  /// Be om behörighet. Returnerar true om vi får läsa positionen.
  /// Försöker eskalera till "Alltid" så positionen kan delas i bakgrunden.
  Future<bool> ensurePermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) return false;
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
    if (perm == LocationPermission.deniedForever) return false;
    // Eskalera till Always för bakgrundsdelning (iOS visar Always-prompten
    // separat; whileInUse räcker för förgrundsdelning).
    if (perm == LocationPermission.whileInUse) {
      try {
        perm = await Geolocator.requestPermission();
      } catch (_) {}
    }
    return perm == LocationPermission.always ||
        perm == LocationPermission.whileInUse;
  }

  /// Platsinställningar med bakgrundsstöd per plattform.
  LocationSettings _settings() {
    if (Platform.isIOS) {
      return AppleSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 25,
        pauseLocationUpdatesAutomatically: false,
        // Kräver UIBackgroundModes:location i Info.plist + Always-behörighet.
        allowBackgroundLocationUpdates: true,
        showBackgroundLocationIndicator: true,
        activityType: ActivityType.otherNavigation,
      );
    }
    if (Platform.isAndroid) {
      return AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 25,
        foregroundNotificationConfig: const ForegroundNotificationConfig(
          notificationTitle: 'Delivera Courier är online',
          notificationText: 'Din position delas medan du är online.',
          enableWakeLock: true,
        ),
      );
    }
    return const LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 25,
    );
  }

  /// Starta positionsbevakning + heartbeat. Idempotent.
  Future<void> start() async {
    if (_stream != null) return;
    if (!await ensurePermission()) return;

    _stream = Geolocator.getPositionStream(
      locationSettings: _settings(),
    ).listen((pos) {
      _last = pos;
    }, onError: (_) {});

    // Heartbeat: skicka senaste kända position regelbundet.
    _heartbeat = Timer.periodic(const Duration(seconds: 10), (_) => _push());
    // Skicka en direkt om vi redan har en fix.
    try {
      _last = await Geolocator.getCurrentPosition();
      _push();
    } catch (_) {}
  }

  Future<void> _push() async {
    final p = _last;
    if (p == null) return;
    try {
      await _api.sendLocation(p.latitude, p.longitude);
    } catch (_) {
      // Tyst — heartbeat försöker igen nästa intervall.
    }
  }

  Future<void> stop() async {
    // Stoppa heartbeat-timern FÖRST (synkront) så den inte hinner skicka en
    // till position medan stream-avbrytningen await:as.
    _heartbeat?.cancel();
    _heartbeat = null;
    final sub = _stream;
    _stream = null;
    await sub?.cancel();
  }
}
