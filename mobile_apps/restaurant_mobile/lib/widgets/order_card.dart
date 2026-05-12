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
  final double? width;

  const NewOrderCard({super.key, required this.order, required this.onTap, this.width});

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final isPickup = order.type != 'DELIVERY';
    final typeColor = isPickup ? AppTheme.gold : AppTheme.brandBlue;
    final typeIcon =
        isPickup ? Icons.shopping_bag_rounded : Icons.delivery_dining_rounded;

    final cardBg = isDark ? AppTheme.deepSea : AppTheme.paper;
    final borderColor = isDark
        ? Colors.white.withOpacity(0.06)
        : AppTheme.ink.withOpacity(0.06);

    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: width ?? 210,
        decoration: BoxDecoration(
          color: cardBg,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: borderColor, width: 1),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 36,
                            height: 36,
                            decoration: BoxDecoration(
                              color: typeColor.withOpacity(0.12),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Icon(typeIcon, color: typeColor, size: 20),
                          ),
                          const Spacer(),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: typeColor,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              'NY',
                              style: TextStyle(
                                color: isPickup ? AppTheme.ink : Colors.white,
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      Text(
                        '#${order.orderNumber}',
                        style: TextStyle(
                          fontSize: 32,
                          fontWeight: FontWeight.w600,
                          letterSpacing: -0.6,
                          height: 1.0,
                          color: isDark ? Colors.white : AppTheme.ink,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        isPickup ? 'avhämtning' : 'leverans',
                        style: TextStyle(
                          color: typeColor,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 0.1,
                        ),
                      ),
                      const Spacer(),
                      Text(
                        _relTime(order.createdAt),
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: AppTheme.mutedColor(context),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Container(height: 3, color: typeColor),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Order list row (PÅGÅENDE ORDER list – inline, no outer card) ──────────────
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
      case 'CANCELLED':
      case 'REJECTED':
        return AppTheme.danger;
      case 'PENDING':
        return AppTheme.warning;
      default:
        return AppTheme.success;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final isPickup = order.type != 'DELIVERY';
    final typeColor = isPickup ? AppTheme.gold : AppTheme.brandBlue;
    final typeIcon =
        isPickup ? Icons.shopping_bag_rounded : Icons.delivery_dining_rounded;
    final statusColor = _statusColor(order.status);
    final statusLabel = _statusLabel(order.status);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      highlightColor:
          (isDark ? Colors.white : AppTheme.ink).withOpacity(0.03),
      splashColor: (isDark ? Colors.white : AppTheme.ink).withOpacity(0.04),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: typeColor.withOpacity(0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(typeIcon, color: typeColor, size: 22),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '#${order.orderNumber}',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      letterSpacing: -0.2,
                      color: isDark ? Colors.white : AppTheme.ink,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _relTime(order.createdAt),
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: AppTheme.mutedColor(context),
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
                      horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: typeColor.withOpacity(0.10),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(
                      color: typeColor.withOpacity(0.20),
                      width: 1,
                    ),
                  ),
                  child: Text(
                    isPickup ? 'AVHÄMTNING' : 'LEVERANS',
                    style: TextStyle(
                      color: typeColor,
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.4,
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  statusLabel,
                  style: TextStyle(
                    color: statusColor,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.3,
                  ),
                ),
              ],
            ),
            const SizedBox(width: 6),
            Icon(
              Icons.chevron_right_rounded,
              size: 20,
              color: AppTheme.mutedColor(context).withOpacity(0.5),
            ),
          ],
        ),
      ),
    );
  }
}
