import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:animate_do/animate_do.dart';
import '../providers/order_provider.dart';
import '../models/order_model.dart';
import '../core/theme.dart';
import '../core/print_service.dart';
import '../screens/order_detail_screen.dart';

class HistoryScreen extends StatelessWidget {
  const HistoryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          backgroundColor: Theme.of(context).brightness == Brightness.dark ? AppTheme.charcoal : AppTheme.lightBg,
          elevation: 0,
          title: Text('ORDERHISTORIK', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, letterSpacing: 2, color: Theme.of(context).textTheme.titleLarge?.color)),
          bottom: TabBar(
            indicatorColor: AppTheme.gold,
            labelColor: Theme.of(context).brightness == Brightness.dark ? AppTheme.gold : AppTheme.lightGold,
            unselectedLabelColor: Theme.of(context).textTheme.bodySmall?.color?.withOpacity(0.4),
            labelStyle: const TextStyle(fontWeight: FontWeight.w900, letterSpacing: 1, fontSize: 13),
            tabs: [
              const Tab(text: 'IDAG'),
              const Tab(text: 'IGÅR'),
            ],
          ),
        ),
        body: RefreshIndicator(
          onRefresh: () async => Provider.of<OrderProvider>(context, listen: false).refresh(),
          color: AppTheme.gold,
          child: Consumer<OrderProvider>(
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
      ),
    );
  }

  Widget _buildSummaryCards(BuildContext context, OrderProvider provider) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Row(
        children: [
          Expanded(child: _buildStatCard(context, 'IDAG', '${provider.todayTotal.toInt()} KR', AppTheme.gold, '${provider.todayHistoryOrders.length} ORDRAR')),
          const SizedBox(width: 15),
          Expanded(child: _buildStatCard(context, 'IGÅR', '${provider.yesterdayTotal.toInt()} KR', Theme.of(context).textTheme.bodySmall!.color!.withOpacity(0.3), '${provider.yesterdayHistoryOrders.length} ORDRAR')),
        ],
      ),
    );
  }

  Widget _buildStatCard(BuildContext context, String label, String value, Color color, String subtitle) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: isDark ? AppTheme.zinc : Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: isDark ? color.withOpacity(0.2) : Colors.black.withOpacity(0.08), width: 1.5),
        boxShadow: isDark ? [] : [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 10, offset: const Offset(0, 4))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: isDark ? color : AppTheme.lightGold, letterSpacing: 2)),
          const SizedBox(height: 10),
          Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Theme.of(context).textTheme.bodyLarge?.color)),
          const SizedBox(height: 4),
          Text(subtitle, style: TextStyle(fontSize: 9, fontWeight: FontWeight.w900, color: isDark ? color.withOpacity(0.5) : AppTheme.lightSubtext, letterSpacing: 0.5)),
        ],
      ),
    );
  }

  Widget _buildHistoryList(List<OrderModel> orders) {
    if (orders.isEmpty) {
      return SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: Container(
          height: 400,
          alignment: Alignment.center,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.history_outlined, size: 60, color: Colors.white.withOpacity(0.1)),
              const SizedBox(height: 16),
              Text('INGA ORDRAR HITTADES', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: Colors.white.withOpacity(0.15), letterSpacing: 3)),
            ],
          ),
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
          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(order: order))),
          contentPadding: const EdgeInsets.all(18),
          leading: Container(
            width: 50, height: 50,
            decoration: BoxDecoration(color: Colors.black, borderRadius: BorderRadius.circular(15)),
            child: Center(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  order.orderNumber,
                  style: const TextStyle(color: AppTheme.gold, fontWeight: FontWeight.w900),
                ),
              ),
            ),
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
