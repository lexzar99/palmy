import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/order_ui.dart';
import '../core/print_service.dart';
import '../core/theme.dart';
import '../models/order_model.dart';
import '../providers/order_provider.dart';
import 'order_detail_screen.dart';

class HistoryScreen extends StatelessWidget {
  const HistoryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Consumer<OrderProvider>(
        builder: (context, provider, _) {
          final today = provider.todayHistoryOrders;
          final yesterday = provider.yesterdayHistoryOrders;

          return RefreshIndicator(
            onRefresh: () async => provider.refresh(),
            color: AppTheme.ember,
            displacement: 80,
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(
                parent: ClampingScrollPhysics(),
              ),
              slivers: [
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(20, 24, 20, 0),
                  sliver: SliverToBoxAdapter(child: _HeaderTitle()),
                ),
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
                  sliver: SliverToBoxAdapter(
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: _BentoStat(
                            eyebrow: 'IDAG',
                            value: OrderUi.formatCurrency(provider.todayTotal),
                            count: today.length,
                            accent: AppTheme.ember,
                            orders: today,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _BentoStat(
                            eyebrow: 'IGÅR',
                            value: OrderUi.formatCurrency(
                                provider.yesterdayTotal),
                            count: yesterday.length,
                            accent: AppTheme.lavender,
                            orders: yesterday,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                if (today.isEmpty && yesterday.isEmpty)
                  const SliverFillRemaining(
                    hasScrollBody: false,
                    child: _EmptyHistory(),
                  )
                else ...[
                  if (today.isNotEmpty) ...[
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(20, 28, 20, 6),
                      sliver: SliverToBoxAdapter(
                        child: _DayHeader(label: 'Idag', count: today.length),
                      ),
                    ),
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
                      sliver: SliverList.builder(
                        itemCount: today.length,
                        itemBuilder: (context, i) =>
                            _HistoryTile(order: today[i]),
                      ),
                    ),
                  ],
                  if (yesterday.isNotEmpty) ...[
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(20, 24, 20, 6),
                      sliver: SliverToBoxAdapter(
                        child: _DayHeader(
                            label: 'Igår', count: yesterday.length),
                      ),
                    ),
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 140),
                      sliver: SliverList.builder(
                        itemCount: yesterday.length,
                        itemBuilder: (context, i) =>
                            _HistoryTile(order: yesterday[i]),
                      ),
                    ),
                  ] else
                    const SliverToBoxAdapter(child: SizedBox(height: 140)),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _HeaderTitle extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'HISTORIK',
          style: TextStyle(
            color: AppTheme.mutedColor(context),
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.4,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Senaste dagarna',
          style: TextStyle(
            fontSize: 30,
            fontWeight: FontWeight.w900,
            height: 1.0,
            letterSpacing: -1.0,
            color: isDark ? Colors.white : AppTheme.ink,
          ),
        ),
      ],
    );
  }
}

class _BentoStat extends StatelessWidget {
  final String eyebrow;
  final String value;
  final int count;
  final Color accent;
  final List<OrderModel> orders;

  const _BentoStat({
    required this.eyebrow,
    required this.value,
    required this.count,
    required this.accent,
    required this.orders,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.panelColor(context),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: AppTheme.borderColor(context)),
        boxShadow: isDark
            ? []
            : [
                BoxShadow(
                  color: accent.withOpacity(0.07),
                  blurRadius: 18,
                  offset: const Offset(0, 6),
                ),
              ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: accent,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 6),
              Text(
                eyebrow,
                style: TextStyle(
                  color: accent,
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.2,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              style: TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.w900,
                letterSpacing: -0.5,
                color: isDark ? Colors.white : AppTheme.ink,
                height: 1.0,
              ),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '$count ${count == 1 ? "order" : "ordrar"}',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: AppTheme.mutedColor(context),
            ),
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 28,
            child: _Sparkline(orders: orders, accent: accent),
          ),
        ],
      ),
    );
  }
}

class _Sparkline extends StatelessWidget {
  final List<OrderModel> orders;
  final Color accent;

  const _Sparkline({required this.orders, required this.accent});

