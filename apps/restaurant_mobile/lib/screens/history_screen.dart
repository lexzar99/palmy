import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:animate_do/animate_do.dart';
import '../providers/order_provider.dart';
import '../models/order_model.dart';
import '../core/theme.dart';
import '../core/print_service.dart';

class HistoryScreen extends StatelessWidget {
  const HistoryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          backgroundColor: AppTheme.charcoal,
          elevation: 0,
          title: const Text('ORDERHISTORIK', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, letterSpacing: 2)),
          bottom: TabBar(
            indicatorColor: AppTheme.gold,
            labelColor: AppTheme.gold,
            unselectedLabelColor: Theme.of(context).textTheme.bodySmall?.color?.withOpacity(0.5),
            labelStyle: const TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1, fontSize: 13),
            tabs: [
              const Tab(text: 'IDAG'),
              const Tab(text: 'IGÅR'),
            ],
          ),
        ),
        body: Consumer<OrderProvider>(
          builder: (context, provider, _) {
            final todayCompleted = provider.todayHistoryOrders;
            final yesterdayCompleted = provider.yesterdayHistoryOrders;

            return Column(
              children: [
                _buildSummaryCards(context, provider),
                Expanded(
                  child: TabBarView(
                    children: [
                      _buildHistoryList(todayCompleted),
                      _buildHistoryList(yesterdayCompleted),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildSummaryCards(BuildContext context, OrderProvider provider) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Row(
        children: [
          Expanded(child: _buildStatCard(context, 'IDAG', '${provider.todayTotal.toInt()} KR', AppTheme.gold)),
          const SizedBox(width: 15),
          Expanded(child: _buildStatCard(context, 'IGÅR', '${provider.yesterdayTotal.toInt()} KR', Theme.of(context).textTheme.bodySmall!.color!.withOpacity(0.3))),
        ],
      ),
    );
  }

  Widget _buildStatCard(BuildContext context, String label, String value, Color color) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppTheme.zinc,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: color, letterSpacing: 2)),
          const SizedBox(height: 10),
          Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Theme.of(context).textTheme.bodyLarge?.color)),
        ],
      ),
    );
  }

  Widget _buildHistoryList(List<OrderModel> orders) {
    if (orders.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.history_outlined, size: 60, color: Colors.white.withOpacity(0.1)),
            const SizedBox(height: 16),
            Text('INGA ORDRAR HITTADES', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: Colors.white.withOpacity(0.15), letterSpacing: 3)),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      itemCount: orders.length,
      itemBuilder: (ctx, i) => _buildHistoryCard(ctx, orders[i]),
    );
  }

  Widget _buildHistoryCard(BuildContext context, OrderModel order) {
    return FadeInUp(
      duration: const Duration(milliseconds: 300),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: Theme.of(context).textTheme.bodyLarge!.color!.withOpacity(0.1)),
        ),
        child: ListTile(
          contentPadding: const EdgeInsets.all(18),
          leading: Container(
            width: 50, height: 50,
            decoration: BoxDecoration(color: Colors.black, borderRadius: BorderRadius.circular(15)),
            child: Center(child: Text(order.orderNumber, style: const TextStyle(color: AppTheme.gold, fontWeight: FontWeight.w900))),
          ),
          title: Text(order.customerName.toUpperCase(), style: TextStyle(color: Theme.of(context).textTheme.bodyLarge?.color, fontSize: 14, fontWeight: FontWeight.w900)),
          subtitle: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 5),
              Text(
                order.items.map((i) => '${i.quantity}x ${i.productName}').join(', ').toUpperCase(),
                style: TextStyle(
                  color: Theme.of(context).textTheme.bodySmall?.color?.withOpacity(0.7),
                  fontSize: 9,
                  fontWeight: FontWeight.bold,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          trailing: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('${order.total.toInt()} KR', style: TextStyle(color: Theme.of(context).textTheme.bodyLarge?.color, fontWeight: FontWeight.w900)),
              const SizedBox(height: 6),
              // REPRINT BUTTON
              InkWell(
                onTap: () => PrintService.printReceipt(order),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: const [
                    Icon(Icons.print_outlined, size: 14, color: AppTheme.gold),
                    SizedBox(width: 4),
                    Text('KOPIA', style: TextStyle(color: AppTheme.gold, fontSize: 8, fontWeight: FontWeight.w900, letterSpacing: 1)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
