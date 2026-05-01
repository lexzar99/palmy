import 'package:flutter/material.dart';

import '../core/order_ui.dart';
import '../core/theme.dart';
import '../models/order_model.dart';

/// Compact order card optimised for narrow phones (≥ 320 dp).
///
/// Pending orders pulse with a soft glow + ring so the staff sees them
/// instantly. Tapping opens the order detail / take screen.
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
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    );
    if (widget.pending) _pulse.repeat(reverse: true);
  }

  @override
  void didUpdateWidget(covariant OrderCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.pending && !_pulse.isAnimating) {
      _pulse.repeat(reverse: true);
    } else if (!widget.pending && _pulse.isAnimating) {
      _pulse.stop();
      _pulse.value = 0;
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final order = widget.order;
    final accent = OrderUi.typeColor(order.type);
    final pending = widget.pending;

    return AnimatedBuilder(
      animation: _pulse,
      builder: (context, child) {
        final glow = pending ? 0.20 + _pulse.value * 0.45 : 0.0;
        return Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            boxShadow: pending
                ? [
                    BoxShadow(
                      color: AppTheme.warning.withOpacity(glow),
                      blurRadius: 20 + _pulse.value * 14,
                      spreadRadius: 1,
                    ),
                  ]
                : null,
          ),
          child: child,
        );
      },
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: widget.onTap,
          borderRadius: BorderRadius.circular(20),
          child: Container(
            decoration: BoxDecoration(
              color: AppTheme.panelColor(context),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: pending
                    ? AppTheme.warning.withOpacity(0.45)
                    : accent.withOpacity(0.18),
                width: pending ? 1.6 : 1.2,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Top accent bar
                Container(
                  height: 4,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: pending
                          ? [AppTheme.warning, AppTheme.gold]
                          : [accent, accent.withOpacity(0.6)],
                    ),
                    borderRadius: const BorderRadius.vertical(
                      top: Radius.circular(20),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Row 1: name + total
                      Row(
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
                              style: Theme.of(context)
                                  .textTheme
                                  .titleMedium
                                  ?.copyWith(fontSize: 15.5),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            OrderUi.formatCurrency(order.total),
                            style: Theme.of(context)
                                .textTheme
                                .titleMedium
                                ?.copyWith(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w900,
                                  color: accent,
                                ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      // Row 2: type + #order + scheduled (compact pills)
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          _MicroPill(
                            label: OrderUi.typeLabel(order.type),
                            color: accent,
                            icon: OrderUi.typeIcon(order.type),
                          ),
                          _MicroPill(
                            label: '#${order.orderNumber}',
                            color: AppTheme.lightGold,
                          ),
                          if (order.scheduledFor != null)
                            _MicroPill(
                              label:
                                  '⏰ ${OrderUi.formatTime(order.scheduledFor!)}',
                              color: AppTheme.gold,
                            ),
                          if (pending)
                            _MicroPill(
                              label: 'NY ORDER',
                              color: AppTheme.warning,
                              filled: true,
                            ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      // Items
                      Text(
                        order.items
                            .map((i) => '${i.quantity}× ${i.productName}')
                            .join(' • '),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                      const SizedBox(height: 10),
                      // Footer
                      Row(
                        children: [
                          Text(
                            OrderUi.formatTime(order.createdAt),
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                          const Spacer(),
                          if (pending)
                            _Cta(
                              label: 'Öppna',
                              color: AppTheme.warning,
                              icon: Icons.arrow_forward_rounded,
                              onTap: widget.onTap,
                            )
                          else if (widget.onAction != null)
                            _Cta(
                              label: widget.actionLabel ??
                                  (order.type == 'PICKUP' ? 'Klar' : 'På väg'),
                              color: accent,
                              icon: order.type == 'PICKUP'
                                  ? Icons.shopping_bag_rounded
                                  : Icons.delivery_dining_rounded,
                              onTap: widget.onAction,
                            )
                          else
                            Icon(Icons.chevron_right_rounded, color: accent),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _MicroPill extends StatelessWidget {
  final String label;
  final Color color;
  final IconData? icon;
  final bool filled;

  const _MicroPill({
    required this.label,
    required this.color,
    this.icon,
    this.filled = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: filled ? color : color.withOpacity(0.13),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 11, color: filled ? Colors.white : color),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              color: filled ? Colors.white : color,
              fontSize: 10,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.4,
            ),
          ),
        ],
      ),
    );
  }
}

class _Cta extends StatelessWidget {
  final String label;
  final Color color;
  final IconData icon;
  final VoidCallback? onTap;

  const _Cta({
    required this.label,
    required this.color,
    required this.icon,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w900,
                  fontSize: 12,
                  letterSpacing: 0.4,
                ),
              ),
              const SizedBox(width: 4),
              Icon(icon, size: 14, color: Colors.white),
            ],
          ),
        ),
      ),
    );
  }
}

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
      duration: const Duration(milliseconds: 900),
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
      builder: (context, _) {
        final t = _ctrl.value;
        return SizedBox(
          width: 10,
          height: 10,
          child: Stack(
            alignment: Alignment.center,
            children: [
              Container(
                width: 10 + (t * 6),
                height: 10 + (t * 6),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: widget.color.withOpacity(0.4 - (t * 0.4)),
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
