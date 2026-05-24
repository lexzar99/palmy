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
  if (_isToday(dt)) return _hhmm(dt);
  if (_isYesterday(dt)) return 'Igår ${_hhmm(dt)}';
  return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')} ${_hhmm(dt)}';
}

String _minutesAgo(DateTime dt) {
  final diff = DateTime.now().difference(dt);
  if (diff.inSeconds < 60) return 'just nu';
  if (diff.inMinutes < 60) return 'för ${diff.inMinutes} min sedan';
  if (diff.inHours < 24) return 'för ${diff.inHours} h sedan';
  return _relTime(dt);
}

/// Stor hero-kort som tar full bredd. Visas i swipable PageView för NYA ORDRAR.
class NewOrderHeroCard extends StatelessWidget {
  final OrderModel order;
  final VoidCallback onAccept;
  final VoidCallback? onDetails;

  const NewOrderHeroCard({
    super.key,
    required this.order,
    required this.onAccept,
    this.onDetails,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final isPickup = order.type != 'DELIVERY';
    final accent = isPickup ? AppTheme.ember : AppTheme.brandBlue;
    final typeIcon =
        isPickup ? Icons.shopping_bag_rounded : Icons.delivery_dining_rounded;
    final typeLabel = isPickup ? 'AVHÄMTNING' : 'LEVERANS';

    final cardBg = isDark ? AppTheme.deepSea : AppTheme.paper;
    final borderC = isDark
        ? Colors.white.withOpacity(0.07)
        : AppTheme.ink.withOpacity(0.07);

    final itemCount = order.items.fold<int>(0, (s, i) => s + i.quantity);
    final totalStr = '${order.total.toStringAsFixed(0)} kr';

    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(24),
      child: InkWell(
        onTap: onAccept,
        borderRadius: BorderRadius.circular(24),
        child: Container(
          decoration: BoxDecoration(
            color: cardBg,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: borderC, width: 1),
            boxShadow: isDark
                ? []
                : [
                    BoxShadow(
                      color: accent.withOpacity(0.10),
                      blurRadius: 24,
                      offset: const Offset(0, 8),
                    ),
                  ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(24),
            child: Stack(
              children: [
                // Decorative wash i hörnet
                Positioned(
                  top: -40,
                  right: -40,
                  child: Container(
                    width: 180,
                    height: 180,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: RadialGradient(
                        colors: [
                          accent.withOpacity(0.18),
                          accent.withOpacity(0),
                        ],
                      ),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(22, 22, 22, 18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: accent.withOpacity(0.14),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(typeIcon, color: accent, size: 14),
                                const SizedBox(width: 6),
                                Text(
                                  typeLabel,
                                  style: TextStyle(
                                    color: accent,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: 0.7,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const Spacer(),
                          _LiveDot(color: accent),
                          const SizedBox(width: 6),
                          Text(
                            'NY',
                            style: TextStyle(
                              color: accent,
                              fontSize: 11,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 1.2,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 18),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            '#',
                            style: TextStyle(
                              fontSize: 32,
                              fontWeight: FontWeight.w700,
                              height: 1.0,
                              color: AppTheme.mutedColor(context),
                            ),
                          ),
                          const SizedBox(width: 2),
                          Flexible(
                            child: FittedBox(
                              fit: BoxFit.scaleDown,
                              alignment: Alignment.bottomLeft,
                              child: Text(
                                order.orderNumber,
                                style: TextStyle(
                                  fontSize: 64,
                                  fontWeight: FontWeight.w900,
                                  height: 0.9,
                                  letterSpacing: -2.5,
                                  color: isDark ? Colors.white : AppTheme.ink,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        order.customerName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          letterSpacing: -0.2,
                          color: isDark ? Colors.white : AppTheme.ink,
                        ),
                      ),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          _MiniStat(
                            icon: Icons.access_time_rounded,
                            label: _minutesAgo(order.createdAt),
                            color: AppTheme.mutedColor(context),
                          ),
                          const SizedBox(width: 18),
                          _MiniStat(
                            icon: Icons.shopping_basket_outlined,
                            label: '$itemCount art.',
                            color: AppTheme.mutedColor(context),
                          ),
                          const Spacer(),
                          Text(
                            totalStr,
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              color: isDark ? Colors.white : AppTheme.ink,
                              letterSpacing: -0.3,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 18),
                      _AcceptBar(accent: accent, onTap: onAccept),
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
      duration: const Duration(milliseconds: 1200),
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
        width: 8,
        height: 8,
        decoration: BoxDecoration(
          color: widget.color,
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: widget.color.withOpacity(0.5 * _c.value),
              blurRadius: 10 * _c.value + 2,
              spreadRadius: 2 * _c.value,
            ),
          ],
        ),
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  const _MiniStat(
      {required this.icon, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: color),
        const SizedBox(width: 5),
        Text(
          label,
          style: TextStyle(
            fontSize: 12.5,
            fontWeight: FontWeight.w600,
            color: color,
          ),
        ),
      ],
    );
  }
}

class _AcceptBar extends StatelessWidget {
  final Color accent;
  final VoidCallback onTap;
  const _AcceptBar({required this.accent, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    return Container(
      height: 60,
      decoration: BoxDecoration(
        color: accent,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: accent.withOpacity(0.36),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: Center(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.bolt_rounded,
                  size: 20,
                  color: isDark ? AppTheme.ink : Colors.white,
                ),
                const SizedBox(width: 8),
                Text(
                  'GÅ TILL ORDER',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.6,
                    color: isDark ? AppTheme.ink : Colors.white,
                  ),
                ),
                const SizedBox(width: 6),
                Icon(
                  Icons.arrow_forward_rounded,
                  size: 18,
                  color: isDark ? AppTheme.ink : Colors.white,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Legacy NewOrderCard – kompakt variant. Inte längre primärt använd
/// men kvar för bakåtkomp om andra skärmar refererar den.
class NewOrderCard extends StatelessWidget {
  final OrderModel order;
  final VoidCallback onTap;
  final double? width;

  const NewOrderCard(
      {super.key, required this.order, required this.onTap, this.width});

  @override
  Widget build(BuildContext context) {
    return NewOrderHeroCard(order: order, onAccept: onTap);
  }
}

/// Tight list-rad för föregående ordrar. Inga boxar, bara label-textuell.
class OrderListTile extends StatelessWidget {
  final OrderModel order;
  final VoidCallback onTap;

  const OrderListTile({super.key, required this.order, required this.onTap});

  static String _statusLabel(String s) {
    switch (s) {
      case 'PENDING':
        return 'Väntar';
      case 'ACCEPTED':
        return 'Accepterad';
      case 'PREPARING':
        return 'Tillagas';
      case 'READY':
        return 'Klar';
      case 'DELIVERING':
        return 'På väg';
      case 'DELIVERED':
      case 'COMPLETED':
        return 'Levererad';
      case 'CANCELLED':
        return 'Avbruten';
      case 'REJECTED':
        return 'Nekad';
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
      case 'DELIVERED':
      case 'COMPLETED':
        return AppTheme.success;
      default:
        return AppTheme.info;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final isPickup = order.type != 'DELIVERY';
    final typeColor = isPickup ? AppTheme.ember : AppTheme.brandBlue;
    final statusColor = _statusColor(order.status);
    final statusLabel = _statusLabel(order.status);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      highlightColor:
          (isDark ? Colors.white : AppTheme.ink).withOpacity(0.03),
      splashColor: (isDark ? Colors.white : AppTheme.ink).withOpacity(0.04),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 14),
        child: Row(
          children: [
            // Type stripe
            Container(
              width: 3,
              height: 32,
              decoration: BoxDecoration(
                color: typeColor,
                borderRadius: BorderRadius.circular(3),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        '#${order.orderNumber}',
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.3,
                          color: isDark ? Colors.white : AppTheme.ink,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Container(
                        width: 4,
                        height: 4,
                        decoration: BoxDecoration(
                          color: statusColor,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        statusLabel,
                        style: TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                          color: statusColor,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${isPickup ? "Avhämtning" : "Leverans"} · ${_relTime(order.createdAt)}',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: AppTheme.mutedColor(context),
                    ),
                  ),
                ],
              ),
            ),
            Text(
              '${order.total.toStringAsFixed(0)} kr',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: isDark ? Colors.white : AppTheme.ink,
                letterSpacing: -0.2,
              ),
            ),
            const SizedBox(width: 8),
            Icon(
              Icons.chevron_right_rounded,
              size: 20,
              color: AppTheme.mutedColor(context).withOpacity(0.55),
            ),
          ],
        ),
      ),
    );
  }
}
