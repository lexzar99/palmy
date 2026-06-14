import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
import 'printer_help_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen>
    with SingleTickerProviderStateMixin {
  final Set<String> _seenPendingIds = {};
  bool _initializedPending = false;
  late final AnimationController _bannerCtrl;
  bool _showNewOrderBanner = false;
  bool _alertScreenOpen = false;
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
    // Längre duration (10s) ger personalen tid att läsa felet och välja
    // mellan HJÄLP (steg-för-steg) och FIXA (inställningar). Innan retry-
    // logiken introducerades hade SnackBaren 6s — men nu rapporterar vi
    // bara efter två auto-försök, så fel som visas är värda mer uppmärksamhet.
    messenger.showSnackBar(
      SnackBar(
        backgroundColor: AppTheme.danger,
        duration: const Duration(seconds: 10),
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
                        fontWeight: FontWeight.w700,
                        fontSize: 14),
                  ),
                  Text(
                    '${failure.reason} (efter 2 försök)',
                    style: const TextStyle(color: Colors.white, fontSize: 12),
                  ),
                  if (failure.troubleshootingSteps.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      '→ ${failure.troubleshootingSteps.first}',
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11.5,
                          fontStyle: FontStyle.italic),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
        action: SnackBarAction(
          label: 'HJÄLP',
          textColor: Colors.white,
          onPressed: () => Navigator.push(
            context,
            MaterialPageRoute(
              builder: (_) =>
                  PrinterHelpScreen(focusCategory: failure.category),
            ),
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

    if (!_initializedPending) {
      _seenPendingIds.addAll(pending.map((o) => o.id));
      _initializedPending = true;
      return;
    }

    final newOrders =
        pending.where((o) => !_seenPendingIds.contains(o.id)).toList();
    _seenPendingIds.addAll(pending.map((o) => o.id));

    if (newOrders.isNotEmpty && !_alertScreenOpen && mounted) {
      final newest = newOrders.first;
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

      Navigator.of(context)
          .push(
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
      )
          .whenComplete(() {
        _alertScreenOpen = false;
      });
    }
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
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Consumer<OrderProvider>(
        builder: (context, provider, _) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) _maybeFireNewOrderPulse(provider);
          });

          if (provider.isLoading && provider.orders.isEmpty) {
            return const Center(
              child: CircularProgressIndicator(color: AppTheme.ember),
            );
          }

          final pending = provider.pendingOrders;
          final recent = provider.recentOrders;

          return Stack(
            children: [
              RefreshIndicator(
                onRefresh: () async => provider.refresh(),
                color: AppTheme.ember,
                edgeOffset: 0,
                displacement: 80,
                child: CustomScrollView(
                  physics: const AlwaysScrollableScrollPhysics(
                    parent: ClampingScrollPhysics(),
                  ),
                  slivers: [
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
                      sliver: SliverToBoxAdapter(
                        child: _EditorialHeader(
                          provider: provider,
                          onStatusTap: () =>
                              _showStatusPicker(context, provider),
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
                    // ── NYA ORDRAR — kompakt rubrik + horisontell kort-rad ──
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
                        child: _PendingHeader(count: pending.length),
                      ),
                    ),
                    if (pending.isEmpty)
                      const SliverToBoxAdapter(
                        child: Padding(
                          padding: EdgeInsets.fromLTRB(20, 12, 20, 8),
                          child: _RestingState(),
                        ),
                      )
                    else
                      SliverToBoxAdapter(
                        child: Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: SizedBox(
                            height: 172,
                            child: ListView.separated(
                              scrollDirection: Axis.horizontal,
                              physics: const BouncingScrollPhysics(),
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 20),
                              itemCount: pending.length,
                              separatorBuilder: (_, __) =>
                                  const SizedBox(width: 12),
                              itemBuilder: (context, i) => NewOrderSquareCard(
                                order: pending[i],
                                onTap: () => _openTake(pending[i]),
                              ),
                            ),
                          ),
                        ),
                      ),

                    // ── FÖREGÅENDE ──────────────────────────────────────
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(20, 32, 20, 8),
                      sliver: SliverToBoxAdapter(
                        child: _RecentHeader(count: recent.length),
                      ),
                    ),

                    if (recent.isEmpty)
                      const SliverToBoxAdapter(
                        child: Padding(
                          padding: EdgeInsets.fromLTRB(20, 4, 20, 24),
                          child: _EmptyHistory(),
                        ),
                      )
                    else
                      SliverPadding(
                        padding: const EdgeInsets.fromLTRB(20, 6, 20, 140),
                        sliver: SliverList.builder(
                          itemCount: recent.length,
                          itemBuilder: (context, i) {
                            final o = recent[i];
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 2),
                              child: OrderListTile(
                                order: o,
                                onTap: () => _openDetail(o),
                                // Inline "På väg"/"Klar"-knapp för accepterade
                                // ordrar — slipper klicka in på detail-skärmen.
                                // Uppdaterar status direkt via provider och
                                // tar tag i haptic-feedback för bekräftelse.
                                onAdvance: (nextStatus) async {
                                  HapticFeedback.mediumImpact();
                                  await provider.updateStatus(o.id, nextStatus);
                                },
                              ),
                            );
                          },
                        ),
                      ),
                  ],
                ),
              ),
              if (_showNewOrderBanner)
                Positioned(
                  top: 14,
                  left: 20,
                  right: 20,
                  child: _NewOrderBanner(
                    controller: _bannerCtrl,
                    count: pending.length,
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  void _showStatusPicker(BuildContext context, OrderProvider provider) {
    logger.log('TAP: Open restaurant status picker');
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(14),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppTheme.panelColor(ctx),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: AppTheme.borderColor(ctx)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(8, 8, 8, 18),
                child: Row(
                  children: [
                    Text(
                      'Restaurangstatus',
                      style: TextStyle(
                        color:
                            AppTheme.isDark(ctx) ? Colors.white : AppTheme.ink,
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.2,
                      ),
                    ),
                    const Spacer(),
                    GestureDetector(
                      onTap: () => Navigator.pop(ctx),
                      child: Icon(Icons.close_rounded,
                          size: 22, color: AppTheme.mutedColor(ctx)),
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
                  if (provider.isPaused) {
                    await provider.cancelPause();
                  } else if (!provider.isRestaurantOpen) {
                    await provider.setStatus(true);
                  }
                },
              ),
              const SizedBox(height: 10),
              _StatusTile(
                title: 'Pausa i 30 min',
                subtitle: 'Tillfällig paus — viloläge med nedräkning',
                selected: provider.isPaused,
                color: AppTheme.warning,
                icon: Icons.pause_circle_outline_rounded,
                onTap: () async {
                  Navigator.pop(ctx);
                  await provider.pauseFor(30);
                  triggerSleep();
                },
              ),
              const SizedBox(height: 10),
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
              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Editorial header ─────────────────────────────────────────────────────────
class _EditorialHeader extends StatelessWidget {
  final OrderProvider provider;
  final VoidCallback onStatusTap;

  const _EditorialHeader({
    required this.provider,
    required this.onStatusTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final auth = Provider.of<AuthProvider>(context, listen: false);
    final isOpen = provider.isRestaurantOpen;
    final statusColor = isOpen ? AppTheme.success : AppTheme.danger;
    final statusLabel = isOpen ? 'Öppet' : 'Stängd';

    // Visa endast restaurangnamnet — kontonamnet har ofta ett " Admin"-suffix
    // (t.ex. "Palmyra Pizzeria Admin") som inte hör hemma i headern.
    var restName = (auth.user?['name'] ?? 'Delivera').toString().trim();
    restName = restName
        .replaceAll(RegExp(r'\s+admin$', caseSensitive: false), '')
        .trim();
    if (restName.isEmpty) restName = 'Delivera';

    // Header-bar på en ren rad: liten klocka, restaurangnamn (krymper för att
    // passa) och öppet/stäng-knappen i nivå till höger. Inget datum.
    return Row(
      children: [
        _BellButton(
          hasPending: provider.pendingOrders.isNotEmpty,
          onTap: provider.testAlarm,
        ),
        const SizedBox(width: 12),
        Expanded(
          child: FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              restName,
              maxLines: 1,
              softWrap: false,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 23,
                fontWeight: FontWeight.w900,
                height: 1.0,
                letterSpacing: -0.8,
                color: isDark ? Colors.white : AppTheme.ink,
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        _StatusButton(
          color: statusColor,
          label: statusLabel,
          isPaused: provider.isPaused,
          onTap: onStatusTap,
        ),
      ],
    );
  }
}

class _StatusButton extends StatelessWidget {
  final Color color;
  final String label;
  final bool isPaused;
  final VoidCallback onTap;

  const _StatusButton({
    required this.color,
    required this.label,
    required this.isPaused,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.fromLTRB(12, 9, 12, 9),
          decoration: BoxDecoration(
            color: color.withOpacity(isDark ? 0.16 : 0.12),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: color.withOpacity(0.35), width: 1),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 9,
                height: 9,
                decoration: BoxDecoration(
                  color: color,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: color.withOpacity(0.45),
                      blurRadius: 6,
                      spreadRadius: 1,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 9),
              Text(
                isPaused ? 'Pausad' : label,
                style: TextStyle(
                  color: color,
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.1,
                ),
              ),
              const SizedBox(width: 4),
              Icon(Icons.expand_more_rounded, color: color, size: 17),
            ],
          ),
        ),
      ),
    );
  }
}

class _BellButton extends StatelessWidget {
  final bool hasPending;
  final VoidCallback onTap;

  const _BellButton({required this.hasPending, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            color: AppTheme.faintColor(context),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: AppTheme.borderColor(context),
              width: 1,
            ),
          ),
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Center(
                child: Icon(
                  Icons.notifications_none_rounded,
                  size: 20,
                  color: isDark ? Colors.white : AppTheme.ink,
                ),
              ),
              if (hasPending)
                Positioned(
                  top: 8,
                  right: 9,
                  child: Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: AppTheme.ember,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: isDark ? AppTheme.deepSea : AppTheme.paper,
                        width: 1.5,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Pending header — eyebrow + giant counter ─────────────────────────────────
class _PendingHeader extends StatelessWidget {
  final int count;
  const _PendingHeader({required this.count});

  @override
  Widget build(BuildContext context) {
    final accent = AppTheme.ember;
    final hasOrders = count > 0;

    // Kompakt rubrik: antalet ligger bredvid texten (inte under) som en pill.
    return Row(
      children: [
        Text(
          'NYA ORDRAR',
          style: TextStyle(
            color: AppTheme.mutedColor(context),
            fontSize: 12,
            fontWeight: FontWeight.w900,
            letterSpacing: 1.2,
          ),
        ),
        const SizedBox(width: 10),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
          decoration: BoxDecoration(
            color: hasOrders
                ? accent
                : AppTheme.mutedColor(context).withOpacity(0.16),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            '$count',
            style: TextStyle(
              color: hasOrders ? AppTheme.ink : AppTheme.mutedColor(context),
              fontSize: 13,
              fontWeight: FontWeight.w900,
            ),
          ),
        ),
      ],
    );
  }
}

class _RestingState extends StatelessWidget {
  const _RestingState();

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    // Enkel, flat vilolägesrad — ingen färgad chip, ingen extra rad.
    return Container(
      margin: const EdgeInsets.fromLTRB(0, 14, 0, 4),
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 20),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.borderColor(context), width: 1),
      ),
      child: Row(
        children: [
          Icon(
            Icons.check_circle_outline_rounded,
            color: AppTheme.mutedColor(context),
            size: 22,
          ),
          const SizedBox(width: 12),
          Text(
            'Inga väntande ordrar',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: isDark ? Colors.white : AppTheme.ink,
            ),
          ),
        ],
      ),
    );
  }
}

