import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart' as ll;

import '../core/theme.dart';
import '../models/models.dart';
import 'courier_ui.dart';

/// Inbäddad kartöversikt över hämtning → leverans. OSM-tiles, ingen API-nyckel,
/// funkar på iOS, Android och web. Statisk preview — tryck för att navigera i
/// systemets kart-app (turn-by-turn). [focusDropoff] centrerar på kunden efter
/// att maten hämtats.
class DeliveryMap extends StatelessWidget {
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
  Widget build(BuildContext context) {
    final hasPickup = pickup.isValid;
    final hasDropoff = dropoff.isValid;

    // Ingen giltig koordinat → ingen karta (adressraden räcker).
    if (!hasPickup && !hasDropoff) return const SizedBox.shrink();

    final p = ll.LatLng(pickup.lat, pickup.lng);
    final d = ll.LatLng(dropoff.lat, dropoff.lng);
    final points = <ll.LatLng>[if (hasPickup) p, if (hasDropoff) d];
    final focus = (focusDropoff && hasDropoff) ? d : (hasPickup ? p : d);
    final navAddress = focusDropoff ? dropoffAddress : pickupAddress;

    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: SizedBox(
        height: height,
        child: Stack(
          children: [
            FlutterMap(
              options: MapOptions(
                initialCenter: focus,
                initialZoom: 14,
                // Rama in båda punkterna när vi har en sträcka.
                initialCameraFit: points.length > 1
                    ? CameraFit.coordinates(
                        coordinates: points,
                        padding: const EdgeInsets.all(44),
                        maxZoom: 16,
                      )
                    : null,
                // Statisk preview — gester går till tap-overlayn nedan istället
                // för att krocka med listans scroll.
                interactionOptions:
                    const InteractionOptions(flags: InteractiveFlag.none),
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'se.delivera.courier',
                ),
                if (points.length > 1)
                  PolylineLayer(
                    polylines: [
                      Polyline(
                        points: points,
                        strokeWidth: 4,
                        color: AppTheme.info.withOpacity(0.75),
                      ),
                    ],
                  ),
                MarkerLayer(
                  markers: [
                    if (hasPickup)
                      Marker(
                        point: p,
                        width: 38,
                        height: 38,
                        child: _MapPin(
                          icon: Icons.storefront_rounded,
                          color: AppTheme.ember,
                          dim: focusDropoff,
                        ),
                      ),
                    if (hasDropoff)
                      Marker(
                        point: d,
                        width: 38,
                        height: 38,
                        child: _MapPin(
                          icon: Icons.flag_rounded,
                          color: AppTheme.info,
                          dim: !focusDropoff && hasPickup,
                        ),
                      ),
                  ],
                ),
              ],
            ),
            // Hela kartan öppnar systemets navigering.
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
