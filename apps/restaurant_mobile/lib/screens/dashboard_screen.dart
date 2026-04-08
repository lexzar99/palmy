import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:animate_do/animate_do.dart';
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
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadOrders();
    });
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

  Future<void> _approveAll() async {
    final provider = Provider.of<OrderProvider>(context, listen: false);
    final pending = provider.pendingOrders;
    if (pending.isEmpty) return;

    bool? confirm = await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.zinc,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(30)),
        title: const Text('GODKÄNN ALLA?', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
        content: Text('Vill du godkänna ${pending.length} nya ordrar med 20 minuters tid?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('AVBRYT')),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), style: ElevatedButton.styleFrom(backgroundColor: AppTheme.gold, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15))), child: const Text('JA, GODKÄNN ALLA', style: TextStyle(color: AppTheme.charcoal, fontWeight: FontWeight.bold))),
        ],
      ),
    );

    if (confirm == true) {
      for (var order in pending) {
        await provider.updateStatus(order.id, 'PREPARING', estimatedTime: 20);
      }
      if (mounted) _loadOrders();
    }
  }

  Future<void> _markReady(OrderModel order) async {
    final provider = Provider.of<OrderProvider>(context, listen: false);
    final nextStatus = order.type == 'PICKUP' ? 'READY' : 'DELIVERING';
    final ok = await provider.updateStatus(order.id, nextStatus);
    if (ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('✅ Kö färdigställd'), backgroundColor: Colors.blue.shade800));
    }
  }

  @override
  Widget build(BuildContext context) {
    final isTablet = MediaQuery.of(context).size.shortestSide >= 600;
    final orderProvider = Provider.of<OrderProvider>(context);
    debugPrint('🖥️ Dashboard Build. Pending Count: ${orderProvider.pendingOrders.length}');

    return Scaffold(
      appBar: AppBar(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        elevation: 0,
        centerTitle: false,
        title: Row(
          children: [
            Container(width: 10, height: 10, decoration: BoxDecoration(color: Colors.green, shape: BoxShape.circle, boxShadow: [BoxShadow(color: Colors.green.withOpacity(0.5), blurRadius: 10, spreadRadius: 2)])),
            const SizedBox(width: 12),
            Text('LIVE ORDRAR', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, letterSpacing: 2, color: Theme.of(context).textTheme.bodyLarge?.color)),
            const SizedBox(width: 10),
            IconButton(
              onPressed: () => Provider.of<OrderProvider>(context, listen: false).testAlarm(),
              icon: Icon(Icons.volume_up, size: 16, color: Theme.of(context).textTheme.bodyLarge?.color?.withOpacity(0.1)),
            ),
          ],
        ),
        actions: [
          Consumer<OrderProvider>(
            builder: (context, provider, _) => Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _buildStatusToggle(provider),
                const SizedBox(width: 10),
              ],
            ),
          ),
          IconButton(onPressed: () => Provider.of<OrderProvider>(context, listen: false).refresh(), icon: Icon(Icons.refresh, color: Theme.of(context).textTheme.bodyLarge?.color?.withOpacity(0.3), size: 24)),
          const SizedBox(width: 10),
        ],
      ),
      body: Consumer<OrderProvider>(
        builder: (context, provider, child) {
          if (provider.isLoading) return const Center(child: CircularProgressIndicator(color: AppTheme.gold));
          
          return Stack(
            children: [
              if (isTablet) _buildTabletLayout(provider) else _buildPhoneLayout(provider),
              if (provider.isOffline)
                Positioned.fill(
                  child: Pulse(
                    infinite: true,
                    child: Container(
                      color: Colors.red.withOpacity(0.9),
                      child: Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: const [
                            Icon(Icons.wifi_off, size: 80, color: Colors.white),
                            SizedBox(height: 20),
                            Text('INGEN ANSLUTNING', style: TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w900, letterSpacing: 2)),
                            SizedBox(height: 10),
                            Text('Försöker återansluta till servern...', style: TextStyle(color: Colors.white70, fontSize: 16)),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildTabletLayout(OrderProvider provider) {
    return Column(
      children: [
        if (provider.pendingOrders.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.all(25),
            child: _buildSectionHeader('NYA INKOMNA', AppTheme.gold),
          ),
          SizedBox(
            height: 180,
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 25),
              child: Row(
                children: provider.pendingOrders.map((o) => _buildOrderCard(o, true)).toList(),
              ),
            ),
          ),
          const Divider(height: 1),
        ],
        Expanded(
          child: _buildOrderList('UNDER BEHANDLING', provider.activeOrders, false),
        ),
      ],
    );
  }

  Widget _buildPhoneLayout(OrderProvider provider) {
    return RefreshIndicator(
      onRefresh: () async => provider.refresh(), color: AppTheme.gold,
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.all(25),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _buildSectionHeader('NYA INKOMNA'.toUpperCase(), AppTheme.gold),
                if (provider.pendingOrders.length > 1) 
                  TextButton.icon(
                    onPressed: _approveAll,
                    icon: const Icon(Icons.done_all, size: 16, color: Colors.greenAccent),
                    label: const Text('GODKÄNN ALLA', style: TextStyle(color: Colors.greenAccent, fontSize: 10, fontWeight: FontWeight.w900)),
                  ),
              ],
            ),
            const SizedBox(height: 15),
            if (provider.pendingOrders.isNotEmpty)
              SizedBox(
                height: 200,
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  physics: const BouncingScrollPhysics(),
                  clipBehavior: Clip.none,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SizedBox(width: 15), // Smaller initial spacing
                      ...provider.pendingOrders.map((order) => _buildOrderCard(order, true)).toList(),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 40),
            _buildSectionHeader('UNDER BEHANDLING'.toUpperCase(), Theme.of(context).textTheme.bodySmall!.color!.withOpacity(0.3)),
            const SizedBox(height: 15),
            ...provider.activeOrders.map((order) => _buildOrderCard(order, false)),
            if (provider.pendingOrders.isEmpty && provider.activeOrders.isEmpty)
              Padding(padding: const EdgeInsets.only(top: 100), child: Center(child: Column(children: [Icon(Icons.inbox_outlined, size: 60, color: Theme.of(context).textTheme.bodySmall!.color!.withOpacity(0.1)), const SizedBox(height: 16), Text('INGA AKTIVA ORDRAR', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: Theme.of(context).textTheme.bodySmall!.color!.withOpacity(0.05), letterSpacing: 3))]))),
          ]),
      ),
    );
  }

  Widget _buildOrderList(String title, List<OrderModel> orders, bool isNew) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(padding: const EdgeInsets.all(25), child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            _buildSectionHeader(title, isNew ? AppTheme.gold : Theme.of(context).textTheme.bodySmall!.color!.withOpacity(0.3)),
            if (isNew && orders.length > 1) 
              TextButton.icon(
                onPressed: _approveAll,
                icon: const Icon(Icons.done_all, size: 16, color: Colors.greenAccent),
                label: const Text('GODKÄNN ALLA', style: TextStyle(color: Colors.greenAccent, fontSize: 10, fontWeight: FontWeight.w900)),
              ),
          ],
        )),
        Expanded(child: ListView.builder(padding: const EdgeInsets.symmetric(horizontal: 25), itemCount: orders.length, itemBuilder: (ctx, i) => _buildOrderCard(orders[i], isNew))),
      ]);
  }

  Widget _buildSectionHeader(String title, Color color) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
        Text(title, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: color, letterSpacing: 4)),
        const SizedBox(width: 15),
      ]);
  }

  Widget _buildOrderCard(OrderModel order, bool isNew) {
    final bool isDelivery = order.type == 'DELIVERY';
    final Color typeColor = isDelivery ? Colors.blue : Colors.green;
    final bool isDark = Theme.of(context).brightness == Brightness.dark;

    if (isNew) {
      // PREMIUM NEW ORDERS: REFINED MINI CARD WITH FRAME-ONLY PULSE
      return FadeInRight(
        duration: const Duration(milliseconds: 500),
        child: Container(
          width: 200, height: 160,
          margin: const EdgeInsets.only(right: 15, bottom: 20),
          child: _GlowFrame(
            color: typeColor,
            isDark: isDark,
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: isDark 
                    ? [AppTheme.zinc, AppTheme.charcoal] 
                    : [Colors.white, const Color(0xFFF9F9F9)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(22),
              ),
              child: InkWell(
                onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(order: order))),
                borderRadius: BorderRadius.circular(22),
                child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            '#${order.orderNumber}',
                            style: TextStyle(
                              fontSize: 24, 
                              fontWeight: FontWeight.w900, 
                              color: isDark ? typeColor : typeColor.withOpacity(0.8),
                              letterSpacing: -1,
                              height: 1
                            ),
                          ),
                          Icon(isDelivery ? Icons.delivery_dining : Icons.shopping_bag_outlined, color: typeColor.withOpacity(0.4), size: 12),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        order.customerName.toUpperCase(),
                        style: TextStyle(
                          fontSize: 11, 
                          fontWeight: FontWeight.w900, 
                          color: isDark ? Colors.white : AppTheme.charcoal,
                        ),
                        maxLines: 1, overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 1),
                      Text(
                        isDelivery ? 'UTKÖRNING' : 'AVHÄMTNING',
                        style: TextStyle(fontSize: 7, fontWeight: FontWeight.bold, color: typeColor.withOpacity(0.4), letterSpacing: 1),
                      ),
                      const SizedBox(height: 15),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            '${order.total.toInt()} KR',
                            style: TextStyle(
                              fontSize: 14, 
                              fontWeight: FontWeight.w900, 
                              color: isDark ? Colors.white.withOpacity(0.6) : AppTheme.charcoal.withOpacity(0.7),
                            ),
                          ),
                          Icon(Icons.arrow_forward_ios_rounded, size: 8, color: typeColor.withOpacity(0.15)),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }

    // PROCESSING ORDERS (List)
    return FadeInUp(
      duration: const Duration(milliseconds: 400),
      child: Container(
        margin: const EdgeInsets.only(bottom: 18),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(28),
          border: Border.all(color: typeColor.withOpacity(0.1), width: 2),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.1), blurRadius: 10, offset: const Offset(0, 4))],
        ),
        child: InkWell(
          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(order: order))),
          borderRadius: BorderRadius.circular(28),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                Container(
                  width: 50, height: 50,
                  decoration: BoxDecoration(
                    color: typeColor.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(15),
                  ),
                  child: Center(
                    child: Text(
                      order.orderNumber,
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: typeColor),
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
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900),
                      ),
                      const SizedBox(height: 5),
                      Text(
                        isDelivery ? 'UTKÖRNING' : 'AVHÄMTNING',
                        style: TextStyle(fontSize: 9, fontWeight: FontWeight.w900, color: typeColor, letterSpacing: 1),
                      ),
                    ],
                  ),
                ),
                Text(
                  '${order.total.toInt()} KR',
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900),
                ),
                const SizedBox(width: 15),
                IconButton(
                  onPressed: () => _markReady(order),
                  icon: Icon(order.type == 'PICKUP' ? Icons.check_circle_outline : Icons.delivery_dining, color: typeColor),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }


  Widget _buildBadge(String text, Color color) {
    return Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4), decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(9), border: Border.all(color: color.withOpacity(0.5), width: 1)), child: Text(text, style: TextStyle(fontSize: 9, fontWeight: FontWeight.w900, color: color, letterSpacing: 1)));
  }

  Widget _buildStatusToggle(OrderProvider provider) {
    final isOpen = provider.isRestaurantOpen;
    return GestureDetector(
      onTap: () => _showStatusPicker(provider),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        height: 42,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: isOpen 
              ? [Colors.green.shade800, Colors.green.shade500] 
              : [AppTheme.danger.withOpacity(0.8), AppTheme.danger],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
          borderRadius: BorderRadius.circular(15),
          boxShadow: [
            BoxShadow(
              color: (isOpen ? Colors.green : AppTheme.danger).withOpacity(0.2),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(isOpen ? Icons.check_circle : Icons.power_settings_new, color: Colors.white, size: 14),
            const SizedBox(width: 8),
            Text(isOpen ? 'ÖPPEN' : 'STÄNGD', style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w900, letterSpacing: 2)),
          ],
        ),
      ),
    );
  }

  void _showStatusPicker(OrderProvider provider) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        decoration: const BoxDecoration(color: AppTheme.charcoal, borderRadius: BorderRadius.vertical(top: Radius.circular(40))),
        padding: const EdgeInsets.all(40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('RESTAURANGSTATUS', style: TextStyle(color: AppTheme.gold, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 4)),
            const SizedBox(height: 35),
            _buildStatusOption(
              ctx, 'ÖPPEN', 'Kunder kan beställa mat nu.', true, provider.isRestaurantOpen,
              () { if (!provider.isRestaurantOpen) provider.toggleRestaurantStatus(); Navigator.pop(ctx); }
            ),
            const SizedBox(height: 15),
            _buildStatusOption(
              ctx, 'STÄNGD', 'Inga nya beställningar tas emot.', false, !provider.isRestaurantOpen,
              () { if (provider.isRestaurantOpen) provider.toggleRestaurantStatus(); Navigator.pop(ctx); }
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusOption(BuildContext context, String title, String sub, bool targetOpen, bool isCurrent, VoidCallback onTap) {
    final color = targetOpen ? Colors.green : AppTheme.danger;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(30),
      child: Container(
        padding: const EdgeInsets.all(28),
        decoration: BoxDecoration(
          color: AppTheme.zinc,
          borderRadius: BorderRadius.circular(30),
          border: Border.all(color: isCurrent ? color : Colors.white.withOpacity(0.04), width: 2),
        ),
        child: Row(
          children: [
            Container(width: 50, height: 50, decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(18)), child: Icon(targetOpen ? Icons.storefront : Icons.store_outlined, color: color)),
            const SizedBox(width: 25),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: TextStyle(color: isCurrent ? color : Colors.white, fontWeight: FontWeight.w900, fontSize: 16)),
              const SizedBox(height: 5),
              Text(sub, style: const TextStyle(color: Colors.white24, fontSize: 12, fontWeight: FontWeight.bold)),
            ])),
            if (isCurrent) Icon(Icons.check_circle, color: color),
          ],
        ),
      ),
    );
  }
}

class _GlowFrame extends StatefulWidget {
  final Widget child;
  final Color color;
  final bool isDark;
  const _GlowFrame({required this.child, required this.color, required this.isDark});

  @override
  State<_GlowFrame> createState() => _GlowFrameState();
}

class _GlowFrameState extends State<_GlowFrame> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(seconds: 2))..repeat(reverse: true);
    _animation = Tween<double>(begin: 0.1, end: 1.0).animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOut));
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _animation,
      builder: (context, child) {
        return Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: widget.color.withOpacity(0.4 * _animation.value), width: 2.5),
            boxShadow: [
              BoxShadow(
                color: widget.color.withOpacity(0.2 * _animation.value),
                blurRadius: 12 * _animation.value,
                spreadRadius: 1 * _animation.value,
              ),
            ],
          ),
          child: widget.child,
        );
      },
    );
  }
}
