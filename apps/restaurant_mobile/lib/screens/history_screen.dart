import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../models/order_model.dart';
import '../providers/order_provider.dart';
import '../core/theme.dart';
import 'order_detail_screen.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppTheme.charcoal,
        elevation: 0,
        title: const Text('ORDERHISTORIK',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, letterSpacing: 2)),
      ),
      body: Consumer<OrderProvider>(
        builder: (context, provider, _) {
          final todayCompleted = provider.completedTodayOrders;
          final yesterdayCompleted = provider.completedYesterdayOrders;

          return Column(
            children: [
              // Summary cards (Always visible at top)
              Padding(
                padding: const EdgeInsets.all(20),
                child: Row(
                  children: [
                    Expanded(child: _buildSummaryCard(
                      'IDAG',
                      '${provider.todayTotal.toInt()} KR',
                      '${todayCompleted.length} ordrar',
                      AppTheme.gold,
                    )),
                    const SizedBox(width: 15),
                    Expanded(child: _buildSummaryCard(
                      'IGÅR',
                      '${provider.yesterdayTotal.toInt()} KR',
                      '${yesterdayCompleted.length} ordrar',
                      Colors.white24,
                    )),
                  ],
                ),
              ),

              // TabBar
              Container(
                decoration: BoxDecoration(
                  border: Border(bottom: BorderSide(color: Colors.white.withOpacity(0.05))),
                ),
                child: TabBar(
                  controller: _tabController,
                  indicatorColor: AppTheme.gold,
                  indicatorWeight: 4,
                  labelColor: AppTheme.gold,
                  unselectedLabelColor: Colors.white.withOpacity(0.3),
                  labelStyle: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13, letterSpacing: 1),
                  tabs: [
                    Tab(text: 'IDAG (${todayCompleted.length})'),
                    Tab(text: 'IGÅR (${yesterdayCompleted.length})'),
                  ],
                ),
              ),

              // TabBarView
              Expanded(
                child: TabBarView(
                  controller: _tabController,
                  children: [
                    _buildOrderList(todayCompleted, 'Inga avslutade ordrar idag ännu'),
                    _buildOrderList(yesterdayCompleted, 'Inga ordrar från igår'),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildOrderList(List<OrderModel> orders, String emptyText) {
    if (orders.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.history_outlined, size: 50, color: Colors.white.withOpacity(0.1)),
            const SizedBox(height: 16),
            Text(emptyText, style: TextStyle(fontSize: 12, color: Colors.white.withOpacity(0.2), fontWeight: FontWeight.bold)),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(20),
      itemCount: orders.length,
      itemBuilder: (ctx, i) => _buildHistoryTile(ctx, orders[i]),
    );
  }

  Widget _buildSummaryCard(String label, String amount, String subtitle, Color color) {
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: AppTheme.zinc,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: color.withOpacity(0.15)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(fontSize: 9, fontWeight: FontWeight.w900, color: color, letterSpacing: 3)),
          const SizedBox(height: 12),
          Text(amount, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: Colors.white, fontStyle: FontStyle.italic)),
          const SizedBox(height: 4),
          Text(subtitle, style: const TextStyle(fontSize: 11, color: Colors.white24, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildHistoryTile(BuildContext context, OrderModel order) {
    final statusLabel = {
      'DELIVERED': 'LEVERERAD',
      'COMPLETED': 'KLAR',
      'CANCELLED': 'AVBOKAD',
      'DELIVERING': 'SKICKAD',
    }[order.status] ?? order.status;

    final statusColor = order.status == 'CANCELLED' ? Colors.red : Colors.green;

    return GestureDetector(
      onTap: () => Navigator.push(context,
        MaterialPageRoute(builder: (_) => OrderDetailScreen(order: order))),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: AppTheme.zinc,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.white.withOpacity(0.04)),
        ),
        child: Row(
          children: [
            Container(
              width: 48, height: 48,
              decoration: BoxDecoration(
                color: Colors.black26,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Center(child: Text(
                order.orderNumber.replaceAll('PX-', ''),
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: AppTheme.gold),
              )),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(order.customerName.toUpperCase(),
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: Colors.white)),
                  const SizedBox(height: 4),
                  Row(children: [
                    Text(DateFormat('HH:mm').format(order.createdAt),
                      style: const TextStyle(fontSize: 11, color: Colors.white24, fontWeight: FontWeight.bold)),
                    const SizedBox(width: 10),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: statusColor.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(5),
                      ),
                      child: Text(statusLabel,
                        style: TextStyle(fontSize: 8, fontWeight: FontWeight.w900, color: statusColor)),
                    ),
                  ]),
                ],
              ),
            ),
            Text('${order.total.toInt()} KR',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Colors.white54)),
            const SizedBox(width: 12),
            Icon(Icons.chevron_right, size: 20, color: Colors.white.withOpacity(0.1)),
          ],
        ),
      ),
    );
  }
}
