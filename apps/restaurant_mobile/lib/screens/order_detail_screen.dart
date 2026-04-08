import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:animate_do/animate_do.dart';
import '../models/order_model.dart';
import '../providers/order_provider.dart';
import '../core/theme.dart';
import '../core/print_service.dart';

class OrderDetailScreen extends StatefulWidget {
  final OrderModel order;
  const OrderDetailScreen({super.key, required this.order});

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  late OrderModel order;

  @override
  void initState() {
    super.initState();
    order = widget.order;
  }

  void _showAcceptDialog() {
    int selectedMinutes = 20;
    final minuteOptions = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90];
    
    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.zinc,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(30)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 30),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(width: 40, height: 4,
                decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(2))),
              const SizedBox(height: 25),
              const Text('VÄLJ FÖRBEREDELSETID',
                style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: AppTheme.gold, letterSpacing: 3)),
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
                          child: Center(child: Text('$min',
                            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900,
                              color: isSelected ? AppTheme.charcoal : Colors.white60))),
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
                    Expanded(
                      child: SizedBox(height: 60,
                        child: OutlinedButton(
                          onPressed: () => Navigator.pop(ctx),
                          style: OutlinedButton.styleFrom(
                            side: const BorderSide(color: Colors.white10),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                          ),
                          child: const Text('AVBRYT',
                            style: TextStyle(color: Colors.white38, fontSize: 12, fontWeight: FontWeight.w900, letterSpacing: 2)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 15),
                    Expanded(
                      flex: 2,
                      child: SizedBox(height: 60,
                        child: ElevatedButton(
                          onPressed: () async {
                            Navigator.pop(ctx);
                            final provider = Provider.of<OrderProvider>(context, listen: false);
                            final ok = await provider.updateStatus(order.id, 'PREPARING', estimatedTime: selectedMinutes);
                            if (ok && mounted) {
                              setState(() { order = order.copyWith(status: 'PREPARING', estimatedTime: selectedMinutes); });
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text('✅ Godkänd · $selectedMinutes min'), backgroundColor: Colors.green.shade800),
                              );
                            }
                          },
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.green.shade700,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                          ),
                          child: const Text('GODKÄNN',
                            style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w900, letterSpacing: 2)),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final statusLabel = {
      'PENDING': 'VÄNTAR',
      'ACCEPTED': 'BEKRÄFTAD',
      'PREPARING': 'TILLAGAS',
      'READY': 'KLAR',
      'DELIVERING': 'PÅ VÄG',
      'DELIVERED': 'LEVERERAD',
    }[order.status] ?? order.status;

    return Scaffold(
      appBar: AppBar(
        elevation: 0,
        title: Text('ORDER #${order.orderNumber}',
          style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18, letterSpacing: 2, color: Theme.of(context).textTheme.bodyLarge?.color)),
        actions: [
          Container(
            margin: const EdgeInsets.only(right: 16, top: 10, bottom: 10),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
            decoration: BoxDecoration(
              color: order.status == 'PENDING' ? AppTheme.gold.withOpacity(0.15) : Colors.green.withOpacity(0.15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Center(
              child: Text(statusLabel, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900,
                color: order.status == 'PENDING' ? AppTheme.gold : Colors.green, letterSpacing: 1.5)),
            ),
          ),
          IconButton(
            onPressed: () => PrintService.printReceipt(order),
            icon: const Icon(Icons.print_outlined, color: AppTheme.gold),
            tooltip: 'Skriv ut kvitto',
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(25),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            FadeInDown(child: _buildInfoCard(
              title: 'KUNDUPPGIFTER', icon: Icons.person_outline, color: AppTheme.gold,
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(order.customerName, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Theme.of(context).textTheme.bodyLarge?.color)),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Icon(Icons.phone, size: 14, color: Theme.of(context).primaryColor),
                    const SizedBox(width: 8),
                    Text(order.customerPhone, style: TextStyle(fontSize: 18, color: Theme.of(context).primaryColor, fontWeight: FontWeight.bold)),
                  ],
                ),
              ]),
            )),
            const SizedBox(height: 20),

            // Delivery and Notes
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (order.type == 'DELIVERY')
                  Expanded(
                    child: FadeInDown(delay: const Duration(milliseconds: 100),
                      child: _buildInfoCard(
                        title: 'ADRESS', icon: Icons.location_on_outlined, color: Colors.blue,
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(order.deliveryStreet ?? 'Ingen adress', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Theme.of(context).textTheme.bodyLarge?.color)),
                          if (order.deliveryZip != null || order.deliveryCity != null)
                            Text('${order.deliveryZip ?? ""} ${order.deliveryCity ?? ""}'.trim(),
                              style: TextStyle(fontSize: 14, color: Theme.of(context).textTheme.bodySmall?.color?.withOpacity(0.4), fontWeight: FontWeight.bold)),
                        ]),
                      ),
                    ),
                  ),
                if (order.type == 'DELIVERY') const SizedBox(width: 15),
                Expanded(
                  child: FadeInDown(delay: const Duration(milliseconds: 150),
                    child: _buildInfoCard(
                      title: 'TYP', icon: order.type == "DELIVERY" ? Icons.delivery_dining : Icons.shopping_bag_outlined, 
                      color: order.type == "DELIVERY" ? Colors.blue : Colors.green,
                      child: Text(order.type == 'DELIVERY' ? 'UTKÖRNING' : 'AVHÄMTNING', 
                        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Theme.of(context).textTheme.bodyLarge?.color)),
                    ),
                  ),
                ),
              ],
            ),

            // Checkout Note and Delivery Instructions
            if ((order.note != null && order.note!.isNotEmpty) || (order.deliveryInstructions != null && order.deliveryInstructions!.isNotEmpty)) ...[
              const SizedBox(height: 20),
              FadeInDown(delay: const Duration(milliseconds: 200),
                child: _buildInfoCard(
                  title: 'KUNDMEDDELANDE (VID KASSA)', icon: Icons.notification_important, color: Colors.purpleAccent,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (order.deliveryInstructions != null && order.deliveryInstructions!.isNotEmpty)
                        Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(color: Colors.blue.withOpacity(0.1), borderRadius: BorderRadius.circular(6), border: Border.all(color: Colors.blue.withOpacity(0.3))),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.sensor_door, size: 16, color: Colors.blueAccent),
                              const SizedBox(width: 8),
                              Text('INSTRUKTION: ${order.deliveryInstructions!}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.blueAccent)),
                            ]
                          )
                        ),
                      if (order.note != null && order.note!.isNotEmpty)
                        Text(order.note!, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Theme.of(context).textTheme.bodyLarge?.color, fontStyle: FontStyle.italic)),
                    ]
                  ),
                ),
              ),
            ],

            const SizedBox(height: 40),
            _buildSectionHeader('VAROR (${order.items.length})'),
            const SizedBox(height: 15),
            ...order.items.map((item) => _buildItemTile(item)),
            const SizedBox(height: 40),
            _buildTotalSection(order),
            const SizedBox(height: 40),
          ],
        ),
      ),
      bottomNavigationBar: _buildActionFooter(),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Row(
      children: [
        Text(title, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: Theme.of(context).primaryColor.withOpacity(0.5), letterSpacing: 4)),
        const SizedBox(width: 15),
        Expanded(child: Container(height: 1, color: Theme.of(context).primaryColor.withOpacity(0.1))),
      ],
    );
  }

  Widget _buildInfoCard({required String title, required IconData icon, required Color color, required Widget child}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: color.withOpacity(0.2), width: 1.5),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 10),
          Text(title, style: TextStyle(fontSize: 9, fontWeight: FontWeight.w900, color: color, letterSpacing: 2)),
        ]),
        const SizedBox(height: 15),
        child,
      ]),
    );
  }

  Widget _buildItemTile(OrderItemModel item) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface, borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Theme.of(context).textTheme.bodyLarge!.color!.withOpacity(0.05)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(color: AppTheme.gold.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
            child: Text('${item.quantity}x', style: const TextStyle(color: AppTheme.gold, fontSize: 16, fontWeight: FontWeight.w900)),
          ),
          const SizedBox(width: 15),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(item.productName.toUpperCase(), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Theme.of(context).textTheme.bodyLarge?.color)),
            
            // EXTRAS & SIDE DISHES
            if (item.selectedExtras.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 6, runSpacing: 6,
                children: item.selectedExtras.map((e) {
                  final name = e is Map ? (e['name'] ?? "") : "$e";
                  return Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(color: Theme.of(context).primaryColor.withOpacity(0.05), borderRadius: BorderRadius.circular(6)),
                    child: Text('+ $name', style: TextStyle(fontSize: 12, color: Theme.of(context).textTheme.bodySmall?.color?.withOpacity(0.5), fontWeight: FontWeight.bold)),
                  );
                }).toList(),
              ),
            ],

            // ITEM SPECIFIC NOTE
            if (item.note != null && item.note!.isNotEmpty) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: Colors.red.withOpacity(0.05), borderRadius: BorderRadius.circular(10), border: Border.all(color: Colors.red.withOpacity(0.2))),
                child: Row(children: [
                  const Icon(Icons.warning_amber_rounded, size: 14, color: Colors.redAccent),
                  const SizedBox(width: 8),
                  Expanded(child: Text('NOTERING: ${item.note}', style: const TextStyle(fontSize: 12, color: Colors.redAccent, fontWeight: FontWeight.bold))),
                ]),
              ),
            ],
          ])),
          const SizedBox(width: 10),
          Text('${item.subtotal.toInt()} KR', style: TextStyle(color: Theme.of(context).textTheme.bodySmall?.color?.withOpacity(0.4), fontSize: 16, fontWeight: FontWeight.w900)),
        ]),
      ]),
    );
  }

  Widget _buildTotalSection(OrderModel order) {
    return Container(
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [AppTheme.gold.withOpacity(0.1), Colors.transparent], begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: AppTheme.gold.withOpacity(0.2), width: 2),
      ),
      child: Column(children: [
        if (order.deliveryFee > 0)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Text('LEVERANSAVGIFT', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: Theme.of(context).textTheme.bodySmall?.color?.withOpacity(0.4))),
              Text('${order.deliveryFee.toInt()} KR', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Theme.of(context).textTheme.bodySmall?.color?.withOpacity(0.4))),
            ]),
          ),
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text('TOTALT ATT BETALA', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: Theme.of(context).textTheme.bodyLarge?.color)),
          Text('${order.total.toInt()} KR', style: TextStyle(fontSize: 32, fontWeight: FontWeight.w900, color: Theme.of(context).textTheme.bodyLarge?.color, fontStyle: FontStyle.italic)),
        ]),
      ]),
    );
  }

  Widget _buildActionFooter() {
    if (['DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED', 'DELIVERING'].contains(order.status)) {
       return const SizedBox.shrink();
    }
    
    // Hide buttons if Pickup is already READY
    if (order.status == 'READY' && order.type == 'PICKUP') {
       return const SizedBox.shrink();
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 25, vertical: 25),
      color: Theme.of(context).scaffoldBackgroundColor,
      child: SafeArea(
        child: SizedBox(
          width: double.infinity, height: 65,
          child: order.status == 'PENDING'
            ? ElevatedButton.icon(
                onPressed: _showAcceptDialog,
                icon: const Icon(Icons.check_circle, size: 24),
                label: const Text('GODKÄNN ORDER',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, letterSpacing: 2)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.green.shade700,
                  foregroundColor: Colors.white,
                  elevation: 8,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                ),
              )
            : ElevatedButton.icon(
                onPressed: () async {
                  final nextStatus = order.type == 'PICKUP' ? 'READY' : 'DELIVERING';
                  final provider = Provider.of<OrderProvider>(context, listen: false);
                  final ok = await provider.updateStatus(order.id, nextStatus);
                  if (ok && mounted) {
                    setState(() { order = order.copyWith(status: nextStatus); });
                    if (nextStatus == 'DELIVERING' || nextStatus == 'READY') {
                      Navigator.pop(context);
                    }
                  }
                },
                icon: Icon(order.type == 'PICKUP' ? Icons.shopping_bag : Icons.delivery_dining, size: 24),
                label: Text(order.type == 'PICKUP' ? 'KLAR FÖR HÄMTNING' : 'PÅ VÄG (MATEN KLAR)',
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, letterSpacing: 2)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.blue.shade700,
                  foregroundColor: Colors.white,
                  elevation: 8,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                ),
              ),
        ),
      ),
    );
  }
}
