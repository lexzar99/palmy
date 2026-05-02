import 'package:flutter/material.dart';

import '../core/theme.dart';
import '../models/order_model.dart';

String _hhmm(DateTime dt) =>
    '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';

bool _isToday(DateTime dt) {
  final now = DateTime.now();
  return dt.year == now.year && dt.month == now.month && dt.day == now.day;
}

bool _isYesterday(DateTime dt) {
  final y = DateTime.now().subtract(const Duration(days: 1));
  return dt.year == y.year && dt.month == y.month && dt.day == y.day;
}

String _relTime(DateTime dt) {
  if (_isToday(dt)) return 'Idag ${_hhmm(dt)}';
  if (_isYesterday(dt)) return 'Igår ${_hhmm(dt)}';
  return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')} ${_hhmm(dt)}';
}

// ── New order card (horizontal scroll – NYA ORDER) ────────────────────────────
class NewOrderCard extends StatelessWidget {
  final OrderModel order;
  final VoidCallback onTap;

  const NewOrderCard({super.key, required this.order, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final isPickup = order.type != 'DELIVERY';
    final typeColor = isPickup ? AppTheme.brandGold : AppTheme.brandBlue;
    final tintBg = isPickup ? AppTheme.creamBg : AppTheme.blueTint;
    final iconBg = isPickup ? AppTheme.creamPill : AppTheme.blueTintPill;
    final typeIcon =
        isPickup ? Icons.shopping_bag_rounded : Icons.delivery_dining_rounded;

    final cardBg = isDark
        ? AppTheme.deepSea
        : (isPickup ? tintBg : Colors.white);

    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 168,
        decoration: BoxDecoration(
          color: cardBg,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: isDark
                ? Colors.white.withOpacity(0.08)
                : Colors.black.withOpacity(0.05),
            width: 1,
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(isDark ? 0.28 : 0.045),
              blurRadius: 14,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Top row: type icon square + NY ORDER pill
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 46,
                            height: 46,
                            decoration: BoxDecoration(
                              color: iconBg,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Icon(typeIcon, color: typeColor, size: 22),
                          ),
                          const Spacer(),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: typeColor,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Text(
                              'NY ORDER',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 9,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Text(
                        '#${order.orderNumber}',
                        style: TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.w900,
                          letterSpacing: -0.8,
                          height: 1.0,
                          color: isDark ? Colors.white : AppTheme.ink,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        isPickup ? 'avhämtning' : 'leverans',
                        style: TextStyle(
                          color: typeColor,
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const Spacer(),
                      Text(
                        _relTime(order.createdAt),
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: isDark
                              ? Colors.white.withOpacity(0.40)
                              : AppTheme.mutedInk.withOpacity(0.65),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Container(height: 4, color: typeColor),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Order list tile (PÅGÅENDE ORDER list) ─────────────────────────────────────
class OrderListTile extends StatelessWidget {
  final OrderModel order;
  final VoidCallback onTap;

  const OrderListTile({super.key, required this.order, required this.onTap});

  static String _statusLabel(String s) {
    switch (s) {
      case 'PENDING':
        return 'VÄNTAR';
      case 'ACCEPTED':
        return 'ACCEPTERAD';
      case 'PREPARING':
        return 'TILLAGAS';
      case 'READY':
        return 'KLAR';
      case 'DELIVERING':
        return 'PÅ VÄG';
      case 'DELIVERED':
      case 'COMPLETED':
        return 'LEVERERAD';
      case 'CANCELLED':
        return 'AVBRUTEN';
      case 'REJECTED':
        return 'NEKAD';
      default:
        return s;
    }
  }

  static Color _statusColor(String s) {
    switch (s) {
      case 'ACCEPTED':
      case 'PREPARING':
        return AppTheme.success;
      case 'READY':
      case 'DELIVERING':
      case 'DELIVERED':
      case 'COMPLETED':
        return AppTheme.success;
      case 'CANCELLED':
      case 'REJECTED':
        return AppTheme.danger;
      default:
        return AppTheme.brandGold;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final isPickup = order.type != 'DELIVERY';
    final typeColor = isPickup ? AppTheme.brandGold : AppTheme.brandBlue;
    final iconBg = isPickup ? AppTheme.creamPill : AppTheme.blueTintPill;
    final pillBg = isPickup ? AppTheme.creamPill : AppTheme.blueTintPill;
    final typeIcon =
        isPickup ? Icons.shopping_bag_rounded : Icons.delivery_dining_rounded;
    final statusColor = _statusColor(order.status);
    final statusLabel = _statusLabel(order.status);

    return InkWell(
      onTap: onTap,
      highlightColor:
          (isDark ? Colors.white : AppTheme.ink).withOpacity(0.04),
      splashColor: (isDark ? Colors.white : AppTheme.ink).withOpacity(0.05),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: iconBg,
                borderRadius: BorderRadius.circular(13),
              ),
              child: Icon(typeIcon, color: typeColor, size: 24),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '#${order.orderNumber}',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -0.3,
                      color: isDark ? Colors.white : AppTheme.ink,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _relTime(order.createdAt),
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: isDark
                          ? Colors.white.withOpacity(0.40)
                          : AppTheme.mutedInk.withOpacity(0.85),
                    ),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: pillBg,
                    borderRadius: BorderRadius.circular(9),
                  ),
                  child: Text(
                    isPickup ? 'AVHÄMTNING' : 'LEVERANS',
                    style: TextStyle(
                      color: typeColor,
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.4,
                    ),
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  statusLabel,
                  style: TextStyle(
                    color: statusColor,
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.3,
                  ),
                ),
              ],
            ),
            const SizedBox(width: 8),
            Icon(
              Icons.chevron_right_rounded,
              size: 22,
              color: isDark
                  ? Colors.white.withOpacity(0.28)
                  : AppTheme.mutedInk.withOpacity(0.50),
            ),
          ],
        ),
      ),
    );
  }
}
