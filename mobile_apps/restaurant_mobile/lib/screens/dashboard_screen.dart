import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/log_service.dart';
import '../core/theme.dart';
import '../models/order_model.dart';
import '../providers/auth_provider.dart';
import '../providers/order_provider.dart';
import '../widgets/order_card.dart';
import 'new_order_alert_screen.dart';
import 'order_detail_screen.dart';
import 'order_take_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen>
    with SingleTickerProviderStateMixin {
  int _lastPendingCount = 0;
  late final AnimationController _bannerCtrl;
  bool _showNewOrderBanner = false;
  bool _alertScreenOpen = false;
  String? _initialPendingFingerprint;

  @override
  void initState() {
    super.initState();
    _bannerCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 480),
    );
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadOrders());
  }

  @override
  void dispose() {
    _bannerCtrl.dispose();
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

    if (_initialPendingFingerprint == null) {
      _initialPendingFingerprint = pending.map((o) => o.id).join('|');
      _lastPendingCount = currentPending;
      return;
    }

    if (currentPending > _lastPendingCount && !_alertScreenOpen && mounted) {
      final newest = pending.first;
      _alertScreenOpen = true;

      setState(() => _showNewOrderBanner = true);
      _bannerCtrl.forward(from: 0);
      Future.delayed(const Duration(seconds: 4), () {
        if (mounted) {
          _bannerCtrl.reverse().then((_) {
            if (mounted) setState(() => _showNewOrderBanner = false);
          });
        }
      });

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

  void _openTake(OrderModel order) {
    Navigator.push(
      context,
      PageRouteBuilder(
        transitionDuration: const Duration(milliseconds: 260),
        pageBuilder: (_, __, ___) =>
            OrderTakeScreen(order: order, arrivedAt: order.createdAt),
        transitionsBuilder: (_, anim, __, child) => FadeTransition(
          opacity: CurvedAnimation(parent: anim, curve: Curves.easeOut),
          child: SlideTransition(
            position: Tween<Offset>(
              begin: const Offset(0, 0.04),
              end: Offset.zero,
            ).animate(
                CurvedAnimation(parent: anim, curve: Curves.easeOutCubic)),
            child: child,
          ),
        ),
      ),
    );
  }

  void _openDetail(OrderModel order) {
    Navigator.push(
      context,
      PageRouteBuilder(
        transitionDuration: const Duration(milliseconds: 260),
        pageBuilder: (_, __, ___) => OrderDetailScreen(order: order),
        transitionsBuilder: (_, anim, __, child) => FadeTransition(
          opacity: CurvedAnimation(parent: anim, curve: Curves.easeOut),
          child: child,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Consumer<OrderProvider>(
        builder: (context, provider, _) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) _maybeFireNewOrderPulse(provider);
          });

          if (provider.isLoading && provider.orders.isEmpty) {
            return const Center(
              child: CircularProgressIndicator(color: AppTheme.brandGold),
            );
          }

          final activeOrders = [...provider.activeOrders]
            ..sort((a, b) => b.createdAt.compareTo(a.createdAt));

          return Stack(
            children: [
              RefreshIndicator(
                onRefresh: () async => provider.refresh(),
                color: AppTheme.brandGold,
                child: CustomScrollView(
                  physics: const ClampingScrollPhysics(),
                  slivers: [
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(20, 22, 20, 0),
                        child: _Header(
                          provider: provider,
                          isDark: isDark,
                          hasPending: provider.pendingOrders.isNotEmpty,
                        ),
                      ),
                    ),

                    if (provider.isOffline)
                      SliverToBoxAdapter(
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
                          child: _OfflineBanner(),
                        ),
                      ),

                    // Divider line under header
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(0, 22, 0, 0),
                        child: Container(
                          height: 1,
                          color: isDark
                              ? Colors.white.withOpacity(0.06)
                              : Colors.black.withOpacity(0.06),
                        ),
                      ),
                    ),

                    // ── NYA ORDER section ─────────────────────────────────
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(20, 22, 20, 14),
                        child: _SectionHeaderRow(
                          title: 'NYA ORDER',
                          count: provider.pendingOrders.length,
                          countColor: AppTheme.brandGold,
                          trailing: provider.pendingOrders.length > 3
                              ? const _LinkText(label: 'Visa alla')
                              : null,
                        ),
                      ),
                    ),

                    SliverToBoxAdapter(
                      child: provider.pendingOrders.isEmpty
                          ? const Padding(
                              padding: EdgeInsets.fromLTRB(20, 0, 20, 4),
                              child: _EmptyState(
                                icon: Icons.task_alt_rounded,
                                label: 'Inga nya ordrar',
                              ),
                            )
                          : SizedBox(
                              height: 196,
                              child: ListView.separated(
                                padding:
                                    const EdgeInsets.fromLTRB(20, 2, 20, 6),
                                scrollDirection: Axis.horizontal,
                                physics: const ClampingScrollPhysics(),
                                itemCount: provider.pendingOrders.length,
                                separatorBuilder: (_, __) =>
                                    const SizedBox(width: 12),
                                itemBuilder: (context, index) {
                                  final o = provider.pendingOrders[index];
                                  return NewOrderCard(
                                    order: o,
                                    onTap: () => _openTake(o),
                                  );
                                },
                              ),
                            ),
                    ),

                    // ── PÅGÅENDE ORDER section ───────────────────────────
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(20, 24, 20, 8),
                        child: _SectionHeaderRow(
                          title: 'PÅGÅENDE ORDER',
                          count: activeOrders.length,
                          countColor: AppTheme.brandGold,
                          trailing: activeOrders.isNotEmpty
                              ? const _FilterLink()
                              : null,
                        ),
                      ),
                    ),

                    if (activeOrders.isEmpty)
                      const SliverToBoxAdapter(
                        child: Padding(
                          padding: EdgeInsets.fromLTRB(20, 8, 20, 40),
                          child: _EmptyState(
                            icon: Icons.inbox_outlined,
                            label: 'Inga pågående ordrar',
                          ),
                        ),
                      )
                    else
                      SliverToBoxAdapter(
                        child: Container(
                          margin: const EdgeInsets.fromLTRB(20, 4, 20, 40),
                          decoration: BoxDecoration(
                            color: isDark ? AppTheme.deepSea : Colors.white,
                            borderRadius: BorderRadius.circular(18),
                            border: Border.all(
                              color: isDark
                                  ? Colors.white.withOpacity(0.08)
                                  : Colors.black.withOpacity(0.05),
                              width: 1,
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black
                                    .withOpacity(isDark ? 0.22 : 0.04),
                                blurRadius: 14,
                                offset: const Offset(0, 4),
                              ),
                            ],
                          ),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(18),
                            child: Column(
                              children: [
                                for (int i = 0; i < activeOrders.length; i++) ...[
                                  OrderListTile(
                                    order: activeOrders[i],
                                    onTap: () => _openDetail(activeOrders[i]),
                                  ),
                                  if (i < activeOrders.length - 1)
                                    Divider(
                                      height: 1,
                                      thickness: 1,
                                      indent: 78,
                                      endIndent: 0,
                                      color: isDark
                                          ? Colors.white.withOpacity(0.06)
                                          : Colors.black.withOpacity(0.05),
                                    ),
                                ],
                              ],
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),

              if (_showNewOrderBanner)
                Positioned(
                  top: 12,
                  left: 16,
                  right: 16,
                  child: _NewOrderBanner(
                    controller: _bannerCtrl,
                    count: provider.pendingOrders.length,
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

// ── Header ────────────────────────────────────────────────────────────────────
class _Header extends StatelessWidget {
  final OrderProvider provider;
  final bool isDark;
  final bool hasPending;

  const _Header({
    required this.provider,
    required this.isDark,
    required this.hasPending,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Order',
                style: TextStyle(
                  fontSize: 34,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -1.0,
                  height: 1.0,
                  color: isDark ? Colors.white : AppTheme.ink,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Hantera inkommande ordrar',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: isDark
                      ? Colors.white.withOpacity(0.50)
                      : AppTheme.mutedInk,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        GestureDetector(
          onTap: () => _showStatusPicker(context, provider),
          child: _StatusChip(open: provider.isRestaurantOpen, isDark: isDark),
        ),
        const SizedBox(width: 8),
        _BellButton(
          hasPending: hasPending,
          isDark: isDark,
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
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(12),
        child: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: AppTheme.panelColor(ctx),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: AppTheme.isDark(ctx)
                  ? Colors.white.withOpacity(0.10)
                  : AppTheme.ink.withOpacity(0.10),
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              _StatusTile(
                title: 'Öppet',
                subtitle: 'Tar emot beställningar',
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
                subtitle: 'Tar inte emot beställningar',
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
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final bool open;
  final bool isDark;
  const _StatusChip({required this.open, required this.isDark});

  @override
  Widget build(BuildContext context) {
    final color = open ? AppTheme.success : AppTheme.danger;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: color.withOpacity(isDark ? 0.15 : 0.10),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 5),
          Text(
            open ? 'Öppet' : 'Stängt',
            style: TextStyle(
              color: color,
              fontWeight: FontWeight.w900,
              fontSize: 11,
            ),
          ),
        ],
      ),
    );
  }
}

class _BellButton extends StatelessWidget {
  final bool hasPending;
  final bool isDark;
  final VoidCallback onTap;

  const _BellButton({
    required this.hasPending,
    required this.isDark,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          SizedBox(
            width: 38,
            height: 38,
            child: Icon(
              Icons.notifications_none_rounded,
              size: 30,
              color: isDark ? Colors.white : AppTheme.ink,
            ),
          ),
          if (hasPending)
            Positioned(
              top: 4,
              right: 4,
              child: Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  color: AppTheme.brandGold,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: isDark ? AppTheme.deepSea : const Color(0xFFFAFAFA),
                    width: 1.5,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ── Section header row ────────────────────────────────────────────────────────
class _SectionHeaderRow extends StatelessWidget {
  final String title;
  final int count;
  final Color countColor;
  final Widget? trailing;

  const _SectionHeaderRow({
    required this.title,
    required this.count,
    required this.countColor,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    return Row(
      children: [
        Text(
          title,
          style: TextStyle(
            color: isDark ? Colors.white.withOpacity(0.85) : AppTheme.ink,
            fontSize: 13,
            fontWeight: FontWeight.w900,
            letterSpacing: 1.6,
          ),
        ),
        const SizedBox(width: 10),
        Container(
          width: 22,
          height: 22,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: countColor,
            shape: BoxShape.circle,
          ),
          child: Text(
            '$count',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 12,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
        const Spacer(),
        if (trailing != null) trailing!,
      ],
    );
  }
}

class _LinkText extends StatelessWidget {
  final String label;
  const _LinkText({required this.label});

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: isDark
                ? Colors.white.withOpacity(0.55)
                : AppTheme.mutedInk,
          ),
        ),
        const SizedBox(width: 4),
        Icon(
          Icons.chevron_right_rounded,
          size: 18,
          color: isDark
              ? Colors.white.withOpacity(0.55)
              : AppTheme.mutedInk,
        ),
      ],
    );
  }
}

class _FilterLink extends StatelessWidget {
  const _FilterLink();

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          Icons.filter_alt_outlined,
          size: 16,
          color: isDark ? Colors.white.withOpacity(0.55) : AppTheme.mutedInk,
        ),
        const SizedBox(width: 5),
        Text(
          'Filtrera',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: isDark
                ? Colors.white.withOpacity(0.55)
                : AppTheme.mutedInk,
          ),
        ),
      ],
    );
  }
}

