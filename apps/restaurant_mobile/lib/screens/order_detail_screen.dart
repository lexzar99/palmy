import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:animate_do/animate_do.dart';
import '../models/order_model.dart';
import '../providers/order_provider.dart';
import '../core/theme.dart';
import '../core/print_service.dart';
import '../core/audio_helper.dart';
import '../core/log_service.dart';

class OrderDetailScreen extends StatefulWidget {
  final OrderModel order;
  const OrderDetailScreen({super.key, required this.order});

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> with SingleTickerProviderStateMixin {
  late OrderModel order;
  AnimationController? _pulseController;
  Timer? _overdueTimer;

  @override
  void initState() {
    super.initState();
    order = widget.order;
    
    _pulseController = AnimationController(
       vsync: this, 
       duration: const Duration(milliseconds: 1500),
    )..repeat(reverse: true);

    _startOverdueCheck();
  }

  @override
  void dispose() {
    _pulseController?.dispose();
    _overdueTimer?.cancel();
    super.dispose();
  }

  void _startOverdueCheck() {
    _overdueTimer = Timer.periodic(const Duration(seconds: 10), (timer) {
      if (_checkIfOverdue()) {
        AudioHelper.playAudio('notification.mp3');
      }
      if (mounted) setState(() {}); // Refresh pulse state
    });
  }

  bool _checkIfOverdue() {
    if (order.estimatedTime == null) return false;
    if (['DELIVERING', 'DELIVERED', 'CANCELLED', 'REJECTED'].contains(order.status)) return false;

    final deadline = order.createdAt.add(Duration(minutes: order.estimatedTime! + 20));
    return DateTime.now().isAfter(deadline);
  }

  void _showAcceptDialog() {
    int selectedMinutes = 40;
    final minuteOptions = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90];
    final scrollController = ScrollController();
    
    // Center the initial selection (40 at index 7)
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (scrollController.hasClients) {
        final screenWidth = MediaQuery.of(context).size.width;
        // Item is 60px + 12px padding = 72px. 40 is at index 7.
        // We want item 7's center to be at screenWidth/2.
        final targetCenter = (7 * 72.0) + 36.0;
        final offset = targetCenter - (screenWidth / 2);
        scrollController.jumpTo(offset > 0 ? offset : 0);
      }
    });
    
    final isDark = Theme.of(context).brightness == Brightness.dark;
    showModalBottomSheet(
      context: context,
      backgroundColor: isDark ? AppTheme.zinc : Colors.white,
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
                controller: scrollController,
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
                            color: isSelected ? AppTheme.gold : (isDark ? Colors.black26 : Colors.black.withOpacity(0.05)),
                            borderRadius: BorderRadius.circular(18),
                            border: Border.all(color: isSelected ? AppTheme.gold : (isDark ? Colors.white10 : Colors.black12), width: 2),
                          ),
                          child: Center(child: Text('$min',
                            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900,
                              color: isSelected ? (isDark ? AppTheme.charcoal : Colors.white) : (isDark ? Colors.white60 : Colors.black54)))),
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
                          onPressed: () {
                            logger.log('BUTTON PRESS: Cancel Acceptance Dialog for Order #${widget.order.orderNumber}');
                            Navigator.pop(ctx);
                          },
                          style: OutlinedButton.styleFrom(
                            side: BorderSide(color: isDark ? Colors.white10 : Colors.black12),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                          ),
                          child: Text('AVBRYT',
                            style: TextStyle(color: isDark ? Colors.white38 : Colors.black54, fontSize: 12, fontWeight: FontWeight.w900, letterSpacing: 2)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 15),
                    Expanded(
                      flex: 2,
                      child: SizedBox(height: 60,
                        child: ElevatedButton(
                          onPressed: () async {
                            logger.log('BUTTON PRESS: Accept Order #${widget.order.orderNumber} with $selectedMinutes min');
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
      body: AnimatedBuilder(
        animation: _pulseController!,
        builder: (context, child) {
          final isOverdue = _checkIfOverdue();
          final borderColor = Colors.red.withOpacity(isOverdue ? (0.2 + (_pulseController!.value * 0.3)) : 0);

          return Container(
            decoration: BoxDecoration(
              border: Border.all(color: borderColor, width: isOverdue ? 3 : 0),
            ),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(30),
              child: child,
            ),
          );
        },
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // KUNDUPPGIFTER
            _buildSimpleSection(
              title: 'KUNDUPPGIFTER', icon: Icons.person_outline, color: AppTheme.gold,
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(order.customerName, style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900, color: Theme.of(context).textTheme.bodyLarge?.color)),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Icon(Icons.phone, size: 16, color: Theme.of(context).primaryColor),
                    const SizedBox(width: 10),
                    Text(order.customerPhone, style: TextStyle(fontSize: 18, color: Theme.of(context).primaryColor, fontWeight: FontWeight.bold)),
                  ],
                ),
              ]),
            ),

            // Delivery and Type
            const SizedBox(height: 10),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (order.type == 'DELIVERY')
                  Expanded(
                    child: _buildSimpleSection(
                      title: 'ADRESS', icon: Icons.location_on_outlined, color: Colors.blue,
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(order.deliveryStreet ?? 'Ingen adress', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Theme.of(context).textTheme.bodyLarge?.color)),
                        if (order.deliveryZip != null || order.deliveryCity != null)
                          Text('${order.deliveryZip ?? ""} ${order.deliveryCity ?? ""}'.trim(),
                            style: TextStyle(fontSize: 14, color: Theme.of(context).textTheme.bodySmall?.color?.withOpacity(0.4), fontWeight: FontWeight.bold)),
                      ]),
                    ),
                  ),
                if (order.type == 'DELIVERY') const SizedBox(width: 30),
                Expanded(
                  child: _buildSimpleSection(
                    title: 'TYP', icon: order.type == "DELIVERY" ? Icons.delivery_dining : Icons.shopping_bag_outlined, 
                    color: order.type == "DELIVERY" ? Colors.blue : Colors.green,
                    child: Text(order.type == 'DELIVERY' ? 'UTKÖRNING' : 'AVHÄMTNING', 
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Theme.of(context).textTheme.bodyLarge?.color)),
                  ),
                ),
              ],
            ),

            // Checkout Note and Delivery Instructions
            if ((order.note != null && order.note!.isNotEmpty) || (order.deliveryInstructions != null && order.deliveryInstructions!.isNotEmpty)) ...[
              const SizedBox(height: 10),
              _buildSimpleSection(
                title: 'KUNDMEDDELANDE', icon: Icons.assignment_outlined, color: Colors.purpleAccent,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (order.deliveryInstructions != null && order.deliveryInstructions!.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.sensor_door, size: 14, color: Colors.blueAccent),
                            const SizedBox(width: 8),
                            Text('PORTKOD/INFO: ${order.deliveryInstructions!}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.blueAccent)),
                          ]
                        )
                      ),
                    if (order.note != null && order.note!.isNotEmpty)
                      Text(order.note!, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Theme.of(context).textTheme.bodyLarge?.color, fontStyle: FontStyle.italic)),
                  ]
                ),
              ),
            ],

            const SizedBox(height: 30),
            _buildSectionHeader('VAROR (${order.items.length})'),
            const SizedBox(height: 20),
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Row(
      children: [
        Text(title, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: Theme.of(context).primaryColor.withOpacity(isDark ? 0.35 : 0.6), letterSpacing: 4)),
        const SizedBox(width: 15),
        Expanded(child: Container(height: 1.5, color: Theme.of(context).primaryColor.withOpacity(isDark ? 0.1 : 0.15))),
      ],
    );
  }

  Widget _buildSimpleSection({required String title, required IconData icon, required Color color, required Widget child}) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final headerOpacity = isDark ? 0.5 : 1.0;
    final headerColor = isDark ? color : (color == AppTheme.gold ? AppTheme.lightGold : color);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Icon(icon, size: 12, color: headerColor.withOpacity(headerOpacity)),
          const SizedBox(width: 10),
          Text(title, style: TextStyle(fontSize: 9, fontWeight: FontWeight.w900, color: headerColor.withOpacity(headerOpacity), letterSpacing: 2)),
        ]),
        const SizedBox(height: 14),
        child,
        const SizedBox(height: 35), // Spacing between sections
      ],
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
              Text('LEVERANSAVGIFT', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: Theme.of(context).textTheme.bodySmall?.color)),
              Text('${order.deliveryFee.toInt()} KR', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Theme.of(context).textTheme.bodySmall?.color)),
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
