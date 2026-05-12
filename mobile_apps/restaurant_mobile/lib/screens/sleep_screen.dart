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

class _SleepScreenState extends State<SleepScreen>
    with SingleTickerProviderStateMixin {
  late Timer _ticker;
  late DateTime _now;
  late AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _now = DateTime.now();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _now = DateTime.now());
    });
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2800),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _ticker.cancel();
    _pulse.dispose();
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
          backgroundColor: AppTheme.midnight,
          body: Stack(
            children: [
              // Ambient glow
              Center(
                child: AnimatedBuilder(
                  animation: _pulse,
                  builder: (_, __) => Container(
                    width: 320,
                    height: 320,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: (isPaused
                                  ? AppTheme.warning
                                  : AppTheme.brandGold)
                              .withOpacity(0.04 + _pulse.value * 0.05),
                          blurRadius: 140,
                          spreadRadius: 70,
                        ),
                      ],
                    ),
                  ),
                ),
              ),

              // X-button (top right) – enda sättet att stänga
              Positioned(
                top: 16,
                right: 16,
                child: SafeArea(
                  child: GestureDetector(
                    onTap: widget.onWake,
                    child: Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.06),
                        shape: BoxShape.circle,
                        border: Border.all(
                            color: Colors.white.withOpacity(0.15),
                            width: 1.2),
                      ),
                      child: const Icon(Icons.close_rounded,
                          color: Colors.white, size: 22),
                    ),
                  ),
                ),
              ),

              // Main content – centrerat innehåll i mitten av skärmen
              SafeArea(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // Klocka + datum
                        Text(
                          '$h:$m',
                          style: const TextStyle(
                            fontSize: 88,
                            fontWeight: FontWeight.w200,
                            color: Colors.white,
                            letterSpacing: -4,
                            height: 1.0,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          dateStr,
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w500,
                            color: Colors.white.withOpacity(0.38),
                            letterSpacing: 0.2,
                          ),
                        ),
                        const SizedBox(height: 28),

                        // Status-badge
                        if (isPaused)
                          _PauseBadge(
                              countdown:
                                  _countdownText(provider.pausedUntil!))
                        else
                          _ClosedBadge(),

                        const SizedBox(height: 28),

                        // Förläng-knappar (endast vid pause)
                        if (isPaused) ...[
                          Text(
                            'FÖRLÄNG PAUS',
                            style: TextStyle(
                              color: Colors.white.withOpacity(0.40),
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 1.6,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            alignment: WrapAlignment.center,
                            children: [10, 15, 20, 25, 30]
                                .map((m) => _ExtendChip(
                                      minutes: m,
                                      onTap: () => provider.extendPause(m),
                                    ))
                                .toList(),
                          ),
                          const SizedBox(height: 22),
                        ],

                        // Öppna nu
                        _OpenNowButton(
                          isPaused: isPaused,
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

              // X-hint längst ner (absolut positionerad)
              Positioned(
                left: 0,
                right: 0,
                bottom: 24,
                child: SafeArea(
                  top: false,
                  child: AnimatedBuilder(
                    animation: _pulse,
                    builder: (_, __) => Opacity(
                      opacity: 0.20 + _pulse.value * 0.15,
                      child: Text(
                        'Tryck × i hörnet för att gå tillbaka',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.7),
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
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
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 7),
      decoration: BoxDecoration(
        color: AppTheme.danger.withOpacity(0.12),
        borderRadius: BorderRadius.circular(14),
        border:
            Border.all(color: AppTheme.danger.withOpacity(0.35), width: 1.2),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: const BoxDecoration(
                color: AppTheme.danger, shape: BoxShape.circle),
          ),
          const SizedBox(width: 8),
          const Text(
            'STÄNGT · UTANFÖR ÖPPETTIDER',
            style: TextStyle(
              color: AppTheme.danger,
              fontSize: 11,
              fontWeight: FontWeight.w600,
              letterSpacing: 1.6,
            ),
          ),
        ],
      ),
    );
  }
}

class _PauseBadge extends StatelessWidget {
  final String countdown;
  const _PauseBadge({required this.countdown});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          decoration: BoxDecoration(
            color: AppTheme.warning.withOpacity(0.12),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
                color: AppTheme.warning.withOpacity(0.35), width: 1.2),
          ),
          child: const Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.pause_circle_outline_rounded,
                  color: AppTheme.warning, size: 14),
              SizedBox(width: 6),
              Text(
                'PAUSAD',
                style: TextStyle(
                  color: AppTheme.warning,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 1.6,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        // Stor countdown
        Text(
          countdown,
          style: const TextStyle(
            fontSize: 56,
            fontWeight: FontWeight.w300,
            color: AppTheme.warning,
            letterSpacing: -1,
            height: 1.0,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          'minuter kvar',
          style: TextStyle(
            color: Colors.white.withOpacity(0.40),
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
  final VoidCallback onTap;
  const _ExtendChip({required this.minutes, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: AppTheme.warning.withOpacity(0.10),
          borderRadius: BorderRadius.circular(14),
          border:
              Border.all(color: AppTheme.warning.withOpacity(0.30), width: 1.2),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.add_rounded, color: AppTheme.warning, size: 14),
            const SizedBox(width: 4),
            Text(
              '$minutes min',
              style: const TextStyle(
                color: AppTheme.warning,
                fontSize: 13,
                fontWeight: FontWeight.w600,
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
  final VoidCallback onTap;
  const _OpenNowButton({required this.isPaused, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
        decoration: BoxDecoration(
          color: AppTheme.success,
          borderRadius: BorderRadius.circular(14),
          boxShadow: [
            BoxShadow(
              color: AppTheme.success.withOpacity(0.40),
              blurRadius: 24,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.storefront_rounded,
                color: Colors.white, size: 20),
            const SizedBox(width: 10),
            Text(
              isPaused ? 'AVBRYT PAUS · ÖPPNA NU' : 'BYT TILL ÖPPET',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 13,
                fontWeight: FontWeight.w600,
                letterSpacing: 1.0,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
