import 'dart:async';
import 'dart:convert';
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
      if (mounted) setState(() {});
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
    
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (scrollController.hasClients) {
        final screenWidth = MediaQuery.of(context).size.width;
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
                          onPressed: () => Navigator.pop(ctx),
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
                            Navigator.pop(ctx);
                            final provider = Provider.of<OrderProvider>(context, listen: false);
                            final ok = await provider.updateStatus(order.id, 'PREPARING', estimatedTime: selectedMinutes);
                            if (ok && mounted) {
                              setState(() { order = order.copyWith(status: 'PREPARING', estimatedTime: selectedMinutes); });
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
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
        backgroundColor: Colors.transparent,
        title: Text('ORDER #${order.orderNumber}',
          style: TextStyle(fontWeight: FontWeight.w900, fontSize: 18, letterSpacing: 2, color: Theme.of(context).textTheme.bodyLarge?.color)),
        actions: [
          Container(
            margin: const EdgeInsets.symmetric(vertical: 10),
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
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: AnimatedBuilder(
        animation: _pulseController!,
        builder: (context, child) {
          final isOverdue = _checkIfOverdue();
          final borderColor = Colors.red.withOpacity(isOverdue ? (0.3 + (_pulseController!.value * 0.4)) : 0);
          return Container(
            decoration: BoxDecoration(
              border: Border.all(color: borderColor, width: isOverdue ? 4 : 0),
            ),
            child: child,
          );
        },
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
          child: Center(
            child: Container(
              constraints: const BoxConstraints(maxWidth: 600),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF1E1E1E) : Colors.white,
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 20, spreadRadius: 5),
                ],
              ),
              child: Column(
                children: [
                   _buildReceiptHeader(),
                   _buildReceiptCustomerInfo(isDark),
                   
                   if ((order.note != null && order.note!.isNotEmpty) || (order.deliveryInstructions != null && order.deliveryInstructions!.isNotEmpty))
                     _buildReceiptNotes(isDark),
                   
                   _buildDashedDivider(),
                   
                   Padding(
                     padding: const EdgeInsets.all(25),
                     child: Column(
                       crossAxisAlignment: CrossAxisAlignment.start,
                       children: [
                         const Text('ORDERDETALJER', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 2, color: Colors.grey)),
                         const SizedBox(height: 25),
                         ...order.items.map((item) => _buildReceiptItem(item, isDark)),
                       ],
                     ),
                   ),
                   
                   _buildDashedDivider(),
                   _buildReceiptSummary(isDark),
                   const SizedBox(height: 30),
                ],
              ),
            ),
          ),
        ),
      ),
      bottomNavigationBar: _buildActionFooter(),
    );
  }

  Widget _buildReceiptHeader() {
    final accentColor = order.type == 'DELIVERY' ? Colors.green : Colors.blue;
    return Container(
      padding: const EdgeInsets.all(25),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('ORDER #${order.orderNumber}', style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: -1)),
              Text(order.createdAt.toString().split('.')[0].substring(0, 16), style: const TextStyle(fontSize: 12, color: Colors.grey)),
            ],
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(color: accentColor.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
            child: Row(
              children: [
                Icon(order.type == 'DELIVERY' ? Icons.delivery_dining : Icons.shopping_bag_outlined, color: accentColor, size: 16),
                const SizedBox(width: 8),
                Text(order.type == 'DELIVERY' ? 'UTKÖRNING' : 'AVHÄMTNING', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: accentColor)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildReceiptCustomerInfo(bool isDark) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 25, vertical: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.person, size: 16, color: Colors.grey),
              const SizedBox(width: 10),
              Text(order.customerName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              const Icon(Icons.phone, size: 16, color: Colors.grey),
              const SizedBox(width: 10),
              Text(order.customerPhone, style: const TextStyle(fontSize: 16, color: AppTheme.gold, fontWeight: FontWeight.w900)),
            ],
          ),
          if (order.type == 'DELIVERY' && order.deliveryStreet != null) ...[
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.location_on, size: 16, color: Colors.grey),
                const SizedBox(width: 10),
                Expanded(
                  child: Text('${order.deliveryStreet}\n${order.deliveryZip ?? ""} ${order.deliveryCity ?? ""}'.trim(), 
                    style: const TextStyle(fontSize: 16, height: 1.3, fontWeight: FontWeight.w500)),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildReceiptNotes(bool isDark) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.all(25),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.amber.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.amber.withOpacity(0.3), width: 1.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('NOTERING TILL RESTAURANGEN:', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w900, color: Colors.amber, letterSpacing: 1.5)),
          const SizedBox(height: 10),
          if (order.deliveryInstructions != null && order.deliveryInstructions!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text('DÖRR/KOD: ${order.deliveryInstructions}', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: Colors.blueAccent)),
            ),
          if (order.note != null && order.note!.isNotEmpty)
            Text(order.note!, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: isDark ? Colors.white : Colors.black, height: 1.2)),
          
          if (order.allergens != null && order.allergens != "[]" && order.allergens!.isNotEmpty) ...[
            const SizedBox(height: 20),
            const Text('KUNDENS ALLERGENER (VIKTIGT!):', style: TextStyle(fontSize: 9, fontWeight: FontWeight.w900, color: Colors.red, letterSpacing: 1.5)),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: (jsonDecode(order.allergens!) as List).map((a) => Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(color: Colors.red, borderRadius: BorderRadius.circular(8)),
                child: Text(a.toString().toUpperCase(), style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w900)),
              )).toList(),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildReceiptItem(OrderItemModel item, bool isDark) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 25),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${item.quantity}x', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: AppTheme.gold)),
              const SizedBox(width: 15),
              Expanded(
                child: Text(item.productName.toUpperCase(), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, letterSpacing: -0.5)),
              ),
              Text('${item.subtotal.toInt()} KR', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.grey)),
            ],
          ),
          
          if (item.selectedExtras.isNotEmpty) 
            Padding(
              padding: const EdgeInsets.only(left: 40, top: 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: item.selectedExtras.map((e) {
                   final name = e is Map ? (e['name'] ?? "") : "$e";
                   return Padding(
                     padding: const EdgeInsets.only(bottom: 4),
                     child: Row(
                       children: [
                         const Icon(Icons.add_circle_outline, size: 12, color: Colors.green),
                         const SizedBox(width: 8),
                         Text(name.toUpperCase(), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Colors.green)),
                       ],
                     ),
                   );
                }).toList(),
              ),
            ),
            
          if (item.note != null && item.note!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 40, top: 10),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(color: Colors.red.withOpacity(0.08), borderRadius: BorderRadius.circular(6)),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.remove_circle_outline, size: 14, color: Colors.red),
                    const SizedBox(width: 8),
                    Text(item.note!.toUpperCase(), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: Colors.red)),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildReceiptSummary(bool isDark) {
    return Padding(
      padding: const EdgeInsets.all(25),
      child: Column(
        children: [
          if (order.deliveryFee > 0) ...[
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('LEVERANSAVGIFT', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.grey)),
                Text('${order.deliveryFee.toInt()} KR', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
              ],
            ),
            const SizedBox(height: 10),
          ],
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('TOTALT', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
              Text('${order.total.toInt()} KR', style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900, fontStyle: FontStyle.italic)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildDashedDivider() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 25),
      child: Row(
        children: List.generate(40, (index) => Expanded(
          child: Container(
            color: index % 2 == 0 ? Colors.transparent : Colors.grey.withOpacity(0.3),
            height: 1.5,
          ),
        )),
      ),
    );
  }

  Widget _buildActionFooter() {
    if (['DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED', 'DELIVERING'].contains(order.status)) {
       return const SizedBox.shrink();
    }
    
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
