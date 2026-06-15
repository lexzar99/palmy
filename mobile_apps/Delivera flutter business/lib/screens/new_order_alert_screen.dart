import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/order_ui.dart';
import '../core/theme.dart';
import '../models/order_model.dart';

/// Fullscreen alert som visas när ny order kommer in.
///
/// REDESIGN 2026-06 (v2): rent vitt tema, platt och simpelt. Bort med
/// radial-gradient, pulserande ringar och den typ-styrda lila/blå/amber-färgen
/// — nu en lugn vit yta, sparsam guld (NY ORDER + total) och en platt ink-CTA.
/// Enkel, fin typografi och tydlig hierarki: typ → #nummer → namn → total.
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

  @override
  void initState() {
    super.initState();
    _entry = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 520),
    )..forward();
    HapticFeedback.heavyImpact();
  }

  @override
  void dispose() {
    _entry.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final order = widget.order;
    final isPickup = order.type != 'DELIVERY';

    // Platt vit yta (mörk neutral i dark mode). Inga gradienter, inga ringar.
    final bg = isDark ? AppTheme.midnight : AppTheme.paper;
    final textPrimary = isDark ? Colors.white : AppTheme.ink;
    final textSecondary = AppTheme.mutedColor(context);
    // Sparsam guld: läsbar nyans mot bakgrunden (djupare guld på vitt).
    final gold = isDark ? AppTheme.ember : AppTheme.emberDeep;
    // Platt CTA: maximal kontrast, ingen färgad glow.
    final ctaBg = isDark ? Colors.white : AppTheme.ink;
    final ctaText = isDark ? AppTheme.ink : Colors.white;

    return GestureDetector(
      onTap: widget.onTap,
      child: Scaffold(
        backgroundColor: bg,
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // ── Top-rad: NY ORDER (guld) + stäng ──────────────────────
                Row(
                  children: [
                    _Eyebrow(gold: gold),
                    const Spacer(),
                    _CloseButton(
                      textColor: textPrimary,
                      onTap: () => Navigator.of(context).maybePop(),
                    ),
                  ],
                ),
                const Spacer(),

                // ── Typ (LEVERANS / AVHÄMTNING) — neutral, platt ──────────
                FadeTransition(
                  opacity: CurvedAnimation(
                    parent: _entry,
                    curve: const Interval(0.15, 0.8),
                  ),
                  child: Center(
                    child: _TypePill(isPickup: isPickup),
                  ),
                ),
                const SizedBox(height: 18),

                // ── #nummer — ink, stort men elegant ──────────────────────
                ScaleTransition(
                  scale: Tween(begin: 0.94, end: 1.0).animate(
                    CurvedAnimation(parent: _entry, curve: Curves.easeOutCubic),
                  ),
                  child: Center(
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Padding(
                            padding: const EdgeInsets.only(top: 14),
                            child: Text(
                              '#',
                              style: TextStyle(
                                color: gold,
                                fontSize: 44,
                                fontWeight: FontWeight.w700,
                                height: 1.0,
                              ),
                            ),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            order.orderNumber,
                            style: TextStyle(
                              color: textPrimary,
                              fontSize: 132,
                              fontWeight: FontWeight.w800,
                              height: 0.95,
                              letterSpacing: -5,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 24),

                // ── Kundnamn + sub-rad + total ────────────────────────────
                FadeTransition(
                  opacity: CurvedAnimation(
                    parent: _entry,
                    curve: const Interval(0.35, 1.0),
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
                          fontSize: 21,
                          fontWeight: FontWeight.w700,
                          letterSpacing: -0.3,
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
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                      const SizedBox(height: 18),
                      // Tunn avdelare → lugnt andrum före totalen.
                      Container(
                        width: 32,
                        height: 1,
                        color: AppTheme.borderColor(context),
                      ),
                      const SizedBox(height: 18),
                      Text(
                        OrderUi.formatCurrency(order.total),
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: gold,
                          fontSize: 30,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.5,
                        ),
                      ),
                    ],
                  ),
                ),
                const Spacer(),

                // ── CTA: platt "Öppna order →" ────────────────────────────
                FadeTransition(
                  opacity: CurvedAnimation(
                    parent: _entry,
                    curve: const Interval(0.45, 1.0),
                  ),
                  child: GestureDetector(
                    onTap: widget.onTap,
                    child: Container(
                      height: 64,
                      decoration: BoxDecoration(
                        color: ctaBg,
                        borderRadius: BorderRadius.circular(18),
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
                                fontSize: 17,
                                fontWeight: FontWeight.w700,
                                letterSpacing: -0.2,
                              ),
                            ),
                            const SizedBox(width: 9),
                            Icon(
                              Icons.arrow_forward_rounded,
                              color: ctaText,
                              size: 20,
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
      ),
    );
  }

  /// Sekundär rad under namnet: visar leveransadress för DELIVERY, eller
  /// "Avhämtning HH:MM" för PICKUP, så restaurangen får snabb-context.
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
  final Color gold;
  const _Eyebrow({required this.gold});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: gold.withOpacity(0.12),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _LiveDot(color: gold),
          const SizedBox(width: 8),
          Text(
            'NY ORDER',
            style: TextStyle(
              color: gold,
              fontSize: 12,
              fontWeight: FontWeight.w800,
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
  const _TypePill({required this.isPickup});

  @override
  Widget build(BuildContext context) {
    final fg = AppTheme.mutedColor(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: AppTheme.faintColor(context),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.borderColor(context)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            isPickup
                ? Icons.shopping_bag_rounded
                : Icons.delivery_dining_rounded,
            color: fg,
            size: 15,
          ),
          const SizedBox(width: 8),
          Text(
            isPickup ? 'AVHÄMTNING' : 'LEVERANS',
            style: TextStyle(
              color: fg,
              fontSize: 12,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.0,
            ),
          ),
        ],
      ),
    );
  }
}

/// Liten, lugn live-prick (mjuk opacitets-puls — ingen blurrad glow).
class _LiveDot extends StatefulWidget {
  final Color color;
  const _LiveDot({required this.color});

  @override
  State<_LiveDot> createState() => _LiveDotState();
}

class _LiveDotState extends State<_LiveDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
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
      builder: (_, __) => Opacity(
        opacity: 0.45 + 0.55 * _c.value,
        child: Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: widget.color,
            shape: BoxShape.circle,
          ),
        ),
      ),
    );
  }
}
