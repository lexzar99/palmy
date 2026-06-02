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

/// Primärt orderkort. Hög kontrast och tät information för restaurangterminal.
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

    final cardBg = isDark ? AppTheme.steel : Colors.white;
    final borderC =
        isDark ? accent.withOpacity(0.32) : AppTheme.ink.withOpacity(0.11);

    final itemCount = order.items.fold<int>(0, (s, i) => s + i.quantity);
    final totalStr = '${order.total.toStringAsFixed(0)} kr';

    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onAccept,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          constraints: const BoxConstraints(minHeight: 260),
          decoration: BoxDecoration(
            color: cardBg,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: borderC, width: 1.2),
            boxShadow: isDark
                ? [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.24),
                      blurRadius: 16,
                      offset: const Offset(0, 6),
                    ),
                  ]
                : [
                    BoxShadow(
                      color: AppTheme.ink.withOpacity(0.08),
                      blurRadius: 18,
                      offset: const Offset(0, 6),
                    ),
                  ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: Stack(
              children: [
                Positioned(
                  top: 0,
                  left: 0,
                  bottom: 0,
                  child: Container(
                    width: 7,
                    color: accent,
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(22, 20, 18, 18),
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
                              borderRadius: BorderRadius.circular(8),
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
                                  fontSize: 78,
                                  fontWeight: FontWeight.w900,
                                  height: 0.9,
                                  letterSpacing: -1.2,
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
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
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
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 12,
                        ),
                        decoration: BoxDecoration(
                          color: accent.withOpacity(isDark ? 0.18 : 0.12),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: accent.withOpacity(isDark ? 0.34 : 0.24),
                          ),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              Icons.touch_app_rounded,
                              size: 18,
                              color: accent,
                            ),
                            const SizedBox(width: 9),
                            Expanded(
                              child: Text(
                                'Tryck på kortet för att öppna ordern',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: accent,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: 0,
                                ),
                              ),
                            ),
                            Icon(
                              Icons.arrow_forward_rounded,
                              size: 18,
                              color: accent,
                            ),
                          ],
                        ),
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

class NewOrderQueueTile extends StatelessWidget {
  final OrderModel order;
  final VoidCallback onTap;

  const NewOrderQueueTile({
    super.key,
    required this.order,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final isPickup = order.type != 'DELIVERY';
    final accent = isPickup ? AppTheme.ember : AppTheme.brandBlue;
    final itemCount = order.items.fold<int>(0, (s, i) => s + i.quantity);

    return Material(
      color: isDark ? AppTheme.deepSea : Colors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppTheme.borderColor(context)),
          ),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: accent.withOpacity(0.14),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  '#${order.orderNumber}',
                  maxLines: 1,
                  style: TextStyle(
                    color: accent,
                    fontSize: 13,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      order.customerName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: isDark ? Colors.white : AppTheme.ink,
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${isPickup ? "Avhämtning" : "Leverans"} · ${_minutesAgo(order.createdAt)} · $itemCount art.',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: AppTheme.mutedColor(context),
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Text(
                '${order.total.toStringAsFixed(0)} kr',
                style: TextStyle(
                  color: isDark ? Colors.white : AppTheme.ink,
                  fontSize: 14,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(width: 4),
              Icon(
                Icons.chevron_right_rounded,
                size: 20,
                color: AppTheme.mutedColor(context),
              ),
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
///
/// När restaurangen redan har accepterat ordern (status: ACCEPTED/PREPARING)
/// och `onAdvance` finns, visar vi en inline-pill-knapp till höger:
///   • DELIVERY → "På väg" → status DELIVERING
///   • PICKUP   → "Klar"   → status READY
/// Slipper kunden klicka in på detail-skärmen bara för att markera nästa
/// steg. onAdvance får vidare-status som argument så dashboarden kan
/// trigga updateStatus(orderId, nextStatus) direkt.
class OrderListTile extends StatelessWidget {
  final OrderModel order;
  final VoidCallback onTap;
  final ValueChanged<String>? onAdvance;

  const OrderListTile({
    super.key,
    required this.order,
    required this.onTap,
    this.onAdvance,
  });

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

    return Material(
      color: isDark ? AppTheme.deepSea : Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        highlightColor:
            (isDark ? Colors.white : AppTheme.ink).withOpacity(0.03),
        splashColor: (isDark ? Colors.white : AppTheme.ink).withOpacity(0.04),
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 14, 12, 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppTheme.borderColor(context)),
            boxShadow: isDark
                ? const []
                : [
                    BoxShadow(
                      color: AppTheme.ink.withOpacity(0.04),
                      blurRadius: 10,
                      offset: const Offset(0, 3),
                    ),
                  ],
          ),
          child: Row(
            children: [
              // Type stripe
              Container(
                width: 5,
                height: 52,
                decoration: BoxDecoration(
                  color: typeColor,
                  borderRadius: BorderRadius.circular(5),
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
                            fontSize: 21,
                            fontWeight: FontWeight.w900,
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
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            color: statusColor,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${isPickup ? "Avhämtning" : "Leverans"} · ${_relTime(order.createdAt)}',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.mutedColor(context),
                      ),
                    ),
                  ],
                ),
              ),
              Text(
                '${order.total.toStringAsFixed(0)} kr',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w900,
                  color: isDark ? Colors.white : AppTheme.ink,
                  letterSpacing: -0.2,
                ),
              ),
              const SizedBox(width: 10),
              // Inline advance-knapp för accepterade/tillagande ordrar — så
              // restaurangen kan markera "På väg"/"Klar" utan att klicka in på
              // detail-skärmen. Visas inte för PENDING (hanteras separat med
              // accept-flow), inte heller för READY/DELIVERING/terminal.
              if (onAdvance != null &&
                  (order.status == 'ACCEPTED' || order.status == 'PREPARING'))
                _AdvanceChip(
                  isPickup: isPickup,
                  onPressed: () =>
                      onAdvance!(isPickup ? 'READY' : 'DELIVERING'),
                )
              else
                Icon(
                  Icons.chevron_right_rounded,
                  size: 22,
                  color: AppTheme.mutedColor(context).withOpacity(0.55),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Liten advance-pill för OrderListTile — "På väg" (delivery) / "Klar" (pickup).
/// Stoppar event-propagation så klick på pill:en INTE öppnar detail-skärmen.
class _AdvanceChip extends StatelessWidget {
  final bool isPickup;
  final VoidCallback onPressed;
  const _AdvanceChip({required this.isPickup, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    final color = isPickup ? AppTheme.ember : AppTheme.brandBlue;
    final label = isPickup ? 'Markera klar' : 'Maten på väg';
    final icon =
        isPickup ? Icons.shopping_bag_rounded : Icons.delivery_dining_rounded;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onPressed,
      child: Container(
        constraints: const BoxConstraints(minHeight: 48),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(12),
          boxShadow: [
            BoxShadow(
              color: color.withOpacity(0.24),
              blurRadius: 10,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 17, color: AppTheme.ink),
            const SizedBox(width: 7),
            Text(
              label,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w900,
                color: AppTheme.ink,
                letterSpacing: 0,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
