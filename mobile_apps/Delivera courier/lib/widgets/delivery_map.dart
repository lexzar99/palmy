import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart' as ll;

import '../core/theme.dart';
import '../models/models.dart';
import 'courier_ui.dart';

/// Inbäddad kartöversikt restaurang → kund. Samma moderna look som webben
/// (CARTO Voyager-tiles) och samma RIKTIGA körrutt via OSRM — inte fågelvägen.
/// Ingen API-nyckel, funkar iOS/Android/web. Statisk preview — tryck för att
/// navigera i systemets kart-app.
class DeliveryMap extends StatefulWidget {
  final LatLng pickup;
  final LatLng dropoff;
  final String pickupAddress;
  final String dropoffAddress;
  final bool focusDropoff;
  final double height;

  const DeliveryMap({
    super.key,
    required this.pickup,
    required this.dropoff,
    required this.pickupAddress,
    required this.dropoffAddress,
    this.focusDropoff = false,
    this.height = 190,
  });

  @override
  State<DeliveryMap> createState() => _DeliveryMapState();
}

class _DeliveryMapState extends State<DeliveryMap> {
  List<ll.LatLng>? _route; // riktig körrutt (OSRM); null tills hämtad

  bool get _hasPickup => widget.pickup.isValid;
  bool get _hasDropoff => widget.dropoff.isValid;

  @override
  void initState() {
    super.initState();
    _loadRoute();
  }

  @override
  void didUpdateWidget(DeliveryMap old) {
    super.didUpdateWidget(old);
    if (old.pickup.lat != widget.pickup.lat ||
        old.pickup.lng != widget.pickup.lng ||
        old.dropoff.lat != widget.dropoff.lat ||
        old.dropoff.lng != widget.dropoff.lng) {
      _route = null;
      _loadRoute();
    }
  }

  // Statisk rutt restaurang → kund (ändras inte per ping — då syns det om
  // budet viker av). Faller tillbaka till en rak linje om OSRM inte svarar.
  Future<void> _loadRoute() async {
    if (!_hasPickup || !_hasDropoff) return;
    final p = widget.pickup, d = widget.dropoff;
    try {
      final dio = Dio(BaseOptions(connectTimeout: const Duration(seconds: 6)));
      final res = await dio.get<dynamic>(
        'https://router.project-osrm.org/route/v1/driving/'
        '${p.lng},${p.lat};${d.lng},${d.lat}',
        queryParameters: const {'overview': 'full', 'geometries': 'geojson'},
      );
      final coords = (res.data?['routes']?[0]?['geometry']?['coordinates']
          as List?);
      if (coords != null && coords.length > 1 && mounted) {
        setState(() {
          _route = coords
              .map((c) => ll.LatLng(
                  (c[1] as num).toDouble(), (c[0] as num).toDouble()))
              .toList();
        });
      }
    } catch (_) {
      // Tyst — fallback-linjen ritas ändå.
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_hasPickup && !_hasDropoff) return const SizedBox.shrink();

    final p = ll.LatLng(widget.pickup.lat, widget.pickup.lng);
    final d = ll.LatLng(widget.dropoff.lat, widget.dropoff.lng);
    final ends = <ll.LatLng>[if (_hasPickup) p, if (_hasDropoff) d];
    final line = _route ?? ends; // riktig rutt om hämtad, annars rak linje
    final focus = (widget.focusDropoff && _hasDropoff) ? d : (_hasPickup ? p : d);
    final navAddress = widget.focusDropoff ? widget.dropoffAddress : widget.pickupAddress;

    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: SizedBox(
        height: widget.height,
        child: Stack(
          children: [
            FlutterMap(
              options: MapOptions(
                initialCenter: focus,
                initialZoom: 14,
                initialCameraFit: ends.length > 1
                    ? CameraFit.coordinates(
                        coordinates: line,
                        padding: const EdgeInsets.all(40),
                        maxZoom: 16,
                      )
                    : null,
                interactionOptions:
                    const InteractionOptions(flags: InteractiveFlag.none),
              ),
              children: [
                TileLayer(
                  // CARTO Voyager — samma moderna basemap som webb-trackingen.
                  urlTemplate:
                      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
                  subdomains: const ['a', 'b', 'c', 'd'],
                  userAgentPackageName: 'se.delivera.courier',
                ),
                if (line.length > 1)
                  PolylineLayer(
                    polylines: [
                      Polyline(
                        points: line,
                        strokeWidth: 5,
                        color: AppTheme.ember,
                      ),
                    ],
                  ),
                MarkerLayer(
                  markers: [
                    if (_hasPickup)
                      Marker(
                        point: p,
                        width: 38,
                        height: 38,
                        child: _MapPin(
                          icon: Icons.storefront_rounded,
                          color: AppTheme.ember,
                          dim: widget.focusDropoff,
                        ),
                      ),
                    if (_hasDropoff)
                      Marker(
                        point: d,
                        width: 38,
                        height: 38,
                        child: _MapPin(
                          icon: Icons.flag_rounded,
                          color: AppTheme.info,
                          dim: !widget.focusDropoff && _hasPickup,
                        ),
                      ),
                  ],
                ),
              ],
            ),
            Positioned.fill(
              child: Material(
                color: Colors.transparent,
                child: InkWell(onTap: () => MapsLauncher.open(navAddress)),
              ),
            ),
            Positioned(
              right: 10,
              bottom: 10,
              child: _NavChip(onTap: () => MapsLauncher.open(navAddress)),
            ),
          ],
        ),
      ),
    );
  }
}

class _MapPin extends StatelessWidget {
  final IconData icon;
  final Color color;
  final bool dim;
  const _MapPin({required this.icon, required this.color, this.dim = false});

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: dim ? 0.55 : 1,
      child: Container(
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 2),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.25),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Icon(icon, color: Colors.white, size: 19),
      ),
    );
  }
}

class _NavChip extends StatelessWidget {
  final VoidCallback onTap;
  const _NavChip({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppTheme.panelColor(context),
      borderRadius: BorderRadius.circular(12),
      elevation: 2,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.navigation_rounded,
                  size: 16, color: AppTheme.info),
              const SizedBox(width: 6),
              Text(
                'Navigera',
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w800,
                  color: AppTheme.isDark(context)
                      ? AppTheme.paper
                      : AppTheme.ink,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
