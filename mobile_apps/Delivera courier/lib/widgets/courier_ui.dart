import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/format.dart';
import '../core/theme.dart';

/// Liten versal etikett ("eyebrow") för sektioner.
class Eyebrow extends StatelessWidget {
  final String text;
  const Eyebrow(this.text, {super.key});

  @override
  Widget build(BuildContext context) => Text(
        text.toUpperCase(),
        style: Theme.of(context).textTheme.labelMedium?.copyWith(
              color: AppTheme.mutedColor(context),
              letterSpacing: 1.0,
            ),
      );
}

/// Rund ikon-knapp (bak/karta/ring) i appens platta stil.
class CircleIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;
  final Color? tint;
  const CircleIconButton({super.key, required this.icon, this.onTap, this.tint});

  @override
  Widget build(BuildContext context) {
    final c = tint ?? AppTheme.mutedColor(context);
    return Material(
      color: AppTheme.faintColor(context),
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(11),
          child: Icon(icon, size: 20, color: c),
        ),
      ),
    );
  }
}

/// Adressrad med pickup/dropoff-ikon, "öppna i kartor" och valfri ring-knapp.
class AddressRow extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String title;
  final String address;
  final String? phone;

  const AddressRow({
    super.key,
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.address,
    this.phone,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: iconColor.withOpacity(0.12),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, color: iconColor, size: 20),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: theme.textTheme.titleMedium),
              const SizedBox(height: 2),
              Text(address, style: theme.textTheme.bodyMedium),
            ],
          ),
        ),
        const SizedBox(width: 8),
        CircleIconButton(
          icon: Icons.navigation_rounded,
          tint: AppTheme.info,
          onTap: () => MapsLauncher.open(address),
        ),
        if (phone != null && phone!.isNotEmpty) ...[
          const SizedBox(width: 8),
          CircleIconButton(
            icon: Icons.call_rounded,
            tint: AppTheme.success,
            onTap: () => MapsLauncher.call(phone!),
          ),
        ],
      ],
    );
  }
}

/// Öppnar kartor / ringer via systemets appar.
class MapsLauncher {
  static Future<void> open(String address) async {
    final q = Uri.encodeComponent(address);
    // Apple Maps på iOS, Google Maps annars — båda förstår denna URI.
    final uri = Uri.parse('https://maps.apple.com/?q=$q');
    final google = Uri.parse('https://www.google.com/maps/search/?api=1&query=$q');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else {
      await launchUrl(google, mode: LaunchMode.externalApplication);
    }
  }

  static Future<void> call(String phone) async {
    final uri = Uri.parse('tel:${phone.replaceAll(RegExp(r'[^0-9+]'), '')}');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }
}

/// Nedräknings-pill som tickar varje sekund mot ett epoch-ms-utgångsvärde.
class CountdownPill extends StatefulWidget {
  final int expiresAt;
  const CountdownPill({super.key, required this.expiresAt});

  @override
  State<CountdownPill> createState() => _CountdownPillState();
}

class _CountdownPillState extends State<CountdownPill> {
  Timer? _t;

  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.expiresAt <= 0) return const SizedBox.shrink();
    final left = secondsLeft(widget.expiresAt);
    final urgent = left <= 15;
    final color = urgent ? AppTheme.danger : AppTheme.warning;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.24)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.timer_outlined, size: 13, color: color),
          const SizedBox(width: 5),
          Text(
            '${left}s',
            style: TextStyle(
              color: color,
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.4,
            ),
          ),
        ],
      ),
    );
  }
}

/// Svep-för-att-bekräfta. Dra tummen hela vägen till höger → onConfirm.
class SwipeToConfirm extends StatefulWidget {
  final String label;
  final IconData icon;
  final Color color;
  final Future<void> Function() onConfirm;
  final bool enabled;

  const SwipeToConfirm({
    super.key,
    required this.label,
    required this.onConfirm,
    this.icon = Icons.chevron_right_rounded,
    this.color = AppTheme.success,
    this.enabled = true,
  });

  @override
  State<SwipeToConfirm> createState() => _SwipeToConfirmState();
}

class _SwipeToConfirmState extends State<SwipeToConfirm> {
  double _dx = 0;
  bool _busy = false;
  static const double _thumb = 58;
  static const double _height = 64;

  @override
  Widget build(BuildContext context) {
    final fg = AppTheme.isDark(context) ? AppTheme.ink : Colors.white;
    return LayoutBuilder(
      builder: (context, c) {
        final maxDx = c.maxWidth - _thumb - 8;
        final progress = maxDx <= 0 ? 0.0 : (_dx / maxDx).clamp(0.0, 1.0);
        return Opacity(
          opacity: widget.enabled ? 1 : 0.5,
          child: Container(
            height: _height,
            decoration: BoxDecoration(
              color: widget.color.withOpacity(0.14),
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: widget.color.withOpacity(0.30)),
            ),
            child: Stack(
              alignment: Alignment.center,
              children: [
                AnimatedOpacity(
                  opacity: 1 - progress,
                  duration: const Duration(milliseconds: 120),
                  child: Text(
                    widget.label,
                    style: TextStyle(
                      color: widget.color,
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.4,
                    ),
                  ),
                ),
                Positioned(
                  left: 4 + _dx,
                  top: 3,
                  child: GestureDetector(
                    onHorizontalDragUpdate: widget.enabled && !_busy
                        ? (d) => setState(() => _dx =
                            (_dx + d.delta.dx).clamp(0.0, maxDx))
                        : null,
                    onHorizontalDragEnd: widget.enabled && !_busy
                        ? (_) => _settle(maxDx)
                        : null,
                    child: Container(
                      width: _thumb,
                      height: _height - 6,
                      decoration: BoxDecoration(
                        color: widget.color,
                        borderRadius: BorderRadius.circular(15),
                      ),
                      child: Center(
                        child: _busy
                            ? SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(
                                    color: fg, strokeWidth: 2.6),
                              )
                            : Icon(widget.icon, color: fg, size: 26),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _settle(double maxDx) async {
    if (_dx >= maxDx * 0.92) {
      setState(() {
        _dx = maxDx;
        _busy = true;
      });
      HapticFeedback.mediumImpact();
      try {
        await widget.onConfirm();
      } finally {
        if (mounted) {
          setState(() {
            _busy = false;
            _dx = 0;
          });
        }
      }
    } else {
      setState(() => _dx = 0);
    }
  }
}