  @override
  Widget build(BuildContext context) {
    if (orders.isEmpty) {
      return Center(
        child: Text(
          '—',
          style: TextStyle(
            color: AppTheme.mutedColor(context).withOpacity(0.5),
            fontSize: 16,
            fontWeight: FontWeight.w900,
          ),
        ),
      );
    }

    final buckets = List<int>.filled(24, 0);
    for (final o in orders) {
      buckets[o.createdAt.hour] += 1;
    }
    final maxV = buckets.reduce((a, b) => a > b ? a : b);

    return LayoutBuilder(
      builder: (context, constraints) {
        final w = constraints.maxWidth;
        return CustomPaint(
          size: Size(w, 28),
          painter: _SparkPainter(
            buckets: buckets,
            maxV: maxV == 0 ? 1 : maxV,
            color: accent,
          ),
        );
      },
    );
  }
}

class _SparkPainter extends CustomPainter {
  final List<int> buckets;
  final int maxV;
  final Color color;

  _SparkPainter({
    required this.buckets,
    required this.maxV,
    required this.color,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color.withOpacity(0.85)
      ..strokeWidth = 2.2
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;

    final fillPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [color.withOpacity(0.22), color.withOpacity(0)],
      ).createShader(Rect.fromLTWH(0, 0, size.width, size.height));

    final path = Path();
    final fillPath = Path();
    final step = size.width / (buckets.length - 1);
    for (var i = 0; i < buckets.length; i++) {
      final x = i * step;
      final ratio = buckets[i] / maxV;
      final y = size.height - (size.height - 4) * ratio - 2;
      if (i == 0) {
        path.moveTo(x, y);
        fillPath.moveTo(x, size.height);
        fillPath.lineTo(x, y);
      } else {
        path.lineTo(x, y);
        fillPath.lineTo(x, y);
      }
    }
    fillPath.lineTo(size.width, size.height);
    fillPath.close();
    canvas.drawPath(fillPath, fillPaint);
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _SparkPainter old) =>
      old.buckets != buckets || old.maxV != maxV || old.color != color;
}

class _DayHeader extends StatelessWidget {
  final String label;
  final int count;
  const _DayHeader({required this.label, required this.count});

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.5,
            color: isDark ? Colors.white : AppTheme.ink,
          ),
        ),
        const SizedBox(width: 10),
        Padding(
          padding: const EdgeInsets.only(bottom: 5),
          child: Text(
            '$count',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: AppTheme.mutedColor(context),
            ),
          ),
        ),
      ],
    );
  }
}

class _HistoryTile extends StatelessWidget {
  final OrderModel order;

  const _HistoryTile({required this.order});

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final accent = OrderUi.typeColor(order.type);
    final statusColor = OrderUi.statusColor(order.status);

    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) => OrderDetailScreen(order: order),
            ),
          );
        },
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 14),
          child: Row(
            children: [
              Container(
                width: 3,
                height: 38,
                decoration: BoxDecoration(
                  color: accent,
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
                          OrderUi.statusLabel(order.status),
                          style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                            color: statusColor,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(
                      '${order.customerName} · ${OrderUi.formatTime(order.createdAt)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.mutedColor(context),
                      ),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    OrderUi.formatCurrency(order.total),
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: isDark ? Colors.white : AppTheme.ink,
                      letterSpacing: -0.2,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Material(
                    color: Colors.transparent,
                    borderRadius: BorderRadius.circular(8),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(8),
                      onTap: () => PrintService.printReceipt(order),
                      child: Padding(
                        padding: const EdgeInsets.all(4),
                        child: Icon(
                          Icons.print_outlined,
                          size: 18,
                          color: AppTheme.mutedColor(context),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyHistory extends StatelessWidget {
  const _EmptyHistory();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: AppTheme.faintColor(context),
              borderRadius: BorderRadius.circular(24),
            ),
            child: Icon(
              Icons.history_toggle_off_rounded,
              color: AppTheme.mutedColor(context),
              size: 32,
            ),
          ),
          const SizedBox(height: 18),
          Text(
            'Ingen historik',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 6),
          Text(
            'När ni levererat era första ordrar dyker de upp här.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ],
      ),
    );
  }
}
