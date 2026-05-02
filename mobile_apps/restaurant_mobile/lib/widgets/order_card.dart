import 'package:flutter/material.dart';

import '../core/order_ui.dart';
import '../core/theme.dart';
import '../models/order_model.dart';

class OrderCard extends StatefulWidget {
  final OrderModel order;
  final bool pending;
  final VoidCallback? onAction;
  final VoidCallback? onTap;
  final String? actionLabel;

  const OrderCard({
    super.key,
    required this.order,
    required this.pending,
    this.onAction,
    this.onTap,
    this.actionLabel,
  });

  @override
  State<OrderCard> createState() => _OrderCardState();
}

class _OrderCardState extends State<OrderCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _glow;

  @override
  void initState() {
    super.initState();
    _glow = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    );
    if (widget.pending) _glow.repeat(reverse: true);
  }

  @override
  void didUpdateWidget(covariant OrderCard old) {
    super.didUpdateWidget(old);
    if (widget.pending && !_glow.isAnimating) {
      _glow.repeat(reverse: true);
    } else if (!widget.pending && _glow.isAnimating) {
      _glow.stop();
      _glow.value = 0;
    }
  }

  @override
  void dispose() {
    _glow.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final order = widget.order;
    final pending = widget.pending;
    final accent = OrderUi.typeColor(order.type);
    final barColor = pending ? AppTheme.warning : accent;
    final isDark = AppTheme.isDark(context);

    return AnimatedBuilder(
      animation: _glow,
      builder: (context, child) {
        final glowOpacity = pending ? (0.12 + _glow.value * 0.18) : 0.0;
        return Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            boxShadow: pending
                ? [
                    BoxShadow(
                      color: AppTheme.warning.withOpacity(glowOpacity),
                      blurRadius: 18 + _glow.value * 10,
                      spreadRadius: 0,
                    ),
                  ]
                : [
                    BoxShadow(
                      color: Colors.black
                          .withOpacity(isDark ? 0.22 : 0.06),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ],
          ),
          child: child,
        );
      },
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: widget.onTap,
          borderRadius: BorderRadius.circular(16),
          splashColor: barColor.withOpacity(0.08),
          highlightColor: barColor.withOpacity(0.04),
          child: Container(
            decoration: BoxDecoration(
              color: pending
                  ? (isDark
                      ? AppTheme.warning.withOpacity(0.08)
                      : AppTheme.warning.withOpacity(0.05))
                  : (isDark
                      ? const Color(0xFF16233D)
                      : Colors.white),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: pending
                    ? AppTheme.warning.withOpacity(isDark ? 0.50 : 0.45)
                    : (isDark
                        ? accent.withOpacity(0.22)
                        : AppTheme.ink.withOpacity(0.12)),
                width: 1.4,
              ),
            ),
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Left accent bar
                  Container(
                    width: 5,
                    decoration: BoxDecoration(
                      color: barColor,
                      borderRadius: const BorderRadius.horizontal(
                        left: Radius.circular(15),
                      ),
                    ),
                  ),
                  // Content
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(14, 13, 12, 13),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Row 1: name + price
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.center,
                            children: [
                              if (pending) ...[
                                _LiveDot(color: AppTheme.warning),
                                const SizedBox(width: 8),
                              ],
                              Expanded(
                                child: Text(
                                  order.customerName,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: -0.3,
                                    color: isDark
                                        ? Colors.white
                                        : AppTheme.ink,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                OrderUi.formatCurrency(order.total),
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w900,
                                  color: barColor,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          // Items
                          Text(
                            order.items
                                .map((i) => '${i.quantity}× ${i.productName}')
                                .join(' · '),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: isDark
                                  ? Colors.white.withOpacity(0.62)
                                  : AppTheme.ink.withOpacity(0.55),
                              height: 1.35,
                            ),
                          ),
                          const SizedBox(height: 11),
                          // Footer row
                          Row(
                            children: [
                              _TypeChip(
                                label: OrderUi.typeLabel(order.type),
                                icon: OrderUi.typeIcon(order.type),
                                color: accent,
                                isDark: isDark,
                              ),
                              const SizedBox(width: 6),
                              Text(
                                OrderUi.formatTime(order.createdAt),
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: isDark
                                      ? Colors.white.withOpacity(0.40)
                                      : AppTheme.ink.withOpacity(0.35),
                                ),
                              ),
                              if (order.scheduledFor != null) ...[
                                const SizedBox(width: 6),
                                _TypeChip(
                                  label: OrderUi.formatTime(order.scheduledFor!),
                                  icon: Icons.schedule_rounded,
                                  color: AppTheme.gold,
                                  isDark: isDark,
                                ),
                              ],
                              const Spacer(),
                              if (pending)
                                _ActionBtn(
                                  label: 'Öppna',
                                  color: AppTheme.warning,
                                  icon: Icons.arrow_forward_rounded,
                                  onTap: widget.onTap,
                                )
                              else if (widget.onAction != null)
                                _ActionBtn(
                                  label: widget.actionLabel ??
                                      (order.type == 'PICKUP'
                                          ? 'Klar'
                                          : 'På väg'),
                                  color: accent,
                                  icon: order.type == 'PICKUP'
                                      ? Icons.shopping_bag_rounded
                                      : Icons.delivery_dining_rounded,
                                  onTap: widget.onAction,
                                ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ── Type chip ─────────────────────────────────────────────────────────────────
class _TypeChip extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final bool isDark;

  const _TypeChip({
    required this.label,
    required this.icon,
    required this.color,
    required this.isDark,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(isDark ? 0.16 : 0.10),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 11, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 11,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.2,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Action button ─────────────────────────────────────────────────────────────
class _ActionBtn extends StatelessWidget {
  final String label;
  final Color color;
  final IconData icon;
  final VoidCallback? onTap;

  const _ActionBtn({
    required this.label,
    required this.color,
    required this.icon,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w900,
                fontSize: 12,
                letterSpacing: 0.3,
              ),
            ),
            const SizedBox(width: 5),
            Icon(icon, size: 13, color: Colors.white),
          ],
        ),
      ),
    );
  }
}

// ── Live dot (smooth ease, no bounce) ─────────────────────────────────────────
class _LiveDot extends StatefulWidget {
  final Color color;
  const _LiveDot({required this.color});

  @override
  State<_LiveDot> createState() => _LiveDotState();
}

class _LiveDotState extends State<_LiveDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (_, __) {
        final t = Curves.easeInOut.transform(_ctrl.value);
        return SizedBox(
          width: 12,
          height: 12,
          child: Stack(
            alignment: Alignment.center,
            children: [
              Container(
                width: 12 + t * 4,
                height: 12 + t * 4,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: widget.color.withOpacity(0.35 - t * 0.35),
                ),
              ),
              Container(
                width: 7,
                height: 7,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: widget.color,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
