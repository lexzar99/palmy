import 'dart:async';

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
  Future<bool> ensurePermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) return false;
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
    return perm == LocationPermission.always ||
        perm == LocationPermission.whileInUse;
  }

  /// Starta positionsbevakning + heartbeat. Idempotent.
  Future<void> start() async {
    if (_stream != null) return;
    if (!await ensurePermission()) return;

    _stream = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 25, // bara nya fixar var ~25 m
      ),
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
    await _stream?.cancel();
    _stream = null;
    _heartbeat?.cancel();
    _heartbeat = null;
  }
}
