import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/log_service.dart';
import '../core/theme.dart';
import '../models/order_model.dart';
import '../providers/auth_provider.dart';
import '../providers/order_provider.dart';
import '../widgets/app_ui.dart';
import '../widgets/order_card.dart';
import 'new_order_alert_screen.dart';
import 'order_detail_screen.dart';
import 'order_take_screen.dart';

/// Compact, mobile-first dashboard. Optimised for ≥320 dp width.
///
/// New orders show with a pulsing accent on their card, plus a top
/// "Ny order!" pulse banner that fades in when the pending count goes up.
/// Tapping a pending order opens the dedicated [OrderTakeScreen] with a
/// stripped-down "accept it now" flow.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen>
    with SingleTickerProviderStateMixin {
  int _lastPendingCount = 0;
  late final AnimationController _newOrderPulse;
  bool _showNewOrderBanner = false;
  bool _alertScreenOpen = false;
  String? _initialPendingFingerprint;

  @override
  void initState() {
    super.initState();
    _newOrderPulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    );
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadOrders());
  }

  @override
  void dispose() {
    _newOrderPulse.dispose();
    super.dispose();
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

  void _maybeFireNewOrderPulse(OrderProvider provider) {
    final pending = provider.pendingOrders;
    final currentPending = pending.length;

    // First load: don't trigger alerts for orders that arrived before the
    // app was opened (they're pre-existing, not "new" to this session).
    if (_initialPendingFingerprint == null) {
      _initialPendingFingerprint = pending.map((o) => o.id).join('|');
      _lastPendingCount = currentPending;
      return;
    }

    if (currentPending > _lastPendingCount && !_alertScreenOpen && mounted) {
      final newest = pending.first;
      _alertScreenOpen = true;

      // Subtle in-place pulse banner
      setState(() => _showNewOrderBanner = true);
      _newOrderPulse.forward(from: 0);
      Future.delayed(const Duration(seconds: 4), () {
        if (mounted) setState(() => _showNewOrderBanner = false);
      });

      // Big blue fullscreen alert — tap to dismiss and go back to order list
      Navigator.of(context).push(
        PageRouteBuilder(
          opaque: true,
          transitionDuration: const Duration(milliseconds: 320),
          pageBuilder: (_, __, ___) => NewOrderAlertScreen(
            order: newest,
            onTap: () => Navigator.of(context).pop(),
          ),
          transitionsBuilder: (_, anim, __, child) =>
              FadeTransition(opacity: anim, child: child),
        ),
      ).whenComplete(() {
        _alertScreenOpen = false;
      });
    }
    _lastPendingCount = currentPending;
  }

  Future<void> _markReady(OrderModel order) async {
    final provider = Provider.of<OrderProvider>(context, listen: false);
    final nextStatus = order.type == 'PICKUP' ? 'READY' : 'DELIVERING';
    final ok = await provider.updateStatus(order.id, nextStatus);
    if (!mounted || !ok) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          order.type == 'PICKUP' ? 'Klar för hämtning' : 'Markerad som på väg',
        ),
        backgroundColor: AppTheme.success,
      ),
    );
  }

  void _openTake(OrderModel order) {
    Navigator.push(
      context,
      PageRouteBuilder(
        transitionDuration: const Duration(milliseconds: 280),
        pageBuilder: (_, __, ___) => OrderTakeScreen(
          order: order,
          arrivedAt: order.createdAt,
        ),
        transitionsBuilder: (_, anim, __, child) {
          return FadeTransition(
            opacity: anim,
            child: SlideTransition(
              position: Tween<Offset>(
                begin: const Offset(0, 0.06),
                end: Offset.zero,
              ).animate(
                CurvedAnimation(parent: anim, curve: Curves.easeOutCubic),
              ),
              child: child,
            ),
          );
        },
      ),
    );
  }

  void _openDetail(OrderModel order) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => OrderDetailScreen(order: order)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Consumer<OrderProvider>(
        builder: (context, provider, _) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) _maybeFireNewOrderPulse(provider);
          });

          if (provider.isLoading && provider.orders.isEmpty) {
            return const Center(
              child: CircularProgressIndicator(color: AppTheme.gold),
            );
          }

          return Stack(
            children: [
              RefreshIndicator(
                onRefresh: () async => provider.refresh(),
                color: AppTheme.gold,
                child: CustomScrollView(
                  physics: const AlwaysScrollableScrollPhysics(
                    parent: BouncingScrollPhysics(),
                  ),
                  slivers: [
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
                        child: _Header(provider: provider),
                      ),
                    ),
                    if (provider.isOffline)
                      SliverToBoxAdapter(
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
                          child: _buildOfflineBanner(),
                        ),
                      ),
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(12, 14, 12, 8),
                        child: _SectionLabel(
                          title: 'NYA',
                          count: provider.pendingOrders.length,
                          accent: AppTheme.warning,
                        ),
                      ),
                    ),
                    if (provider.pendingOrders.isEmpty)
                      const SliverToBoxAdapter(
                        child: Padding(
                          padding: EdgeInsets.fromLTRB(12, 0, 12, 0),
                          child: AppEmptyState(
                            icon: Icons.task_alt_rounded,
                            title: 'Inga nya',
                            subtitle: '',
                          ),
                        ),
                      )
                    else
                      SliverPadding(
                        padding: const EdgeInsets.fromLTRB(12, 0, 12, 0),
                        sliver: SliverList.separated(
                          itemCount: provider.pendingOrders.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (context, index) {
                            final o = provider.pendingOrders[index];
                            return OrderCard(
                              order: o,
                              pending: true,
                              onTap: () => _openTake(o),
                            );
                          },
                        ),
                      ),
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(12, 16, 12, 8),
                        child: _SectionLabel(
                          title: 'AKTIVA',
                          count: provider.activeOrders.length,
                          accent: AppTheme.info,
                        ),
                      ),
                    ),
                    if (provider.activeOrders.isEmpty)
                      const SliverToBoxAdapter(
                        child: Padding(
                          padding: EdgeInsets.fromLTRB(12, 0, 12, 24),
                          child: AppEmptyState(
                            icon: Icons.inbox_outlined,
                            title: 'Inga aktiva',
                            subtitle: '',
                          ),
                        ),
                      )
                    else
                      SliverPadding(
                        padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
                        sliver: SliverList.separated(
                          itemCount: provider.activeOrders.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (context, index) {
                            final o = provider.activeOrders[index];
                            return OrderCard(
                              order: o,
                              pending: false,
                              onTap: () => _openDetail(o),
                              onAction: () => _markReady(o),
                            );
                          },
                        ),
                      ),
                  ],
                ),
              ),
              if (_showNewOrderBanner)
                Positioned(
                  top: 8,
                  left: 12,
                  right: 12,
                  child: _NewOrderBanner(
                    controller: _newOrderPulse,
                    count: provider.pendingOrders.length,
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildOfflineBanner() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppTheme.danger.withOpacity(0.12),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.danger.withOpacity(0.35)),
      ),
      child: const Row(
        children: [
          Icon(Icons.wifi_off_rounded, color: AppTheme.danger, size: 16),
          SizedBox(width: 8),
          Text(
            'Offline',
            style: TextStyle(
              color: AppTheme.danger,
              fontWeight: FontWeight.w800,
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Header ────────────────────────────────────────────────────────────────────
class _Header extends StatelessWidget {
  final OrderProvider provider;
  const _Header({required this.provider});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            'Ordrar',
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontSize: 26,
                  letterSpacing: -0.6,
                ),
          ),
        ),
        _StatusChip(
          label: provider.isRestaurantOpen ? 'Öppet' : 'Stängt',
          color: provider.isRestaurantOpen ? AppTheme.success : AppTheme.danger,
          onTap: () => _showStatusPicker(context, provider),
        ),
        const SizedBox(width: 6),
        _IconButton(
          icon: Icons.volume_up_rounded,
          onTap: provider.testAlarm,
        ),
      ],
    );
  }

  void _showStatusPicker(BuildContext context, OrderProvider provider) {
    logger.log('TAP: Open restaurant status picker');
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return Padding(
          padding: const EdgeInsets.all(12),
          child: Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: AppTheme.panelColor(ctx),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: AppTheme.borderColor(ctx)),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _StatusTile(
                  title: 'Öppet',
                  selected: provider.isRestaurantOpen,
                  color: AppTheme.success,
                  icon: Icons.storefront_rounded,
                  onTap: () async {
                    Navigator.pop(ctx);
                    if (!provider.isRestaurantOpen) {
                      await provider.setStatus(true);
                    }
                  },
                ),
                const SizedBox(height: 8),
                _StatusTile(
                  title: 'Stängt',
                  selected: !provider.isRestaurantOpen,
                  color: AppTheme.danger,
                  icon: Icons.store_mall_directory_outlined,
                  onTap: () async {
                    Navigator.pop(ctx);
                    if (provider.isRestaurantOpen) {
                      await provider.setStatus(false);
                    }
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _StatusChip({
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
            color: color.withOpacity(0.12),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: color.withOpacity(0.45)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 7,
                height: 7,
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
              ),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  color: color,
                  fontWeight: FontWeight.w900,
                  fontSize: 12,
                  letterSpacing: 0.4,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _IconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  const _IconButton({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppTheme.faintColor(context),
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Icon(icon, size: 18),
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String title;
  final int count;
  final Color accent;
  const _SectionLabel({
    required this.title,
    required this.count,
    required this.accent,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          title,
          style: TextStyle(
            color: accent,
            fontSize: 12,
            fontWeight: FontWeight.w900,
            letterSpacing: 1.4,
          ),
        ),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
          decoration: BoxDecoration(
            color: accent.withOpacity(0.16),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            '$count',
            style: TextStyle(
              color: accent,
              fontWeight: FontWeight.w900,
              fontSize: 12,
            ),
          ),
        ),
      ],
    );
  }
}

class _StatusTile extends StatelessWidget {
  final String title;
  final bool selected;
  final Color color;
  final IconData icon;
  final VoidCallback onTap;

  const _StatusTile({
    required this.title,
    required this.selected,
    required this.color,
    required this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: selected ? color.withOpacity(0.12) : Colors.transparent,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected
                  ? color.withOpacity(0.4)
                  : AppTheme.borderColor(context),
            ),
          ),
          child: Row(
            children: [
              Icon(icon, color: color, size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w900,
                    fontSize: 15,
                  ),
                ),
              ),
              Icon(
                selected ? Icons.check_circle_rounded : Icons.chevron_right,
                color: selected ? color : AppTheme.mutedColor(context),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── New-order pulse banner ────────────────────────────────────────────────────
class _NewOrderBanner extends StatelessWidget {
  final AnimationController controller;
  final int count;

  const _NewOrderBanner({required this.controller, required this.count});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        final t = controller.value;
        final scale = 0.96 + t * 0.05;
        return Center(
          child: Transform.scale(
            scale: scale,
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [AppTheme.warning, AppTheme.gold],
                ),
                borderRadius: BorderRadius.circular(16),
                boxShadow: [
                  BoxShadow(
                    color: AppTheme.warning.withOpacity(0.45),
                    blurRadius: 24 + t * 16,
                    spreadRadius: 1,
                  ),
                ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.notifications_active_rounded,
                    color: Colors.white,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    count > 1 ? '$count nya ordrar!' : 'Ny order!',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.2,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
