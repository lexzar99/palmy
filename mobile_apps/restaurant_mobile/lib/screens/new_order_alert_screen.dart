import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/order_ui.dart';
import '../models/order_model.dart';

/// Fullscreen pulsing alert shown the moment a new pending order arrives.
///
/// Same energy / motion as [AcceptResultScreen] but BLUE — it's an
/// attention-grabber, not a celebration. Tap anywhere → push the
/// [OrderTakeScreen] for that order.
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

  static const _accent = Color(0xFF2476FF);
  static const _accentDeep = Color(0xFF1455D8);

  @override
  void initState() {
    super.initState();
    _entry = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    )..forward();
    _ring = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
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

    return GestureDetector(
      onTap: widget.onTap,
      child: Scaffold(
        backgroundColor: _accent,
        body: Stack(
          children: [
            // Animated background pulse rings
            ...List.generate(3, (i) {
              return AnimatedBuilder(
                animation: _ring,
                builder: (context, _) {
                  final phase = (_ring.value + i / 3) % 1.0;
                  final s = size.shortestSide * (0.5 + phase * 1.5);
                  return Center(
                    child: Container(
                      width: s,
                      height: s,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: Colors.white.withOpacity(0.22 - phase * 0.22),
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
                padding: const EdgeInsets.fromLTRB(24, 20, 24, 20),
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
                    // Big bell icon
                    ScaleTransition(
                      scale: CurvedAnimation(
                        parent: _entry,
                        curve: Curves.elasticOut,
                      ),
                      child: Center(
                        child: Container(
                          width: 130,
                          height: 130,
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
                          child: const Icon(
                            Icons.notifications_active_rounded,
                            color: _accentDeep,
                            size: 76,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 32),
                    FadeTransition(
                      opacity: CurvedAnimation(
                        parent: _entry,
                        curve: const Interval(0.3, 1.0),
                      ),
                      child: Column(
                        children: [
                          const Text(
                            'Ny order!',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 40,
                              fontWeight: FontWeight.w900,
                              letterSpacing: -1.4,
                            ),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            order.customerName,
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: Colors.white.withOpacity(0.95),
                              fontSize: 20,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            '${OrderUi.typeLabel(order.type)} · ${OrderUi.formatCurrency(order.total)}',
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: Colors.white.withOpacity(0.85),
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Spacer(),
                    // Big tap-to-open badge
                    ScaleTransition(
                      scale: CurvedAnimation(
                        parent: _entry,
                        curve: const Interval(0.5, 1.0, curve: Curves.elasticOut),
                      ),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 18),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: [
                            BoxShadow(
                              color: _accentDeep.withOpacity(0.3),
                              blurRadius: 18,
                              offset: const Offset(0, 8),
                            ),
                          ],
                        ),
                        child: const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              'Tryck för att öppna',
                              style: TextStyle(
                                color: _accentDeep,
                                fontSize: 17,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 0.2,
                              ),
                            ),
                            SizedBox(width: 8),
                            Icon(
                              Icons.arrow_forward_rounded,
                              color: _accentDeep,
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
