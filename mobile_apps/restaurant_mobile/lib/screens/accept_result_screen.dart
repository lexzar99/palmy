import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../core/theme.dart';
import '../widgets/app_ui.dart';

/// Full-screen feedback efter att en order accepterats. Flat svartvitt — bara
/// hastighets-ikonen/badgen bär färg: grön (≤ 30 s) eller amber (> 30 s).
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
  Color get _accent => _isSlow ? AppTheme.warning : AppTheme.success;

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
    final isDark = AppTheme.isDark(context);
    final ink = isDark ? Colors.white : AppTheme.ink;
    final muted = AppTheme.mutedColor(context);
    final accent = _accent;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: AppBackdrop(
        child: Stack(
          children: [
            // Lugna accent-ringar bakom ikonen.
            ...List.generate(2, (i) {
              return AnimatedBuilder(
                animation: _ring,
                builder: (context, _) {
                  final phase = (_ring.value + i / 2) % 1.0;
                  final s = size.shortestSide * (0.55 + phase * 1.2);
                  return Center(
                    child: IgnorePointer(
                      child: Container(
                        width: s,
                        height: s,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: accent.withOpacity(0.18 - phase * 0.18),
                            width: 1.5,
                          ),
                        ),
                      ),
                    ),
                  );
                },
              );
            }),
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(28, 14, 28, 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Align(
                      alignment: Alignment.topRight,
                      child: IconButton(
                        onPressed: () => Navigator.of(context).maybePop(),
                        icon: Icon(Icons.close_rounded, color: muted),
                      ),
                    ),
                    const Spacer(),
                    ScaleTransition(
                      scale: CurvedAnimation(
                          parent: _entry, curve: Curves.elasticOut),
                      child: Center(
                        child: Container(
                          width: 132,
                          height: 132,
                          decoration: BoxDecoration(
                            color: accent.withOpacity(0.14),
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            _isSlow
                                ? Icons.timer_outlined
                                : Icons.check_circle_rounded,
                            color: accent,
                            size: 78,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 34),
                    FadeTransition(
                      opacity: CurvedAnimation(
                        parent: _entry,
                        curve: const Interval(0.3, 1.0),
                      ),
                      child: Column(
                        children: [
                          Text(
                            _isSlow ? 'Lite långsamt' : 'Bra jobbat',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: ink,
                              fontSize: 30,
                              fontWeight: FontWeight.w900,
                              letterSpacing: -0.6,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            _isSlow
                                ? 'Du tog emot beställningen på ${_formatSeconds(widget.seconds)}.\nNästa gång — försök snabbare så vi inte tappar kunder.'
                                : 'Du tog emot beställningen på ${_formatSeconds(widget.seconds)}.\nKunden är garanterat nöjd.',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: muted,
                              fontSize: 15,
                              fontWeight: FontWeight.w500,
                              height: 1.45,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 28),
                    ScaleTransition(
                      scale: CurvedAnimation(
                        parent: _entry,
                        curve: const Interval(0.5, 1.0, curve: Curves.elasticOut),
                      ),
                      child: Center(
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 18, vertical: 10),
                          decoration: BoxDecoration(
                            color: accent.withOpacity(0.12),
                            borderRadius: BorderRadius.circular(12),
                            border:
                                Border.all(color: accent.withOpacity(0.30)),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.bolt_rounded, color: accent, size: 20),
                              const SizedBox(width: 6),
                              Text(
                                _formatSeconds(widget.seconds),
                                style: TextStyle(
                                  color: accent,
                                  fontSize: 22,
                                  fontWeight: FontWeight.w900,
                                  fontFeatures: const [
                                    ui.FontFeature.tabularFigures()
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const Spacer(),
                    EmberButton(
                      label: 'Tillbaka till ordrar',
                      onPressed: () => Navigator.of(context).maybePop(),
                      color: ink,
                      foreground: isDark ? AppTheme.ink : Colors.white,
                      height: 54,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
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
