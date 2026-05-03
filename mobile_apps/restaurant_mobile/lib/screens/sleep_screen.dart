import 'dart:async';
import 'package:flutter/material.dart';
import '../core/theme.dart';

class SleepScreen extends StatefulWidget {
  final VoidCallback onWake;
  const SleepScreen({super.key, required this.onWake});

  @override
  State<SleepScreen> createState() => _SleepScreenState();
}

class _SleepScreenState extends State<SleepScreen>
    with SingleTickerProviderStateMixin {
  late Timer _clockTimer;
  late DateTime _now;
  late AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _now = DateTime.now();
    _clockTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _now = DateTime.now());
    });
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2800),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _clockTimer.cancel();
    _pulse.dispose();
    super.dispose();
  }

  String _twoDigit(int n) => n.toString().padLeft(2, '0');

  @override
  Widget build(BuildContext context) {
    final h = _twoDigit(_now.hour);
    final m = _twoDigit(_now.minute);
    final weekdays = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
    final months = [
      'jan', 'feb', 'mar', 'apr', 'maj', 'jun',
      'jul', 'aug', 'sep', 'okt', 'nov', 'dec'
    ];
    final dateStr =
        '${weekdays[_now.weekday - 1]} ${_now.day} ${months[_now.month - 1]}';

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: widget.onWake,
      onPanDown: (_) => widget.onWake(),
      child: Scaffold(
        backgroundColor: AppTheme.midnight,
        body: Stack(
          children: [
            // Ambient gold glow behind clock
            Center(
              child: AnimatedBuilder(
                animation: _pulse,
                builder: (_, __) => Container(
                  width: 300,
                  height: 300,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: AppTheme.brandGold
                            .withOpacity(0.04 + _pulse.value * 0.05),
                        blurRadius: 140,
                        spreadRadius: 70,
                      ),
                    ],
                  ),
                ),
              ),
            ),

            // Main content
            Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Clock
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

                  // STÄNGT badge
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 18, vertical: 7),
                    decoration: BoxDecoration(
                      color: AppTheme.danger.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(
                          color: AppTheme.danger.withOpacity(0.35),
                          width: 1.2),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 7,
                          height: 7,
                          decoration: const BoxDecoration(
                            color: AppTheme.danger,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 8),
                        const Text(
                          'STÄNGT · UTANFÖR ÖPPETTIDER',
                          style: TextStyle(
                            color: AppTheme.danger,
                            fontSize: 11,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.6,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            // Wake hint at bottom
            Positioned(
              bottom: 48,
              left: 0,
              right: 0,
              child: AnimatedBuilder(
                animation: _pulse,
                builder: (_, __) => Opacity(
                  opacity: 0.15 + _pulse.value * 0.15,
                  child: const Text(
                    'Tryck för att vakna',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      letterSpacing: 0.3,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
