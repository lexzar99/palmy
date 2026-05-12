import 'package:animate_do/animate_do.dart';
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
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: Consumer<OrderProvider>(
          builder: (context, provider, _) {
            final todayOrders = provider.todayHistoryOrders;
            final yesterdayOrders = provider.yesterdayHistoryOrders;

            return Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Historik',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontSize: 26,
                          letterSpacing: -0.6,
                        ),
                  ),
                  const SizedBox(height: 14),
                  // Compact dual-day summary in a row of two equal cards
                  Row(
                    children: [
                      Expanded(
                        child: _DaySummary(
                          eyebrow: 'IDAG',
                          value:
                              OrderUi.formatCurrency(provider.todayTotal),
                          sub: '${todayOrders.length} ordrar',
                          accent: AppTheme.gold,
                          icon: Icons.today_rounded,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _DaySummary(
                          eyebrow: 'IGÅR',
                          value: OrderUi.formatCurrency(
                              provider.yesterdayTotal),
                          sub: '${yesterdayOrders.length} ordrar',
                          accent: AppTheme.lavender,
                          icon: Icons.event_repeat_rounded,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: AppTheme.faintColor(context),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const TabBar(
                      indicator: BoxDecoration(),
                      labelPadding: EdgeInsets.symmetric(vertical: 4),
                      tabs: [
                        Tab(text: 'Idag'),
                        Tab(text: 'Igår'),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Expanded(
                    child: TabBarView(
                      children: [
                        _HistoryList(orders: todayOrders),
                        _HistoryList(orders: yesterdayOrders),
                      ],
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _DaySummary extends StatelessWidget {
  final String eyebrow;
  final String value;
  final String sub;
  final Color accent;
  final IconData icon;

  const _DaySummary({
    required this.eyebrow,
    required this.value,
    required this.sub,
    required this.accent,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.panelColor(context),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: accent.withOpacity(0.18)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 26,
                height: 26,
                decoration: BoxDecoration(
                  color: accent.withOpacity(0.16),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(icon, color: accent, size: 14),
              ),
              const SizedBox(width: 6),
              Text(
                eyebrow,
                style: TextStyle(
                  color: accent,
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 1.2,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w600,
                letterSpacing: -0.4,
              ),
            ),
          ),
          const SizedBox(height: 2),
          Text(
            sub,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: AppTheme.mutedColor(context),
            ),
          ),
        ],
      ),
    );
  }
}

class _HistoryList extends StatelessWidget {
  final List<OrderModel> orders;

  const _HistoryList({required this.orders});

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: () async =>
          Provider.of<OrderProvider>(context, listen: false).refresh(),
      child: orders.isEmpty
          ? ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                const SizedBox(height: 60),
                Center(
                  child: Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      color: AppTheme.faintColor(context),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(
                      Icons.history_toggle_off_rounded,
                      color: AppTheme.mutedColor(context),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Center(
                  child: Text(
                    'Ingen historik',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
              ],
            )
          : ListView.separated(
              physics: const BouncingScrollPhysics(
                parent: AlwaysScrollableScrollPhysics(),
              ),
              padding: const EdgeInsets.only(bottom: 24, top: 4),
              itemCount: orders.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, index) => FadeInUp(
                duration: Duration(milliseconds: 200 + (index * 30)),
                child: _HistoryCard(order: orders[index]),
              ),
            ),
    );
  }
}

class _HistoryCard extends StatelessWidget {
  final OrderModel order;

  const _HistoryCard({required this.order});

  @override
  Widget build(BuildContext context) {
    final accent = OrderUi.typeColor(order.type);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () {
          Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => OrderDetailScreen(order: order)),
          );
        },
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
          decoration: BoxDecoration(
            color: AppTheme.panelColor(context),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: accent.withOpacity(0.16)),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: accent.withOpacity(0.14),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(OrderUi.typeIcon(order.type),
                    color: accent, size: 18),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            order.customerName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        Text(
                          '#${order.orderNumber}',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.mutedColor(context),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      order.items
                          .map((i) => '${i.quantity}× ${i.productName}')
                          .join(' • '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.mutedColor(context),
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      OrderUi.formatTime(order.createdAt),
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.mutedColor(context),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    OrderUi.formatCurrency(order.total),
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: accent,
                    ),
                  ),
                  const SizedBox(height: 4),
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    padding: EdgeInsets.zero,
                    constraints:
                        const BoxConstraints(minWidth: 32, minHeight: 32),
                    onPressed: () => PrintService.printReceipt(order),
                    icon: Icon(
                      Icons.print_outlined,
                      size: 18,
                      color: AppTheme.mutedColor(context),
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
