import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../models/order_model.dart';
import '../providers/auth_provider.dart';
import '../providers/order_provider.dart';
import '../screens/order_detail_screen.dart';
import '../core/theme.dart';
import '../core/print_service.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  @override
  void initState() {
    super.initState();
    _loadOrders();
  }

  void _loadOrders() {
    final auth = Provider.of<AuthProvider>(context, listen: false);
    final orders = Provider.of<OrderProvider>(context, listen: false);
    final restaurantId = auth.user?['restaurantId'];
    if (restaurantId != null) {
      orders.fetchOrders(restaurantId);
      orders.initSocket(restaurantId);
    }
  }

  void _showAcceptDialog(OrderModel order) {
    int selectedMinutes = 20;
    final minuteOptions = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90];
    
    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.zinc,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(30))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 30),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('VÄLJ FÖRBEREDELSETID', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: AppTheme.gold, letterSpacing: 3)),
              const SizedBox(height: 30),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Row(
                  children: minuteOptions.map((min) {
                    final isSelected = selectedMinutes == min;
                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      child: GestureDetector(
                        onTap: () => setSheetState(() => selectedMinutes = min),
                        child: Container(
                          width: 60, height: 60,
                          decoration: BoxDecoration(
                            color: isSelected ? AppTheme.gold : Colors.black26,
                            borderRadius: BorderRadius.circular(18),
                            border: Border.all(color: isSelected ? AppTheme.gold : Colors.white10, width: 2),
                          ),
                          child: Center(child: Text('$min', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: isSelected ? AppTheme.charcoal : Colors.white60))),
                        ),
                      ),
                    );
                  }).toList(),
                ),
              ),
              const SizedBox(height: 35),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 30),
                child: Row(
                  children: [
                    Expanded(child: SizedBox(height: 60, child: OutlinedButton(onPressed: () => Navigator.pop(ctx), style: OutlinedButton.styleFrom(side: const BorderSide(color: Colors.white10), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18))), child: const Text('AVBRYT', style: TextStyle(color: Colors.white38, fontSize: 12, fontWeight: FontWeight.w900, letterSpacing: 2))))),
                    const SizedBox(width: 15),
                    Expanded(flex: 2, child: SizedBox(height: 60, child: ElevatedButton(onPressed: () async {
                      Navigator.pop(ctx);
                      final provider = Provider.of<OrderProvider>(context, listen: false);
                      final ok = await provider.updateStatus(order.id, 'PREPARING', estimatedTime: selectedMinutes);
                      if (ok && mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('✅ Order #${order.orderNumber} godkänd'), backgroundColor: Colors.green.shade800));
                      }
                    }, style: ElevatedButton.styleFrom(backgroundColor: Colors.green.shade700, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18))), child: const Text('GODKÄNN', style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w900, letterSpacing: 2))))),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _markReady(OrderModel order) async {
    final provider = Provider.of<OrderProvider>(context, listen: false);
    final nextStatus = order.type == 'PICKUP' ? 'READY' : 'DELIVERING';
    final ok = await provider.updateStatus(order.id, nextStatus);
    if (ok && mounted) {
      final msg = nextStatus == 'READY' ? 'KLAR FÖR HÄMTNING' : 'PÅ VÄG (KLAR & UTKÖRD)';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('✅ Order #${order.orderNumber} markeras som $msg'), backgroundColor: Colors.blue.shade800));
    }
  }

  @override
  Widget build(BuildContext context) {
    final isTablet = MediaQuery.of(context).size.shortestSide >= 600;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppTheme.charcoal,
        elevation: 0,
        centerTitle: false,
        title: Row(
          children: [
            Container(width: 12, height: 12, decoration: BoxDecoration(color: Colors.green, shape: BoxShape.circle, boxShadow: [BoxShadow(color: Colors.green.withOpacity(0.5), blurRadius: 10, spreadRadius: 2)])),
            const SizedBox(width: 12),
            const Text('LIVE ORDRAR', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, letterSpacing: 2)),
          ],
        ),
        actions: [
          // TEST SOUND BUTTON
          TextButton.icon(
            onPressed: () => Provider.of<OrderProvider>(context, listen: false).playAlarm(),
            icon: const Icon(Icons.volume_up, size: 18, color: AppTheme.gold),
            label: const Text('AKTIVERA LJUD', style: TextStyle(color: AppTheme.gold, fontSize: 10, fontWeight: FontWeight.w900)),
          ),
          IconButton(onPressed: () => Provider.of<OrderProvider>(context, listen: false).refresh(), icon: const Icon(Icons.refresh, color: Colors.white24)),
          const SizedBox(width: 10),
        ],
      ),
      body: Consumer<OrderProvider>(
        builder: (context, provider, child) {
          if (provider.isLoading) return const Center(child: CircularProgressIndicator(color: AppTheme.gold));
          if (isTablet) return _buildTabletLayout(provider);
          return _buildPhoneLayout(provider);
        },
      ),
    );
  }

  Widget _buildTabletLayout(OrderProvider provider) {
    return Row(children: [
        Expanded(child: _buildOrderList('NYA INKOMNA', provider.pendingOrders, true)),
        Container(width: 1, color: Colors.white.withOpacity(0.05)),
        Expanded(child: _buildOrderList('UNDER BEHANDLING', provider.activeOrders, false)),
      ]);
  }

  Widget _buildPhoneLayout(OrderProvider provider) {
    return RefreshIndicator(
      onRefresh: () async => provider.refresh(), color: AppTheme.gold,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.all(20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            _buildSectionHeader('NYA INKOMNA (${provider.pendingOrders.length})', AppTheme.gold),
            const SizedBox(height: 15),
            ...provider.pendingOrders.map((order) => _buildOrderCard(order, true)),
            const SizedBox(height: 40),
            _buildSectionHeader('UNDER BEHANDLING (${provider.activeOrders.length})', Colors.white24),
            const SizedBox(height: 15),
            ...provider.activeOrders.map((order) => _buildOrderCard(order, false)),
            if (provider.pendingOrders.isEmpty && provider.activeOrders.isEmpty)
              Padding(padding: const EdgeInsets.only(top: 100), child: Center(child: Column(children: [Icon(Icons.inbox_outlined, size: 60, color: Colors.white.withOpacity(0.1)), const SizedBox(height: 16), Text('INGA AKTIVA ORDRAR', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: Colors.white.withOpacity(0.15), letterSpacing: 3))]))),
          ]),
      ),
    );
  }

  Widget _buildOrderList(String title, List<OrderModel> orders, bool isNew) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(padding: const EdgeInsets.all(20), child: _buildSectionHeader('$title (${orders.length})', isNew ? AppTheme.gold : Colors.white24)),
        Expanded(child: ListView.builder(padding: const EdgeInsets.symmetric(horizontal: 20), itemCount: orders.length, itemBuilder: (ctx, i) => _buildOrderCard(orders[i], isNew))),
      ]);
  }

  Widget _buildSectionHeader(String title, Color color) {
    return Row(children: [
        Text(title, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: color, letterSpacing: 3)),
        const SizedBox(width: 15),
        Expanded(child: Container(height: 1, color: color.withOpacity(0.1))),
      ]);
  }

  Widget _buildOrderCard(OrderModel order, bool isNew) {
    final statusLabel = {'PENDING': 'NY', 'ACCEPTED': 'BEKRÄFTAD', 'PREPARING': 'TILLAGAS', 'READY': 'KLAR', 'DELIVERING': 'PÅ VÄG'}[order.status] ?? order.status;

    return FadeInLeft(
      duration: const Duration(milliseconds: 400),
      child: Container(
        margin: const EdgeInsets.only(bottom: 18),
        decoration: BoxDecoration(color: AppTheme.zinc, borderRadius: BorderRadius.circular(28), border: Border.all(color: isNew ? AppTheme.gold.withOpacity(0.4) : Colors.white.withOpacity(0.06), width: 2.5)),
        child: Column(children: [
            InkWell(
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(order: order))),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
              child: Padding(padding: const EdgeInsets.all(22),
                child: Row(children: [
                    Container(width: 55, height: 55, decoration: BoxDecoration(color: isNew ? AppTheme.gold : Colors.black, borderRadius: BorderRadius.circular(16)), child: Center(child: Text(order.orderNumber, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: isNew ? AppTheme.charcoal : AppTheme.gold)))),
                    const SizedBox(width: 18),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(order.customerName.toUpperCase(), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Colors.white)),
                          const SizedBox(height: 6),
                          Row(children: [
                              _buildBadge(order.type == 'DELIVERY' ? 'UTKÖRNING' : 'AVHÄMTNING', order.type == 'DELIVERY' ? Colors.blue : Colors.green),
                              const SizedBox(width: 8),
                              _buildBadge(statusLabel, isNew ? AppTheme.gold : Colors.white24),
                            ]),
                          if (order.items.isNotEmpty) ...[
                            const SizedBox(height: 8),
                            Text(order.items.map((i) => '${i.quantity}x ${i.productName}').join(', ').toUpperCase(), 
                              style: const TextStyle(fontSize: 9, color: Colors.white24, fontWeight: FontWeight.bold, overflow: TextOverflow.ellipsis)),
                          ],
                        ])),
                    const SizedBox(width: 8),
                    Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                      Text('${order.total.toInt()} KR', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Colors.white, fontStyle: FontStyle.italic)),
                      const SizedBox(height: 10),
                      // QUICK PRINT BUTTON
                      IconButton(
                        onPressed: () => PrintService.printReceipt(order),
                        icon: const Icon(Icons.print_outlined, size: 20, color: Colors.white24),
                        padding: EdgeInsets.zero, constraints: const BoxConstraints(),
                      ),
                    ]),
                  ])),
            ),
            Container(padding: const EdgeInsets.fromLTRB(22, 0, 22, 18),
              child: Row(children: [
                  if (order.status == 'PENDING')
                    Expanded(child: SizedBox(height: 52, child: ElevatedButton.icon(onPressed: () => _showAcceptDialog(order), icon: const Icon(Icons.check_circle_outline, size: 20), label: const Text('GODKÄNN', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900, letterSpacing: 2)), style: ElevatedButton.styleFrom(backgroundColor: Colors.green.shade700, foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)))))),
                  if (['ACCEPTED', 'PREPARING'].contains(order.status))
                    Expanded(child: SizedBox(height: 52, child: ElevatedButton.icon(onPressed: () => _markReady(order), icon: Icon(order.type == 'PICKUP' ? Icons.shopping_bag_outlined : Icons.delivery_dining, size: 20), label: Text(order.type == 'PICKUP' ? 'KLAR FÖR HÄMTNING' : 'KLAR & PÅ VÄG', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900, letterSpacing: 1.5)), style: ElevatedButton.styleFrom(backgroundColor: Colors.blue.shade700, foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)))))),
                  if (order.status == 'READY' && order.type == 'PICKUP')
                    Expanded(child: SizedBox(height: 52, child: ElevatedButton.icon(onPressed: () async { await Provider.of<OrderProvider>(context, listen: false).updateStatus(order.id, 'DELIVERED'); }, icon: const Icon(Icons.check_circle, size: 20), label: const Text('MARKERA LEVERERAD', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900, letterSpacing: 1)), style: ElevatedButton.styleFrom(backgroundColor: AppTheme.gold, foregroundColor: AppTheme.charcoal, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)))))),
                ])),
          ]),
      ),
    );
  }

  Widget _buildBadge(String text, Color color) {
    return Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3), decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(7), border: Border.all(color: color.withOpacity(0.5), width: 0.8)), child: Text(text, style: TextStyle(fontSize: 9, fontWeight: FontWeight.w900, color: color)));
  }
}
