import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:animate_do/animate_do.dart';
import '../models/order_model.dart';
import '../providers/order_provider.dart';
import '../core/theme.dart';

class OrderDetailScreen extends StatelessWidget {
  final OrderModel order;
  const OrderDetailScreen({super.key, required this.order});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppTheme.charcoal,
        title: Text(
          'ORDER ${order.orderNumber}',
          style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16, letterSpacing: 2),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(25),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            FadeInDown(
              child: _buildInfoCard(
                title: 'KUNDUPPGIFTER',
                icon: Icons.person_outline,
                color: AppTheme.gold,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(order.customerName, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: Colors.white)),
                    Text(order.customerPhone, style: const TextStyle(fontSize: 16, color: AppTheme.gold, fontWeight: FontWeight.bold)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
            if (order.type == 'DELIVERY')
              FadeInDown(
                delay: const Duration(milliseconds: 200),
                child: _buildInfoCard(
                  title: 'LEVERANSADRESS',
                  icon: Icons.map_outlined,
                  color: Colors.blue,
                  child: Text(
                    order.deliveryStreet ?? 'Ingen adress angiven',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Colors.white, fontStyle: FontStyle.italic),
                  ),
                ),
              ),
            const SizedBox(height: 40),
            _buildSectionHeader('VAROR (${order.items.length})'),
            const SizedBox(height: 15),
            ...order.items.map((item) => _buildItemTile(item)),
            
            const SizedBox(height: 40),
            _buildTotalSection(order),
          ],
        ),
      ),
      bottomNavigationBar: _buildActionFooter(context),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Text(
      title,
      style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: Colors.white24, letterSpacing: 4),
    );
  }

  Widget _buildInfoCard({required String title, required IconData icon, required Color color, required Widget child}) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppTheme.zinc,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 14, color: color),
              const SizedBox(width: 8),
              Text(title, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: color, letterSpacing: 2)),
            ],
          ),
          const SizedBox(height: 15),
          child,
        ],
      ),
    );
  }

  Widget _buildItemTile(OrderItemModel item) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.black45,
        borderRadius: BorderRadius.circular(15),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('${item.quantity}x', style: const TextStyle(color: AppTheme.gold, fontSize: 18, fontWeight: FontWeight.w900)),
          const SizedBox(width: 15),
          Expanded(
            child: Text(
              item.productName.toUpperCase(),
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Colors.white, fontStyle: FontStyle.italic),
            ),
          ),
          Text('${item.subtotal.toInt()} KR', style: const TextStyle(color: Colors.white24, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildTotalSection(OrderModel order) {
    return Container(
      padding: const EdgeInsets.all(25),
      decoration: BoxDecoration(
        color: AppTheme.gold.withOpacity(0.05),
        borderRadius: BorderRadius.circular(25),
        border: Border.all(color: AppTheme.gold.withOpacity(0.1)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          const Text('TOTALT ATT BETALA', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: Colors.white70)),
          Text('${order.total.toInt()} KR', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900, color: Colors.white, fontStyle: FontStyle.italic)),
        ],
      ),
    );
  }

  Widget _buildActionFooter(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(25),
      color: AppTheme.charcoal,
      child: SafeArea(
        child: SizedBox(
          width: double.infinity,
          height: 65,
          child: ElevatedButton(
            onPressed: () {
              if (order.status == 'PENDING') {
                // Show time picker and accept
              } else {
                Provider.of<OrderProvider>(context, listen: false).updateStatus(order.id, 'READY');
              }
            },
            child: Text(order.status == 'PENDING' ? 'GODKÄNN ORDER' : 'MARKERA SOM KLAR'),
          ),
        ),
      ),
    );
  }
}