class _EmptyState extends StatelessWidget {
  final IconData icon;
  final String label;
  const _EmptyState({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 20),
      child: Row(
        children: [
          Icon(
            icon,
            size: 18,
            color: isDark
                ? Colors.white.withOpacity(0.22)
                : AppTheme.ink.withOpacity(0.20),
          ),
          const SizedBox(width: 10),
          Text(
            label,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: isDark
                  ? Colors.white.withOpacity(0.30)
                  : AppTheme.ink.withOpacity(0.30),
            ),
          ),
        ],
      ),
    );
  }
}

class _OfflineBanner extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      decoration: BoxDecoration(
        color: AppTheme.danger.withOpacity(0.10),
        borderRadius: BorderRadius.circular(12),
        border:
            Border.all(color: AppTheme.danger.withOpacity(0.45), width: 1.2),
      ),
      child: const Row(
        children: [
          Icon(Icons.wifi_off_rounded, color: AppTheme.danger, size: 16),
          SizedBox(width: 8),
          Text(
            'Ingen uppkoppling · arbetar offline',
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

class _StatusTile extends StatelessWidget {
  final String title;
  final String subtitle;
  final bool selected;
  final Color color;
  final IconData icon;
  final VoidCallback onTap;

  const _StatusTile({
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.color,
    required this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: selected ? color.withOpacity(0.10) : Colors.transparent,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected
                ? color.withOpacity(0.45)
                : AppTheme.borderColor(context),
            width: 1.3,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: color.withOpacity(0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: const TextStyle(
                          fontWeight: FontWeight.w900, fontSize: 15)),
                  Text(subtitle,
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 12,
                        color: AppTheme.mutedColor(context),
                      )),
                ],
              ),
            ),
            Icon(
              selected
                  ? Icons.check_circle_rounded
                  : Icons.radio_button_unchecked,
              color: selected ? color : AppTheme.mutedColor(context),
              size: 22,
            ),
          ],
        ),
      ),
    );
  }
}

class _NewOrderBanner extends StatelessWidget {
  final AnimationController controller;
  final int count;
  const _NewOrderBanner({required this.controller, required this.count});

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: CurvedAnimation(parent: controller, curve: Curves.easeOut),
      child: SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0, -1.2),
          end: Offset.zero,
        ).animate(
          CurvedAnimation(parent: controller, curve: Curves.easeOutCubic),
        ),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [AppTheme.brandGold, AppTheme.brandGoldSoft],
            ),
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: AppTheme.brandGold.withOpacity(0.40),
                blurRadius: 18,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.notifications_active_rounded,
                  color: Colors.white, size: 18),
              const SizedBox(width: 8),
              Text(
                count > 1
                    ? '$count nya ordrar inkommen!'
                    : 'Ny order inkommen!',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 15,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0.1,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
