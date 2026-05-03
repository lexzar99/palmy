import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/log_service.dart';
import '../core/print_service.dart';
import '../core/theme.dart';
import '../models/order_model.dart';
import '../providers/auth_provider.dart';
import '../providers/order_provider.dart';
import '../widgets/order_card.dart';
import '../main.dart' show triggerSleep;
import 'new_order_alert_screen.dart';
import 'order_detail_screen.dart';
import 'order_take_screen.dart';
import 'print_settings_screen.dart';

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
  StreamSubscription<PrintFailure>? _printErrorSub;

  @override
  void initState() {
    super.initState();
    _bannerCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 480),
    );
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadOrders());
    _printErrorSub = PrintService.errors.listen(_handlePrintFailure);
  }

  @override
  void dispose() {
    _bannerCtrl.dispose();
    _printErrorSub?.cancel();
    super.dispose();
  }

  void _handlePrintFailure(PrintFailure failure) {
    if (!mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
      SnackBar(
        backgroundColor: AppTheme.danger,
        duration: const Duration(seconds: 6),
        behavior: SnackBarBehavior.floating,
        content: Row(
          children: [
            const Icon(Icons.print_disabled_rounded, color: Colors.white),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Order #${failure.orderNumber} ej utskriven',
                    style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w900,
                        fontSize: 14),
                  ),
                  Text(
                    failure.reason,
                    style: const TextStyle(
                        color: Colors.white, fontSize: 12),
                  ),
                ],
              ),
            ),
          ],
        ),
        action: SnackBarAction(
          label: 'FIXA',
          textColor: Colors.white,
          onPressed: () => Navigator.push(
            context,
            MaterialPageRoute(
                builder: (_) => const PrintSettingsScreen()),
          ),
        ),
      ),
    );
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
    final dividerColor = isDark
        ? Colors.white.withOpacity(0.06)
        : const Color(0xFFE8E8E8);

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

          return Stack(
            children: [
              RefreshIndicator(
                onRefresh: () async => provider.refresh(),
                color: AppTheme.brandGold,
                edgeOffset: 0,
                displacement: 60,
                child: CustomScrollView(
                  physics: const AlwaysScrollableScrollPhysics(
                    parent: ClampingScrollPhysics(),
                  ),
                  slivers: [
                    // ── Header ──────────────────────────────────────────
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
                        child: Container(height: 1, color: dividerColor),
                      ),
                    ),

                    // ── NYA ORDER section header ─────────────────────────
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(20, 22, 20, 14),
                        child: _SectionHeaderRow(
                          title: 'NYA ORDER',
                          countBadge: provider.pendingOrders.isNotEmpty
                              ? provider.pendingOrders.length
                              : null,
                          trailing: provider.pendingOrders.isNotEmpty
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
                              height: 200,
                              child: ListView.separated(
                                padding:
                                    const EdgeInsets.fromLTRB(20, 4, 20, 8),
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

                    // ── FÖREGÅENDE ORDRAR section header ───────────────
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(20, 28, 20, 6),
                        child: const _SectionHeaderRow(
                          title: 'FÖREGÅENDE ORDRAR',
                          countBadge: null,
                          trailing: null,
                        ),
                      ),
                    ),

                    if (provider.recentOrders.isEmpty)
                      const SliverToBoxAdapter(
                        child: Padding(
                          padding: EdgeInsets.fromLTRB(20, 8, 20, 40),
                          child: _EmptyState(
                            icon: Icons.inbox_outlined,
                            label: 'Inga ordrar ännu idag',
                          ),
                        ),
                      )
                    else
                      SliverPadding(
                        padding: const EdgeInsets.fromLTRB(20, 4, 20, 40),
                        sliver: SliverList.builder(
                          itemCount: provider.recentOrders.length * 2 - 1,
                          itemBuilder: (context, i) {
                            if (i.isOdd) {
                              return Container(
                                height: 1,
                                margin: const EdgeInsets.only(left: 66),
                                color: dividerColor,
                              );
                            }
                            final o = provider.recentOrders[i ~/ 2];
                            return OrderListTile(
                              order: o,
                              onTap: () => _openDetail(o),
                            );
                          },
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
    final isOpen = provider.isRestaurantOpen;
    final statusColor = isOpen ? AppTheme.success : AppTheme.danger;
    final statusLabel = isOpen ? 'ÖPPET' : 'STÄNGD';
    final title = isOpen ? 'Order' : 'Stängd';
    final subtitle = isOpen
        ? 'Hantera inkommande ordrar'
        : 'Ni är utanför era öppettider.';

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  fontSize: 36,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -1.2,
                  height: 1.0,
                  color: isDark ? Colors.white : AppTheme.ink,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                subtitle,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: isDark
                      ? Colors.white.withOpacity(0.50)
                      : const Color(0xFF8E8E93),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 10),
        // Big circular STÄNGD/ÖPPET status button (matchar mockup)
        _StatusButton(
          isOpen: isOpen,
          label: statusLabel,
          color: statusColor,
          onTap: () => _showStatusPicker(context, provider),
        ),
        const SizedBox(width: 6),
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
              Padding(
                padding: const EdgeInsets.fromLTRB(8, 6, 8, 12),
                child: Row(
                  children: [
                    Text(
                      'Restaurangstatus',
                      style: TextStyle(
                        color: AppTheme.isDark(ctx)
                            ? Colors.white
                            : AppTheme.ink,
                        fontSize: 16,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    const Spacer(),
                    GestureDetector(
                      onTap: () => Navigator.pop(ctx),
                      child: Icon(Icons.close_rounded,
                          size: 22,
                          color: AppTheme.mutedColor(ctx)),
                    ),
                  ],
                ),
              ),
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
                title: 'Pausa i 30 min',
                subtitle: 'Tillfällig paus — viloläge med nedräkning',
                selected: provider.isPaused,
                color: AppTheme.warning,
                icon: Icons.pause_circle_outline_rounded,
                onTap: () async {
                  Navigator.pop(ctx);
                  await provider.pauseFor(30);
                  // Direkt in i viloläget med countdown
                  triggerSleep();
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

class _StatusButton extends StatelessWidget {
  final bool isOpen;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _StatusButton({
    required this.isOpen,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: color.withOpacity(0.12),
          borderRadius: BorderRadius.circular(28),
          border: Border.all(color: color.withOpacity(0.35), width: 1.4),
          boxShadow: [
            BoxShadow(
              color: color.withOpacity(0.18),
              blurRadius: 14,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Levande pulserande dot
            Container(
              width: 9,
              height: 9,
              decoration: BoxDecoration(
                color: color,
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: color.withOpacity(0.55),
                    blurRadius: 6,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 9),
            Text(
              label,
              style: TextStyle(
                color: color,
                fontSize: 12,
                fontWeight: FontWeight.w900,
                letterSpacing: 1.2,
              ),
            ),
            const SizedBox(width: 4),
            Icon(Icons.expand_more_rounded, color: color, size: 16),
          ],
        ),
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
      child: SizedBox(
        width: 44,
        height: 44,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Center(
              child: Icon(
                Icons.notifications_none_rounded,
                size: 30,
                color: isDark ? Colors.white : AppTheme.ink,
              ),
            ),
            if (hasPending)
              Positioned(
                top: 8,
                right: 8,
                child: Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: AppTheme.brandGold,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: isDark
                          ? AppTheme.deepSea
                          : const Color(0xFFF4F4F4),
                      width: 1.5,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// ── Section header row ────────────────────────────────────────────────────────
class _SectionHeaderRow extends StatelessWidget {
  final String title;
  final int? countBadge;
  final Widget? trailing;

  const _SectionHeaderRow({
    required this.title,
    required this.countBadge,
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
            color: isDark ? Colors.white : AppTheme.ink,
            fontSize: 14,
            fontWeight: FontWeight.w900,
            letterSpacing: 1.6,
          ),
        ),
        if (countBadge != null) ...[
          const SizedBox(width: 10),
          Container(
            width: 24,
            height: 24,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: AppTheme.brandGold,
              shape: BoxShape.circle,
            ),
            child: Text(
              '$countBadge',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 13,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
        ],
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
    final color = isDark
        ? Colors.white.withOpacity(0.55)
        : const Color(0xFF8E8E93);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w500,
            color: color,
          ),
        ),
        const SizedBox(width: 4),
        Icon(Icons.chevron_right_rounded, size: 18, color: color),
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
      padding: const EdgeInsets.symmetric(vertical: 24),
      child: Row(
        children: [
          Icon(
            icon,
            size: 18,
            color: isDark
                ? Colors.white.withOpacity(0.22)
                : AppTheme.ink.withOpacity(0.22),
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
