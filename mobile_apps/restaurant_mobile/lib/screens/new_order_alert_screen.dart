import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/order_ui.dart';
import '../core/theme.dart';
import '../models/order_model.dart';

/// Fullscreen premium alert som visas när ny order kommer in.
/// Massiv #nummer i centrum, single huge call-to-action längst ned.
class NewOrderAlertScreen extends StatefulWidget {
  final OrderModel order;
  final VoidCallback onTap;

  const NewOrderAlertScreen({
    super.key,
    required this.order,
    required this.onTap,
  });

  @override
  State<NewOrderAlertScreen> createState() => _NewOrderAlertScreenState();
}

class _NewOrderAlertScreenState extends State<NewOrderAlertScreen>
    with TickerProviderStateMixin {
  late final AnimationController _entry;
  late final AnimationController _ring;

  @override
  void initState() {
    super.initState();
    _entry = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    )..forward();
    _ring = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat();
    HapticFeedback.heavyImpact();
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
    final order = widget.order;
    final isPickup = order.type != 'DELIVERY';
    final accent = isPickup ? AppTheme.ember : AppTheme.brandBlue;
    final accentSoft = accent.withOpacity(isDark ? 0.20 : 0.14);
    final bg = isDark ? AppTheme.midnight : AppTheme.mist;
    final textColor = isDark ? Colors.white : AppTheme.ink;

    return GestureDetector(
      onTap: widget.onTap,
      child: Scaffold(
        backgroundColor: bg,
        body: Stack(
          children: [
            // Radial wash bakom allt
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    center: Alignment.center,
                    radius: 1.0,
                    colors: [accentSoft, bg],
                  ),
                ),
              ),
            ),

            // Pulserande ringar
            ...List.generate(4, (i) {
              return AnimatedBuilder(
                animation: _ring,
                builder: (context, _) {
                  final phase = (_ring.value + i / 4) % 1.0;
                  final s = size.shortestSide * (0.5 + phase * 1.8);
                  return Center(
                    child: Container(
                      width: s,
                      height: s,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: accent.withOpacity(0.22 - phase * 0.22),
                          width: 1.5,
                        ),
                      ),
                    ),
                  );
                },
              );
            }),

            SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(24, 14, 24, 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        // NY ORDER eyebrow med live-dot
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 7),
                          decoration: BoxDecoration(
                            color: accent.withOpacity(0.14),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              _LivePulse(color: accent),
                              const SizedBox(width: 8),
                              Text(
                                'NY ORDER',
                                style: TextStyle(
                                  color: accent,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: 1.2,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const Spacer(),
                        Material(
                          color: Colors.transparent,
                          borderRadius: BorderRadius.circular(14),
                          child: InkWell(
                            onTap: () => Navigator.of(context).maybePop(),
                            borderRadius: BorderRadius.circular(14),
                            child: Container(
                              width: 42,
                              height: 42,
                              decoration: BoxDecoration(
                                color: AppTheme.faintColor(context),
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(
                                  color: AppTheme.borderColor(context),
                                ),
                              ),
                              child: Icon(
                                Icons.close_rounded,
                                color: textColor.withOpacity(0.55),
                                size: 22,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const Spacer(),

                    // Type pill ovanför nummer
                    FadeTransition(
                      opacity: CurvedAnimation(
                        parent: _entry,
                        curve: const Interval(0.2, 0.8),
                      ),
                      child: Center(
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 14, vertical: 8),
                          decoration: BoxDecoration(
                            color: accent.withOpacity(0.14),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: accent.withOpacity(0.30),
                              width: 1,
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                isPickup
                                    ? Icons.shopping_bag_rounded
                                    : Icons.delivery_dining_rounded,
                                color: accent,
                                size: 15,
                              ),
                              const SizedBox(width: 8),
                              Text(
                                isPickup ? 'AVHÄMTNING' : 'LEVERANS',
                                style: TextStyle(
                                  color: accent,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: 1.0,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 18),

                    // MASSIVT #nummer
                    ScaleTransition(
                      scale: CurvedAnimation(
                        parent: _entry,
                        curve: Curves.easeOutBack,
                      ),
                      child: Center(
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Padding(
                                padding: const EdgeInsets.only(bottom: 18),
                                child: Text(
                                  '#',
                                  style: TextStyle(
                                    color: accent,
                                    fontSize: 60,
                                    fontWeight: FontWeight.w800,
                                    height: 1.0,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 4),
                              Text(
                                order.orderNumber,
                                style: TextStyle(
                                  color: textColor,
                                  fontSize: 160,
                                  fontWeight: FontWeight.w900,
                                  height: 0.9,
                                  letterSpacing: -7,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 22),

                    // Kundnamn + total
                    FadeTransition(
                      opacity: CurvedAnimation(
                        parent: _entry,
                        curve: const Interval(0.4, 1.0),
                      ),
                      child: Column(
                        children: [
                          Text(
                            order.customerName,
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: textColor.withOpacity(0.75),
                              fontSize: 17,
                              fontWeight: FontWeight.w700,
                              letterSpacing: -0.2,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            OrderUi.formatCurrency(order.total),
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: accent,
                              fontSize: 22,
                              fontWeight: FontWeight.w900,
                              letterSpacing: -0.4,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Spacer(),

                    // Huge call-to-action
                    ScaleTransition(
                      scale: CurvedAnimation(
                        parent: _entry,
                        curve: const Interval(0.5, 1.0,
                            curve: Curves.easeOutBack),
                      ),
                      child: Container(
                        height: 76,
                        decoration: BoxDecoration(
                          color: accent,
                          borderRadius: BorderRadius.circular(22),
                          boxShadow: [
                            BoxShadow(
                              color: accent.withOpacity(0.45),
                              blurRadius: 28,
                              offset: const Offset(0, 10),
                            ),
                          ],
                        ),
                        child: Center(
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.bolt_rounded,
                                color: isDark ? AppTheme.ink : Colors.white,
                                size: 26,
                              ),
                              const SizedBox(width: 10),
                              Text(
                                'TRYCK FÖR ATT ÖPPNA',
                                style: TextStyle(
                                  color: isDark ? AppTheme.ink : Colors.white,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: 0.8,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
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
}

class _LivePulse extends StatefulWidget {
  final Color color;
  const _LivePulse({required this.color});

  @override
  State<_LivePulse> createState() => _LivePulseState();
}

class _LivePulseState extends State<_LivePulse>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (_, __) => Container(
        width: 9,
        height: 9,
        decoration: BoxDecoration(
          color: widget.color,
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: widget.color.withOpacity(0.6 * _c.value),
              blurRadius: 12 * _c.value + 4,
              spreadRadius: 3 * _c.value,
            ),
          ],
        ),
      ),
    );
  }
}
