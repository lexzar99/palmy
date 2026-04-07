import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../models/order_model.dart';
import '../providers/auth_provider.dart';
import '../providers/order_provider.dart';
import '../screens/order_detail_screen.dart';
import '../core/theme.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  @override
  void initState() {
    super.initState();
    final auth = Provider.of<AuthProvider>(context, listen: false);
    final orders = Provider.of<OrderProvider>(context, listen: false);
    final restaurantId = auth.user?['restaurantId'];
    
    if (restaurantId != null) {
      orders.fetchOrders(restaurantId);
      orders.initSocket(restaurantId);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppTheme.charcoal,
        elevation: 0,
        title: Row(
          children: [
            Container(
              width: 12,
              height: 12,
              decoration: BoxDecoration(
                color: Colors.green,
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(color: Colors.green.withOpacity(0.5), blurRadius: 10, spreadRadius: 2)
                ],
              ),
            ),
            const SizedBox(width: 12),
            const Text(
              'LIVE ORDRAR',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w900,
                letterSpacing: 2,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            onPressed: () => Provider.of<AuthProvider>(context, listen: false).logout(),
            icon: const Icon(Icons.logout, color: Colors.white24),
          ),
        ],
      ),
      body: Consumer<OrderProvider>(
        builder: (context, provider, child) {
          if (provider.isLoading) {
            return const Center(child: CircularProgressIndicator(color: AppTheme.gold));
          }

          return SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildSectionHeader('NYA INKOMNA (${provider.pendingOrders.length})', AppTheme.gold),
                const SizedBox(height: 15),
                ...provider.pendingOrders.map((order) => _buildOrderCard(order, true)),
                
                const SizedBox(height: 40),
                _buildSectionHeader('UNDER BEHANDLING (${provider.activeOrders.length})', Colors.white24),
                const SizedBox(height: 15),
                ...provider.activeOrders.map((order) => _buildOrderCard(order, false)),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildSectionHeader(String title, Color color) {
    return Row(
      children: [
        Text(
          title,
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w900,
            color: color,
            letterSpacing: 3,
          ),
        ),
        const SizedBox(width: 15),
        Expanded(child: Container(height: 1, color: color.withOpacity(0.1))),
      ],
    );
  }

  Widget _buildOrderCard(OrderModel order, bool isNew) {
    return FadeInLeft(
      duration: const Duration(milliseconds: 400),
      child: Container(
        margin: const EdgeInsets.only(bottom: 15),
        decoration: BoxDecoration(
          color: AppTheme.zinc,
          borderRadius: BorderRadius.circular(25),
          border: Border.all(
            color: isNew ? AppTheme.gold.withOpacity(0.3) : Colors.white.withOpacity(0.05),
            width: 2,
          ),
        ),
        child: InkWell(
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => OrderDetailScreen(order: order)),
          ),
          borderRadius: BorderRadius.circular(25),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                Container(
                  width: 55,
                  height: 55,
                  decoration: BoxDecoration(
                    color: isNew ? AppTheme.gold : Colors.black,
                    borderRadius: BorderRadius.circular(15),
                    border: Border.all(color: Colors.white10),
                  ),
                  child: Center(
                    child: Text(
                      order.orderNumber.replaceAll('PX-', ''),
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w900,
                        color: isNew ? AppTheme.charcoal : AppTheme.gold,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 20),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        order.customerName.toUpperCase(),
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w900,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 5),
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: order.type == 'DELIVERY' ? Colors.blue.withOpacity(0.1) : Colors.green.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(5),
                              border: Border.all(color: order.type == 'DELIVERY' ? Colors.blue : Colors.green, width: 0.5),
                            ),
                            child: Text(
                              order.type == 'DELIVERY' ? 'UTKÖRNING' : 'AVHÄMTNING',
                              style: TextStyle(
                                fontSize: 8,
                                fontWeight: FontWeight.w900,
                                color: order.type == 'DELIVERY' ? Colors.blue : Colors.green,
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Text(
                            DateFormat('HH:mm').format(order.createdAt),
                            style: const TextStyle(fontSize: 10, color: Colors.white24, fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                Text(
                  '${order.total.toInt()} KR',
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                    fontStyle: FontStyle.italic,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
