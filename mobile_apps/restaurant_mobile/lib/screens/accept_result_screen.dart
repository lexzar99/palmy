import 'dart:ui' as ui;

import 'package:flutter/material.dart';

/// Full-screen feedback after accepting a pending order.
/// Green for fast (≤ 30 s), orange for slow (> 30 s).
class AcceptResultScreen extends StatefulWidget {
  /// Seconds it took the staff to accept the order from when it landed.
  final int seconds;

  const AcceptResultScreen({super.key, required this.seconds});

  @override
  State<AcceptResultScreen> createState() => _AcceptResultScreenState();
}

class _AcceptResultScreenState extends State<AcceptResultScreen>
    with TickerProviderStateMixin {
  late final AnimationController _entry;
  late final AnimationController _ring;

  static const _slowThresholdSeconds = 30;

  bool get _isSlow => widget.seconds > _slowThresholdSeconds;

  Color get _accent =>
      _isSlow ? const Color(0xFFFF8A00) : const Color(0xFF21C77A);
  Color get _accentDeep =>
      _isSlow ? const Color(0xFFD96A00) : const Color(0xFF0E8A56);

  @override
  void initState() {
    super.initState();
    _entry = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 650),
    )..forward();
    _ring = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat();

    Future.delayed(const Duration(seconds: 3), () {
      if (mounted) Navigator.of(context).maybePop();
    });
  }

  @override
  void dispose() {
    _entry.dispose();
    _ring.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);

    return Scaffold(
      backgroundColor: _accent,
      body: Stack(
        children: [
          // Animated background pulses
          ...List.generate(3, (i) {
            return AnimatedBuilder(
              animation: _ring,
              builder: (context, _) {
                final phase = (_ring.value + i / 3) % 1.0;
                final s = size.shortestSide * (0.6 + phase * 1.4);
                return Center(
                  child: Container(
                    width: s,
                    height: s,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: Colors.white.withOpacity(0.18 - phase * 0.18),
                        width: 2,
                      ),
                    ),
                  ),
                );
              },
            );
          }),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(28, 24, 28, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Align(
                    alignment: Alignment.topRight,
                    child: IconButton(
                      onPressed: () => Navigator.of(context).maybePop(),
                      icon: const Icon(Icons.close, color: Colors.white),
                    ),
                  ),
                  const Spacer(),
                  // Big animated icon
                  ScaleTransition(
                    scale: CurvedAnimation(
                      parent: _entry,
                      curve: Curves.elasticOut,
                    ),
                    child: Center(
                      child: Container(
                        width: 140,
                        height: 140,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                              color: _accentDeep.withOpacity(0.4),
                              blurRadius: 30,
                              offset: const Offset(0, 12),
                            ),
                          ],
                        ),
                        child: Icon(
                          _isSlow
                              ? Icons.timer_outlined
                              : Icons.check_circle_rounded,
                          color: _accentDeep,
                          size: 84,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 36),
                  FadeTransition(
                    opacity: CurvedAnimation(
                      parent: _entry,
                      curve: const Interval(0.3, 1.0),
                    ),
                    child: Column(
                      children: [
                        Text(
                          _isSlow ? 'Lite långsamt' : 'Bra jobbat!',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 38,
                            fontWeight: FontWeight.w900,
                            letterSpacing: -1.2,
                          ),
                        ),
                        const SizedBox(height: 14),
                        Text(
                          _isSlow
                              ? 'Du tog emot beställningen på ${_formatSeconds(widget.seconds)}.\nNästa gång — försök snabbare så vi inte tappar kunder.'
                              : 'Du tog emot beställningen på ${_formatSeconds(widget.seconds)}.\nKunden är garanterat nöjd.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: Colors.white.withOpacity(0.92),
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                            height: 1.45,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 32),
                  // Big seconds badge
                  ScaleTransition(
                    scale: CurvedAnimation(
                      parent: _entry,
                      curve: const Interval(0.5, 1.0, curve: Curves.elasticOut),
                    ),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 24, vertical: 14),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.16),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: Colors.white.withOpacity(0.3)),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.bolt_rounded, color: Colors.white),
                          const SizedBox(width: 8),
                          Text(
                            _formatSeconds(widget.seconds),
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 28,
                              fontWeight: FontWeight.w900,
                              fontFeatures: [ui.FontFeature.tabularFigures()],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const Spacer(),
                  ElevatedButton(
                    onPressed: () => Navigator.of(context).maybePop(),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: _accentDeep,
                      padding: const EdgeInsets.symmetric(vertical: 18),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(18),
                      ),
                      textStyle: const TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 16,
                      ),
                    ),
                    child: const Text('Tillbaka till ordrar'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _formatSeconds(int s) {
    if (s < 60) return '${s}s';
    final m = s ~/ 60;
    final r = s % 60;
    return r == 0 ? '${m}m' : '${m}m ${r}s';
  }
}