class _RecentHeader extends StatelessWidget {
  final int count;
  const _RecentHeader({required this.count});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(
          'Föregående ordrar',
          style: TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.5,
            color: AppTheme.isDark(context) ? Colors.white : AppTheme.ink,
          ),
        ),
        const SizedBox(width: 10),
        if (count > 0)
          Padding(
            padding: const EdgeInsets.only(bottom: 5),
            child: Text(
              '$count',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: AppTheme.mutedColor(context),
              ),
            ),
          ),
      ],
    );
  }
}

class _EmptyHistory extends StatelessWidget {
  const _EmptyHistory();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 28),
      child: Row(
        children: [
          Icon(
            Icons.inbox_outlined,
            size: 18,
            color: AppTheme.mutedColor(context).withOpacity(0.5),
          ),
          const SizedBox(width: 10),
          Text(
            'Inga ordrar idag ännu',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: AppTheme.mutedColor(context).withOpacity(0.7),
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
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppTheme.danger.withOpacity(0.10),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.danger.withOpacity(0.40), width: 1),
      ),
      child: const Row(
        children: [
          Icon(Icons.wifi_off_rounded, color: AppTheme.danger, size: 16),
          SizedBox(width: 10),
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
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: selected ? color.withOpacity(0.10) : Colors.transparent,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected
                  ? color.withOpacity(0.35)
                  : AppTheme.borderColor(context),
              width: 1,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: color.withOpacity(0.14),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: color, size: 18),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: TextStyle(
                        fontWeight: FontWeight.w500,
                        fontSize: 12.5,
                        color: AppTheme.mutedColor(context),
                      ),
                    ),
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
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
          decoration: BoxDecoration(
            color: AppTheme.ember,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: AppTheme.ember.withOpacity(0.4),
                blurRadius: 18,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.notifications_active_rounded,
                  color: AppTheme.ink, size: 18),
              const SizedBox(width: 10),
              Text(
                count > 1 ? '$count nya ordrar inkomna' : 'Ny order inkommen',
                style: const TextStyle(
                  color: AppTheme.ink,
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.2,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
