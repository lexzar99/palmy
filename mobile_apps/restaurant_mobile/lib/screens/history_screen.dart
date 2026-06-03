import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/order_ui.dart';
import '../core/print_service.dart';
import '../core/theme.dart';
import '../models/order_model.dart';
import '../providers/order_provider.dart';
import 'order_detail_screen.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  bool _showToday = true;

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final ink = isDark ? Colors.white : AppTheme.ink;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Consumer<OrderProvider>(
        builder: (context, provider, _) {
          final orders = _showToday
              ? provider.todayHistoryOrders
              : provider.yesterdayHistoryOrders;
          final total =
              _showToday ? provider.todayTotal : provider.yesterdayTotal;

          return RefreshIndicator(
            onRefresh: () async => provider.refresh(),
            color: ink,
            displacement: 80,
            child: CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(
                parent: ClampingScrollPhysics(),
              ),
              slivers: [
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(24, 24, 24, 0),
                  sliver: SliverToBoxAdapter(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'HISTORIK',
                          style: TextStyle(
                            color: AppTheme.mutedColor(context),
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1.4,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'Senaste dagarna',
                          style: TextStyle(
                            fontSize: 28,
                            fontWeight: FontWeight.w900,
                            height: 1.0,
                            letterSpacing: -1.0,
                            color: ink,
                          ),
                        ),
                        const SizedBox(height: 18),
                        // Idag / Igår-väljare (monokrom segment-kontroll).
                        _DayToggle(
                          showToday: _showToday,
                          onChanged: (v) => setState(() => _showToday = v),
                        ),
                        const SizedBox(height: 14),
                        // Liten omsättnings-rad.
                        _RevenueRow(
                          label: _showToday ? 'Omsättning idag' : 'Omsättning igår',
                          value: OrderUi.formatCurrency(total),
                          count: orders.length,
                        ),
                        const SizedBox(height: 8),
                      ],
                    ),
                  ),
                ),
                if (orders.isEmpty)
                  const SliverFillRemaining(
                    hasScrollBody: false,
                    child: _EmptyHistory(),
                  )
                else
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(24, 6, 24, 140),
                    sliver: SliverList.builder(
                      itemCount: orders.length,
                      itemBuilder: (context, i) => _HistoryTile(order: orders[i]),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _DayToggle extends StatelessWidget {
  final bool showToday;
  final ValueChanged<bool> onChanged;
  const _DayToggle({required this.showToday, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final ink = isDark ? Colors.white : AppTheme.ink;
    final fg = isDark ? AppTheme.ink : Colors.white;
    final muted = AppTheme.mutedColor(context);

    Widget seg(String label, bool isToday) {
      final selected = showToday == isToday;
      return Expanded(
        child: GestureDetector(
          onTap: () => onChanged(isToday),
          behavior: HitTestBehavior.opaque,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              color: selected ? ink : Colors.transparent,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Center(
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                  color: selected ? fg : muted,
                ),
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.borderColor(context)),
      ),
      child: Row(children: [seg('Idag', true), seg('Igår', false)]),
    );
  }
}

class _RevenueRow extends StatelessWidget {
  final String label;
  final String value;
  final int count;
  const _RevenueRow({
    required this.label,
    required this.value,
    required this.count,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final ink = isDark ? Colors.white : AppTheme.ink;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.borderColor(context)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Text(
              label.toUpperCase(),
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                letterSpacing: 1.0,
                color: AppTheme.mutedColor(context),
              ),
            ),
          ),
          Text(
            '$count ${count == 1 ? "order" : "ordrar"}',
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w600,
              color: AppTheme.mutedColor(context),
            ),
          ),
          const SizedBox(width: 14),
          Text(
            value,
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w900,
              letterSpacing: -0.4,
              color: ink,
            ),
          ),
        ],
      ),
    );
  }
}

class _HistoryTile extends StatelessWidget {
  final OrderModel order;

  const _HistoryTile({required this.order});

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final accent = OrderUi.colorFor(order);
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
                        // Avbruten/återbetald visas enbart som statusen
                        // ("Avbruten") — ingen pill, inget belopp, ingen
                        // delvis/hel-info (medvetet förenklat per önskemål).
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
          Icon(
            Icons.history_toggle_off_rounded,
            color: AppTheme.mutedColor(context),
            size: 32,
          ),
          const SizedBox(height: 16),
          Text(
            'Inga ordrar',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 6),
          Text(
            'Ordrar du markerat klar/på väg dyker upp här.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ],
      ),
    );
  }
}
