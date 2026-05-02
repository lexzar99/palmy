import 'package:flutter/material.dart';

import '../core/order_ui.dart';
import '../core/theme.dart';
import '../models/order_model.dart';

// ── New order card (horizontal scroll – NYA ORDER) ────────────────────────────
class NewOrderCard extends StatelessWidget {
  final OrderModel order;
  final VoidCallback onTap;

  const NewOrderCard({super.key, required this.order, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final typeColor = order.type == 'DELIVERY' ? AppTheme.info : AppTheme.gold;
    final typeIcon = order.type == 'DELIVERY'
        ? Icons.delivery_dining_rounded
        : Icons.shopping_bag_rounded;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 150,
        decoration: BoxDecoration(
          color: isDark ? AppTheme.deepSea : Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isDark
                ? Colors.white.withOpacity(0.08)
                : Colors.black.withOpacity(0.07),
            width: 1,
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(isDark ? 0.28 : 0.07),
              blurRadius: 16,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Top row: type icon + NY ORDER badge
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(
                              color: typeColor.withOpacity(0.14),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Icon(typeIcon, color: typeColor, size: 20),
                          ),
                          const Spacer(),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 6, vertical: 3),
                            decoration: BoxDecoration(
                              color: AppTheme.warning,
                              borderRadius: BorderRadius.circular(7),
                            ),
                            child: const Text(
                              'NY ORDER',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 8,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const Spacer(),
                      // Order number
                      Text(
                        '#${order.orderNumber}',
                        style: TextStyle(
                          fontSize: 26,
                          fontWeight: FontWeight.w900,
                          letterSpacing: -0.6,
                          height: 1.0,
                          color: isDark ? Colors.white : AppTheme.ink,
                        ),
                      ),
                      const SizedBox(height: 5),
                      // Type label
                      Text(
                        order.type == 'DELIVERY' ? 'leverans' : 'avhämtning',
                        style: TextStyle(
                          color: typeColor,
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 4),
                      // Time
                      Text(
                        OrderUi.formatTime(order.createdAt),
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: isDark
                              ? Colors.white.withOpacity(0.38)
                              : AppTheme.mutedInk.withOpacity(0.62),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              // Bottom colored accent bar
              Container(height: 4, color: typeColor),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Order list tile (TIDIGARE ORDER list) ─────────────────────────────────────
class OrderListTile extends StatelessWidget {
  final OrderModel order;
  final VoidCallback onTap;

  const OrderListTile({super.key, required this.order, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final typeColor = order.type == 'DELIVERY' ? AppTheme.info : AppTheme.gold;
    final typeIcon = order.type == 'DELIVERY'
        ? Icons.delivery_dining_rounded
        : Icons.shopping_bag_rounded;
    final statusColor = OrderUi.statusColor(order.status);
    final statusLabel = OrderUi.statusLabel(order.status);

    return InkWell(
      onTap: onTap,
      highlightColor:
          (isDark ? Colors.white : AppTheme.ink).withOpacity(0.04),
      splashColor: (isDark ? Colors.white : AppTheme.ink).withOpacity(0.06),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
        child: Row(
          children: [
            // Type icon square
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: typeColor.withOpacity(0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(typeIcon, color: typeColor, size: 22),
            ),
            const SizedBox(width: 12),
            // Order# + time
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '#${order.orderNumber}',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -0.3,
                      color: isDark ? Colors.white : AppTheme.ink,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    OrderUi.formatTime(order.createdAt),
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: isDark
                          ? Colors.white.withOpacity(0.40)
                          : AppTheme.mutedInk,
                    ),
                  ),
                ],
              ),
            ),
            // Type pill + status label
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisSize: MainAxisSize.min,
              children: [
                _TypePill(
                  label:
                      order.type == 'DELIVERY' ? 'LEVERANS' : 'AVHÄMTNING',
                  color: typeColor,
                  isDark: isDark,
                ),
                const SizedBox(height: 4),
                Text(
                  statusLabel,
                  style: TextStyle(
                    color: statusColor,
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.1,
                  ),
                ),
              ],
            ),
            const SizedBox(width: 4),
            Icon(
              Icons.chevron_right_rounded,
              size: 22,
              color: isDark
                  ? Colors.white.withOpacity(0.28)
                  : AppTheme.mutedInk.withOpacity(0.45),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Type pill ─────────────────────────────────────────────────────────────────
class _TypePill extends StatelessWidget {
  final String label;
  final Color color;
  final bool isDark;

  const _TypePill({
    required this.label,
    required this.color,
    required this.isDark,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(isDark ? 0.16 : 0.10),
        borderRadius: BorderRadius.circular(7),
        border: Border.all(
          color: color.withOpacity(isDark ? 0.35 : 0.25),
          width: 1,
        ),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 9,
          fontWeight: FontWeight.w900,
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}
