import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/order_ui.dart';
import '../core/theme.dart';
import '../models/order_model.dart';

/// Fullscreen premium alert shown when a new pending order arrives.
/// Cream + gold theme matching the app brand. Tap anywhere → close (returns
/// to dashboard with the new order at the top of NYA ORDER).
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
      duration: const Duration(milliseconds: 600),
    )..forward();
    _ring = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
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
    final order = widget.order;
    final isPickup = order.type != 'DELIVERY';
    final accent = isPickup ? AppTheme.brandGold : AppTheme.brandBlue;
    final accentSoft =
        isPickup ? AppTheme.creamBg : AppTheme.blueTint;
    final iconBg = isPickup ? AppTheme.creamPill : AppTheme.blueTintPill;

    return GestureDetector(
      onTap: widget.onTap,
      child: Scaffold(
        backgroundColor: const Color(0xFFFAFAFA),
        body: Stack(
          children: [
            // Soft cream/blue radial wash behind everything
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    center: Alignment.topCenter,
                    radius: 1.2,
                    colors: [accentSoft, const Color(0xFFFAFAFA)],
                  ),
                ),
              ),
            ),

            // Pulsing rings
            ...List.generate(3, (i) {
              return AnimatedBuilder(
                animation: _ring,
                builder: (context, _) {
                  final phase = (_ring.value + i / 3) % 1.0;
                  final s = size.shortestSide * (0.4 + phase * 1.6);
                  return Center(
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
                    Align(
                      alignment: Alignment.topRight,
                      child: IconButton(
                        onPressed: () => Navigator.of(context).maybePop(),
                        icon: Icon(Icons.close_rounded,
                            color: AppTheme.ink.withOpacity(0.45), size: 26),
                      ),
                    ),
                    const Spacer(),

                    // Big bell in cream circle
                    ScaleTransition(
                      scale: CurvedAnimation(
                        parent: _entry,
                        curve: Curves.easeOutBack,
                      ),
                      child: Center(
                        child: Container(
                          width: 144,
                          height: 144,
                          decoration: BoxDecoration(
                            color: iconBg,
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(
                                color: accent.withOpacity(0.20),
                                blurRadius: 30,
                                offset: const Offset(0, 14),
                              ),
                            ],
                          ),
                          child: Icon(
                            Icons.notifications_active_rounded,
                            color: accent,
                            size: 76,
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
                            'Ny order!',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: AppTheme.ink,
                              fontSize: 42,
                              fontWeight: FontWeight.w900,
                              letterSpacing: -1.5,
                              height: 1.0,
                            ),
                          ),
                          const SizedBox(height: 14),
                          // Type pill
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 7),
                            decoration: BoxDecoration(
                              color: iconBg,
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  isPickup
                                      ? Icons.shopping_bag_rounded
                                      : Icons.delivery_dining_rounded,
                                  color: accent,
                                  size: 14,
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  isPickup ? 'AVHÄMTNING' : 'LEVERANS',
                                  style: TextStyle(
                                    color: accent,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: 0.5,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                          Text(
                            '#${order.orderNumber}',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: AppTheme.ink,
                              fontSize: 32,
                              fontWeight: FontWeight.w900,
                              letterSpacing: -1.0,
                              height: 1.0,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            order.customerName,
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: AppTheme.ink.withOpacity(0.65),
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            OrderUi.formatCurrency(order.total),
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: accent,
                              fontSize: 17,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Spacer(),

                    // Tap to open button
                    ScaleTransition(
                      scale: CurvedAnimation(
                        parent: _entry,
                        curve:
                            const Interval(0.5, 1.0, curve: Curves.easeOutBack),
                      ),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 18),
                        decoration: BoxDecoration(
                          color: accent,
                          borderRadius: BorderRadius.circular(18),
                          boxShadow: [
                            BoxShadow(
                              color: accent.withOpacity(0.35),
                              blurRadius: 22,
                              offset: const Offset(0, 10),
                            ),
                          ],
                        ),
                        child: const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              'Tryck för att öppna',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 16,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 0.3,
                              ),
                            ),
                            SizedBox(width: 8),
                            Icon(
                              Icons.arrow_forward_rounded,
                              color: Colors.white,
                              size: 20,
                            ),
                          ],
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
