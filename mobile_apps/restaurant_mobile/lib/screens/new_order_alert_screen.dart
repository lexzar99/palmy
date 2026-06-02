import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/order_ui.dart';
import '../core/theme.dart';
import '../models/order_model.dart';

/// Fullscreen alert som visas när ny order kommer in.
///
/// REDESIGN 2026-06: tonad ned från det ursprungliga 4-rings/radial-gradient-
/// upplägget. Fokus nu på:
///   • Solid bg med en mjuk topp-tint → bättre kontrast mot texten
///   • Två lugna pulserande ringar (förr fyra → kändes hektisk)
///   • Tydligare type-hierarki: #nummer → namn → adress/avhämtningskanal → total
///   • Stort CTA-pill längst ned med självförklarande "Öppna order →"
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
      duration: const Duration(milliseconds: 2200),
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
    // Solid bg, ingen radial-wash. Stark kontrast mot text. Använder mist
    // (warm off-white) i ljust läge i stället för paper (pure white) → matchar
    // resten av Ember Studio-paletten och blir mjukare mot ögat.
    final bg = isDark ? AppTheme.midnight : AppTheme.mist;
    final textPrimary = isDark ? Colors.white : AppTheme.ink;
    final textSecondary = isDark
        ? Colors.white.withOpacity(0.72)
        : AppTheme.ink.withOpacity(0.66);
    // CTA-text-färg: alltid maximal kontrast mot accent-bg.
    final ctaText = accent.computeLuminance() > 0.5 ? AppTheme.ink : Colors.white;

    return GestureDetector(
      onTap: widget.onTap,
      child: Scaffold(
        backgroundColor: bg,
        body: Stack(
          children: [
            // Subtil topp-tint (bara 18% av höjden) i stället för full radial.
            // Ger karaktär utan att kompromissa kontrasten på texten.
            Positioned(
              top: 0, left: 0, right: 0,
              height: size.height * 0.45,
              child: IgnorePointer(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        accent.withOpacity(isDark ? 0.18 : 0.10),
                        bg.withOpacity(0),
                      ],
                    ),
                  ),
                ),
              ),
            ),

            // Två lugna pulserande ringar bakom siffran (förr fyra).
            ...List.generate(2, (i) {
              return AnimatedBuilder(
                animation: _ring,
                builder: (context, _) {
                  final phase = (_ring.value + i / 2) % 1.0;
                  final s = size.shortestSide * (0.55 + phase * 1.4);
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
                padding: const EdgeInsets.fromLTRB(24, 14, 24, 22),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // ── Top-rad: eyebrow + stäng ──────────────────────────
                    Row(
                      children: [
                        _Eyebrow(accent: accent),
                        const Spacer(),
                        _CloseButton(
                          textColor: textPrimary,
                          onTap: () => Navigator.of(context).maybePop(),
                        ),
                      ],
                    ),
                    const Spacer(),

                    // ── Type-pill (LEVERANS / AVHÄMTNING) ────────────────
                    FadeTransition(
                      opacity: CurvedAnimation(
                        parent: _entry,
                        curve: const Interval(0.2, 0.8),
                      ),
                      child: Center(
                        child: _TypePill(isPickup: isPickup, accent: accent),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // ── Massivt #nummer ──────────────────────────────────
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
                                padding: const EdgeInsets.only(bottom: 22),
                                child: Text(
                                  '#',
                                  style: TextStyle(
                                    color: accent,
                                    fontSize: 56,
                                    fontWeight: FontWeight.w800,
                                    height: 1.0,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 6),
                              Text(
                                order.orderNumber,
                                style: TextStyle(
                                  color: textPrimary,
                                  fontSize: 168,
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
                    const SizedBox(height: 26),

                    // ── Kundnamn (större, full kontrast) ─────────────────
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
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: textPrimary,
                              fontSize: 22,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.4,
                            ),
                          ),
                          if (_subtitleLine(order) != null) ...[
                            const SizedBox(height: 6),
                            Text(
                              _subtitleLine(order)!,
                              textAlign: TextAlign.center,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: textSecondary,
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                letterSpacing: -0.1,
                              ),
                            ),
                          ],
                          const SizedBox(height: 14),
                          // Total i egen rad — fet, full accent-färg.
                          Text(
                            OrderUi.formatCurrency(order.total),
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              color: accent,
                              fontSize: 30,
                              fontWeight: FontWeight.w900,
                              letterSpacing: -0.6,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Spacer(),

                    // ── CTA: "Öppna order →" ─────────────────────────────
                    ScaleTransition(
                      scale: CurvedAnimation(
                        parent: _entry,
                        curve: const Interval(0.5, 1.0,
                            curve: Curves.easeOutBack),
                      ),
                      child: GestureDetector(
                        onTap: widget.onTap,
                        child: Container(
                          height: 72,
                          decoration: BoxDecoration(
                            color: accent,
                            borderRadius: BorderRadius.circular(22),
                            boxShadow: [
                              BoxShadow(
                                color: accent.withOpacity(0.42),
                                blurRadius: 24,
                                offset: const Offset(0, 8),
                              ),
                            ],
                          ),
                          child: Center(
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  'Öppna order',
                                  style: TextStyle(
                                    color: ctaText,
                                    fontSize: 18,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: -0.2,
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Icon(
                                  Icons.arrow_forward_rounded,
                                  color: ctaText,
                                  size: 22,
                                ),
                              ],
                            ),
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

  /// Sekundär rad under namnet: visar leveransadress för DELIVERY, eller
  /// "AVHÄMTNING om X min" för PICKUP, så restaurangen får snabb-context.
  String? _subtitleLine(OrderModel order) {
    if (order.type == 'DELIVERY') {
      final street = (order.deliveryStreet ?? '').trim();
      final city = (order.deliveryCity ?? '').trim();
      if (street.isNotEmpty && city.isNotEmpty) return '$street, $city';
      if (street.isNotEmpty) return street;
      if (city.isNotEmpty) return city;
      return null;
    }
    // PICKUP
    if (order.scheduledFor != null) {
      final h = order.scheduledFor!.hour.toString().padLeft(2, '0');
      final m = order.scheduledFor!.minute.toString().padLeft(2, '0');
      return 'Avhämtning $h:$m';
    }
    return null;
  }
}

// ── Sub-widgets ──────────────────────────────────────────────────────────────

class _Eyebrow extends StatelessWidget {
  final Color accent;
  const _Eyebrow({required this.accent});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
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
    );
  }
}

class _CloseButton extends StatelessWidget {
  final Color textColor;
  final VoidCallback onTap;
  const _CloseButton({required this.textColor, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(
            color: AppTheme.faintColor(context),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppTheme.borderColor(context)),
          ),
          child: Icon(
            Icons.close_rounded,
            color: textColor.withOpacity(0.55),
            size: 22,
          ),
        ),
      ),
    );
  }
}

class _TypePill extends StatelessWidget {
  final bool isPickup;
  final Color accent;
  const _TypePill({required this.isPickup, required this.accent});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: accent.withOpacity(0.14),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: accent.withOpacity(0.30), width: 1),
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
