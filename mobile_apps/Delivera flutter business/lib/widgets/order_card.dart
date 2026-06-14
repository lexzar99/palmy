import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/order_ui.dart';
import '../core/theme.dart';
import '../models/order_model.dart';
import '../providers/order_provider.dart';

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

/// Kvadratiskt orderkort för den horisontella "nya ordrar"-raden. Färgkodat
/// efter typ (leverans = blå, avhämtning = amber). Hela kortet är tryckbart →
/// öppnar ordern, så ingen "tryck här"-text behövs.
class NewOrderSquareCard extends StatelessWidget {
  final OrderModel order;
  final VoidCallback onTap;

  const NewOrderSquareCard({
    super.key,
    required this.order,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final isPickup = order.type != 'DELIVERY';
    final accent = OrderUi.colorFor(order);
    final typeIcon =
        isPickup ? Icons.shopping_bag_rounded : Icons.delivery_dining_rounded;
    final typeLabel = isPickup ? 'AVHÄMTNING' : 'LEVERANS';

    final base = isDark ? AppTheme.steel : Colors.white;
    final cardBg = Color.alphaBlend(
      accent.withOpacity(isDark ? 0.14 : 0.06),
      base,
    );

    final itemCount = order.items.fold<int>(0, (s, i) => s + i.quantity);
    final totalStr = '${order.total.toStringAsFixed(0)} kr';

    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          width: 172,
          height: 172,
          decoration: BoxDecoration(
            color: cardBg,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: accent.withOpacity(isDark ? 0.45 : 0.30),
              width: 1.3,
            ),
            boxShadow: isDark
                ? const []
                : [
                    BoxShadow(
                      color: AppTheme.ink.withOpacity(0.06),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ],
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 13, 14, 13),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Typ (färgkodad).
                Row(
                  children: [
                    Icon(typeIcon, color: accent, size: 15),
                    const SizedBox(width: 5),
                    Expanded(
                      child: Text(
                        typeLabel,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: accent,
                          fontSize: 10.5,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                // Ordernummer.
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    '#${order.orderNumber}',
                    maxLines: 1,
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w900,
                      height: 1.0,
                      letterSpacing: -0.8,
                      color: isDark ? Colors.white : AppTheme.ink,
                    ),
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  order.customerName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w800,
                    color: isDark ? Colors.white : AppTheme.ink,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '$itemCount art. · ${_minutesAgo(order.createdAt)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.mutedColor(context),
                  ),
                ),
                const Spacer(),
                // Summa + en liten pil som affordance (ingen text).
                Row(
                  children: [
                    Text(
                      totalStr,
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -0.3,
                        color: isDark ? Colors.white : AppTheme.ink,
                      ),
                    ),
                    const Spacer(),
                    Container(
                      width: 28,
                      height: 28,
                      decoration: BoxDecoration(
                        color: accent.withOpacity(isDark ? 0.26 : 0.16),
                        borderRadius: BorderRadius.circular(9),
                      ),
                      child: Icon(
                        Icons.arrow_forward_rounded,
                        size: 16,
                        color: accent,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Kompakt orderkort för den första väntande ordern. Färgkodat efter typ
/// (leverans = blå, avhämtning = amber) och byggt litet så det inte äter upp
/// halva skärmen på en 720p-terminal. Hela kortet är tryckbart → öppnar ordern,
/// så ingen extra "tryck här"-knapp behövs.
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
    // Typ-färg går igenom hela kortet: stripe, pill, kant och en subtil
    // bakgrundston — så leverans/avhämtning syns på en kvarts sekund.
    final accent = OrderUi.colorFor(order);
    final typeIcon =
        isPickup ? Icons.shopping_bag_rounded : Icons.delivery_dining_rounded;
    final typeLabel = isPickup ? 'AVHÄMTNING' : 'LEVERANS';

    final base = isDark ? AppTheme.steel : Colors.white;
    final cardBg = Color.alphaBlend(
      accent.withOpacity(isDark ? 0.12 : 0.05),
      base,
    );

    final itemCount = order.items.fold<int>(0, (s, i) => s + i.quantity);
    final totalStr = '${order.total.toStringAsFixed(0)} kr';

    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onAccept,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          decoration: BoxDecoration(
            color: cardBg,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: accent.withOpacity(isDark ? 0.42 : 0.28),
              width: 1.2,
            ),
            boxShadow: isDark
                ? const []
                : [
                    BoxShadow(
                      color: AppTheme.ink.withOpacity(0.05),
                      blurRadius: 10,
                      offset: const Offset(0, 3),
                    ),
                  ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Typ-färgad stripe i full höjd.
                  Container(width: 6, color: accent),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          // Rad 1: typ-pill + summa.
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 9, vertical: 5),
                                decoration: BoxDecoration(
                                  color:
                                      accent.withOpacity(isDark ? 0.24 : 0.14),
                                  borderRadius: BorderRadius.circular(7),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(typeIcon, color: accent, size: 13),
                                    const SizedBox(width: 5),
                                    Text(
                                      typeLabel,
                                      style: TextStyle(
                                        color: accent,
                                        fontSize: 10.5,
                                        fontWeight: FontWeight.w900,
                                        letterSpacing: 0.6,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const Spacer(),
                              Text(
                                totalStr,
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: -0.3,
                                  color: isDark ? Colors.white : AppTheme.ink,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          // Rad 2: ordernummer (krymper om det blir långt).
                          FittedBox(
                            fit: BoxFit.scaleDown,
                            alignment: Alignment.centerLeft,
                            child: Text(
                              '#${order.orderNumber}',
                              maxLines: 1,
                              style: TextStyle(
                                fontSize: 27,
                                fontWeight: FontWeight.w900,
                                height: 1.0,
                                letterSpacing: -0.8,
                                color: isDark ? Colors.white : AppTheme.ink,
                              ),
                            ),
                          ),
                          const SizedBox(height: 4),
                          // Rad 3: kund · antal · tid.
                          Text(
                            '${order.customerName} · $itemCount art. · ${_minutesAgo(order.createdAt)}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: AppTheme.mutedColor(context),
                            ),
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
    final accent = OrderUi.colorFor(order);
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
    final typeColor = OrderUi.colorFor(order);
    final statusColor = _statusColor(order.status);
    final statusLabel = _statusLabel(order.status);
    final showAdvance = onAdvance != null &&
        (order.status == 'ACCEPTED' || order.status == 'PREPARING');

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
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  // Typ-stripe (färgkodad).
                  Container(
                    width: 5,
                    height: 46,
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
                            Flexible(
                              child: Text(
                                '#${order.orderNumber}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: -0.3,
                                  color: isDark ? Colors.white : AppTheme.ink,
                                ),
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
                            Flexible(
                              child: Text(
                                statusLabel,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w800,
                                  color: statusColor,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${isPickup ? "Avhämtning" : "Leverans"} · ${_relTime(order.createdAt)}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.mutedColor(context),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    '${order.total.toStringAsFixed(0)} kr',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w900,
                      color: isDark ? Colors.white : AppTheme.ink,
                      letterSpacing: -0.2,
                    ),
                  ),
                  if (!showAdvance) ...[
                    const SizedBox(width: 4),
                    Icon(
                      Icons.chevron_right_rounded,
                      size: 22,
                      color: AppTheme.mutedColor(context).withOpacity(0.55),
                    ),
                  ],
                ],
              ),
              // Advance-knapp för accepterade/tillagande ordrar — egen rad i
              // full bredd så den aldrig trängs ihop med nummer/summa. Visas
              // inte för PENDING/READY/terminal.
              if (showAdvance) ...[
                const SizedBox(height: 12),
                Builder(builder: (context) {
                  // Dynamiskt: plattformsleverans → "Klar för hämtning" (READY),
                  // self-leverans → "Maten på väg" (DELIVERING).
                  final selfDelivery = Provider.of<OrderProvider>(context,
                          listen: false)
                      .selfDelivery;
                  final nextStatus =
                      isPickup ? 'READY' : (selfDelivery ? 'DELIVERING' : 'READY');
                  return _AdvanceChip(
                    isPickup: isPickup,
                    selfDelivery: selfDelivery,
                    color: typeColor,
                    onPressed: () => onAdvance!(nextStatus),
                  );
                }),
              ],
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
  final bool selfDelivery;
  final Color color;
  final VoidCallback onPressed;
  const _AdvanceChip(
      {required this.isPickup,
      required this.selfDelivery,
      required this.color,
      required this.onPressed});

  @override
  Widget build(BuildContext context) {
    // Guld bär svart text; blå/lila bär vit text.
    final fg = color == AppTheme.brandGold ? AppTheme.ink : Colors.white;
    // Self-leverans markerar maten "på väg"; allt annat (avhämtning +
    // plattformsleverans) markerar "klar för hämtning".
    final isOnTheWay = !isPickup && selfDelivery;
    final label = isPickup
        ? 'Markera klar'
        : (isOnTheWay ? 'Maten på väg' : 'Klar för hämtning');
    final icon = isOnTheWay
        ? Icons.delivery_dining_rounded
        : Icons.shopping_bag_rounded;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onPressed,
      child: Container(
        width: double.infinity,
        height: 46,
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
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 18, color: fg),
            const SizedBox(width: 8),
            Text(
              label,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w900,
                color: fg,
                letterSpacing: 0.2,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
