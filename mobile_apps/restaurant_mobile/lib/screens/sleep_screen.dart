import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../core/theme.dart';
import '../providers/order_provider.dart';

class SleepScreen extends StatefulWidget {
  final VoidCallback onWake;
  const SleepScreen({super.key, required this.onWake});

  @override
  State<SleepScreen> createState() => _SleepScreenState();
}

class _SleepScreenState extends State<SleepScreen> {
  late Timer _ticker;
  late DateTime _now;

  @override
  void initState() {
    super.initState();
    _now = DateTime.now();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _now = DateTime.now());
    });
  }

  @override
  void dispose() {
    _ticker.cancel();
    super.dispose();
  }

  String _twoDigit(int n) => n.toString().padLeft(2, '0');

  String _countdownText(DateTime until) {
    final diff = until.difference(_now);
    if (diff.isNegative) return '00:00';
    final m = _twoDigit(diff.inMinutes);
    final s = _twoDigit(diff.inSeconds % 60);
    return '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final bg = isDark ? const Color(0xFF09090B) : Colors.white;
    final ink = isDark ? Colors.white : AppTheme.ink;
    final muted = isDark ? Colors.white.withOpacity(0.45) : AppTheme.mutedInk;
    final border =
        isDark ? Colors.white.withOpacity(0.14) : const Color(0xFFE6E6E2);

    return Consumer<OrderProvider>(
      builder: (context, provider, _) {
        final isPaused = provider.isPaused;
        final h = _twoDigit(_now.hour);
        final m = _twoDigit(_now.minute);
        final weekdays = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
        final months = [
          'jan', 'feb', 'mar', 'apr', 'maj', 'jun',
          'jul', 'aug', 'sep', 'okt', 'nov', 'dec'
        ];
        final dateStr =
            '${weekdays[_now.weekday - 1]} ${_now.day} ${months[_now.month - 1]}';

        return Scaffold(
          backgroundColor: bg,
          body: Stack(
            children: [
              // X-knapp uppe till höger — gå tillbaka utan att ändra status.
              Positioned(
                top: 16,
                right: 16,
                child: SafeArea(
                  child: GestureDetector(
                    onTap: widget.onWake,
                    behavior: HitTestBehavior.opaque,
                    child: Container(
                      width: 46,
                      height: 46,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(color: border, width: 1.2),
                      ),
                      child: Icon(Icons.close_rounded, color: ink, size: 22),
                    ),
                  ),
                ),
              ),

              // Centrerat innehåll.
              SafeArea(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 28),
                  child: Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          '$h:$m',
                          style: TextStyle(
                            fontSize: 92,
                            fontWeight: FontWeight.w200,
                            color: ink,
                            letterSpacing: -4,
                            height: 1.0,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          dateStr,
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            color: muted,
                            letterSpacing: 0.2,
                          ),
                        ),
                        const SizedBox(height: 32),

                        if (isPaused)
                          _PauseBadge(
                            countdown: _countdownText(provider.pausedUntil!),
                            ink: ink,
                            muted: muted,
                            border: border,
                          )
                        else
                          _ClosedBadge(ink: ink, muted: muted, border: border),

                        const SizedBox(height: 32),

                        if (isPaused) ...[
                          Text(
                            'FÖRLÄNG PAUS',
                            style: TextStyle(
                              color: muted,
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 1.6,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            alignment: WrapAlignment.center,
                            children: [10, 15, 20, 25, 30]
                                .map((min) => _ExtendChip(
                                      minutes: min,
                                      ink: ink,
                                      border: border,
                                      onTap: () => provider.extendPause(min),
                                    ))
                                .toList(),
                          ),
                          const SizedBox(height: 26),
                        ],

                        _OpenNowButton(
                          isPaused: isPaused,
                          ink: ink,
                          fg: isDark ? AppTheme.ink : Colors.white,
                          onTap: () async {
                            if (isPaused) {
                              await provider.cancelPause();
                            } else {
                              await provider.setStatus(true);
                            }
                            widget.onWake();
                          },
                        ),
                      ],
                    ),
                  ),
                ),
              ),

              // Hint längst ner.
              Positioned(
                left: 0,
                right: 0,
                bottom: 24,
                child: SafeArea(
                  top: false,
                  child: Text(
                    'Tryck × i hörnet för att gå tillbaka',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: muted,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _ClosedBadge extends StatelessWidget {
  final Color ink;
  final Color muted;
  final Color border;
  const _ClosedBadge({
    required this.ink,
    required this.muted,
    required this.border,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 9),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: border, width: 1.2),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.nightlight_round, size: 14, color: muted),
          const SizedBox(width: 8),
          Text(
            'STÄNGT · UTANFÖR ÖPPETTIDER',
            style: TextStyle(
              color: ink,
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.4,
            ),
          ),
        ],
      ),
    );
  }
}

class _PauseBadge extends StatelessWidget {
  final String countdown;
  final Color ink;
  final Color muted;
  final Color border;
  const _PauseBadge({
    required this.countdown,
    required this.ink,
    required this.muted,
    required this.border,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: border, width: 1.2),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.pause_circle_outline_rounded, color: muted, size: 14),
              const SizedBox(width: 6),
              Text(
                'PAUSAD',
                style: TextStyle(
                  color: ink,
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.6,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Text(
          countdown,
          style: TextStyle(
            fontSize: 56,
            fontWeight: FontWeight.w300,
            color: ink,
            letterSpacing: -1,
            height: 1.0,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'minuter kvar',
          style: TextStyle(
            color: muted,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class _ExtendChip extends StatelessWidget {
  final int minutes;
  final Color ink;
  final Color border;
  final VoidCallback onTap;
  const _ExtendChip({
    required this.minutes,
    required this.ink,
    required this.border,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: border, width: 1.2),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.add_rounded, color: ink, size: 14),
            const SizedBox(width: 4),
            Text(
              '$minutes min',
              style: TextStyle(
                color: ink,
                fontSize: 13,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OpenNowButton extends StatelessWidget {
  final bool isPaused;
  final Color ink;
  final Color fg;
  final VoidCallback onTap;
  const _OpenNowButton({
    required this.isPaused,
    required this.ink,
    required this.fg,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
        decoration: BoxDecoration(
          color: ink,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.storefront_rounded, color: fg, size: 20),
            const SizedBox(width: 10),
            Text(
              isPaused ? 'AVBRYT PAUS · ÖPPNA NU' : 'ÖPPNA RESTAURANG',
              style: TextStyle(
                color: fg,
                fontSize: 13,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.8,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
