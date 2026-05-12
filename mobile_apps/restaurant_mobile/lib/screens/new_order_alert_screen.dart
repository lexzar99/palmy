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

                    // Bell in soft circle
                    ScaleTransition(
                      scale: CurvedAnimation(
                        parent: _entry,
                        curve: Curves.easeOutBack,
                      ),
                      child: Center(
                        child: Container(
                          width: 128,
                          height: 128,
                          decoration: BoxDecoration(
                            color: accent.withOpacity(0.12),
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            Icons.notifications_active_rounded,
                            color: accent,
                            size: 64,
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
                            'Ny order',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: AppTheme.ink,
                              fontSize: 34,
                              fontWeight: FontWeight.w600,
                              letterSpacing: -0.6,
                              height: 1.0,
                            ),
                          ),
                          const SizedBox(height: 12),
                          // Type pill
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(
                              color: accent.withOpacity(0.10),
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(
                                color: accent.withOpacity(0.22),
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
                                  size: 13,
                                ),
                                const SizedBox(width: 5),
                                Text(
                                  isPickup ? 'AVHÄMTNING' : 'LEVERANS',
                                  style: TextStyle(
                                    color: accent,
                                    fontSize: 10.5,
                                    fontWeight: FontWeight.w600,
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
                              fontSize: 28,
                              fontWeight: FontWeight.w600,
                              letterSpacing: -0.6,
                              height: 1.0,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            order.customerName,
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: AppTheme.ink.withOpacity(0.65),
                              fontSize: 15,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            OrderUi.formatCurrency(order.total),
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: accent,
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
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
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        decoration: BoxDecoration(
                          color: accent,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              'Tryck för att öppna',
                              style: TextStyle(
                                color: isPickup ? AppTheme.ink : Colors.white,
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                                letterSpacing: 0.1,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Icon(
                              Icons.arrow_forward_rounded,
                              color: isPickup ? AppTheme.ink : Colors.white,
                              size: 18,
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
