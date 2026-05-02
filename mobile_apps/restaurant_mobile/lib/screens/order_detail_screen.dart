import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/audio_helper.dart';
import '../core/order_ui.dart';
import '../core/print_service.dart';
import '../core/theme.dart';
import '../models/order_model.dart';
import '../providers/order_provider.dart';
import '../widgets/app_ui.dart';

class OrderDetailScreen extends StatefulWidget {
  final OrderModel order;

  const OrderDetailScreen({super.key, required this.order});

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen>
    with SingleTickerProviderStateMixin {
  late OrderModel order;
  late final AnimationController _pulseController;
  Timer? _overdueTimer;

  @override
  void initState() {
    super.initState();
    order = widget.order;
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    )..repeat(reverse: true);
    _startOverdueCheck();
  }

  @override
  void dispose() {
    _overdueTimer?.cancel();
    _pulseController.dispose();
    super.dispose();
  }

  void _startOverdueCheck() {
    _overdueTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      if (_checkIfOverdue()) {
        AudioHelper.playAudio('notification.mp3');
      }
      if (mounted) setState(() {});
    });
  }

  bool _checkIfOverdue() {
    if (order.estimatedTime == null) return false;
    if (const {'DELIVERING', 'DELIVERED', 'CANCELLED', 'REJECTED'}
        .contains(order.status)) {
      return false;
    }

    final baseTime = order.scheduledFor != null &&
            order.scheduledFor!.isAfter(order.createdAt)
        ? order.scheduledFor!
        : order.createdAt;
    final deadline = baseTime.add(Duration(minutes: order.estimatedTime! + 20));
    return DateTime.now().isAfter(deadline);
  }

  Future<void> _acceptScheduledOrder() async {
    final provider = Provider.of<OrderProvider>(context, listen: false);
    final ok = await provider.updateStatus(order.id, 'ACCEPTED');
    if (!ok || !mounted) return;

    setState(() {
      order = order.copyWith(status: 'ACCEPTED');
    });
  }

  void _showAcceptDialog() {
    var selectedMinutes = 40;
    const minuteOptions = [
      5,
      10,
      15,
      20,
      25,
      30,
      35,
      40,
      45,
      50,
      55,
      60,
      70,
      80,
      90
    ];
    const optionWidth = 72.0;
    const optionSpacing = 10.0;
    final initialIndex = minuteOptions.indexOf(selectedMinutes);
    final scrollController = ScrollController(
      initialScrollOffset:
          initialIndex <= 0 ? 0 : initialIndex * (optionWidth + optionSpacing),
    );

    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: const EdgeInsets.all(16),
              child: AppPanel(
                padding: const EdgeInsets.all(22),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Tid',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 14),
                    SizedBox(
                      height: 68,
                      child: ListView.separated(
                        controller: scrollController,
                        scrollDirection: Axis.horizontal,
                        physics: const BouncingScrollPhysics(),
                        itemCount: minuteOptions.length,
                        separatorBuilder: (_, __) => const SizedBox(width: 10),
                        itemBuilder: (context, index) {
                          final minutes = minuteOptions[index];
                          final selected = minutes == selectedMinutes;
                          return GestureDetector(
                            onTap: () {
                              setModalState(() => selectedMinutes = minutes);
                            },
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 180),
                              width: 72,
                              decoration: BoxDecoration(
                                color: selected
                                    ? Theme.of(context).colorScheme.primary
                                    : Theme.of(context).colorScheme.surface,
                                borderRadius: BorderRadius.circular(18),
                                border: Border.all(
                                  color: selected
                                      ? Theme.of(context).colorScheme.primary
                                      : AppTheme.borderColor(context),
                                ),
                              ),
                              child: Center(
                                child: Text(
                                  '$minutes',
                                  style: Theme.of(context)
                                      .textTheme
                                      .titleMedium
                                      ?.copyWith(
                                        color: selected
                                            ? Theme.of(context)
                                                .colorScheme
                                                .onPrimary
                                            : Theme.of(context)
                                                .textTheme
                                                .titleMedium
                                                ?.color,
                                        fontWeight: FontWeight.w900,
                                      ),
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                    const SizedBox(height: 18),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () => Navigator.pop(context),
                            child: const Text('Avbryt'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: ElevatedButton(
                            onPressed: () async {
                              Navigator.pop(context);
                              final provider = Provider.of<OrderProvider>(
                                  this.context,
                                  listen: false);
                              final ok = await provider.updateStatus(
                                order.id,
                                'PREPARING',
                                estimatedTime: selectedMinutes,
                              );
                              if (!ok || !mounted) return;
                              setState(() {
                                order = order.copyWith(
                                  status: 'PREPARING',
                                  estimatedTime: selectedMinutes,
                                );
                              });
                            },
                            child: const Text('Godkänn order'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    ).whenComplete(scrollController.dispose);
  }

  @override
  Widget build(BuildContext context) {
    final accent = OrderUi.typeColor(order.type);
    final statusColor = OrderUi.statusColor(order.status);
    final isOverdue = _checkIfOverdue();

    return Scaffold(
      extendBody: true,
      backgroundColor: Colors.transparent,
      body: AppBackdrop(
        child: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 16, 0),
                child: Row(
                  children: [
                    IconButton(
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(Icons.arrow_back_rounded),
                    ),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Order #${order.orderNumber}',
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            OrderUi.formatDateTime(order.createdAt),
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    AppPill(
                      label: OrderUi.statusLabel(order.status),
                      color: statusColor,
                    ),
                    const SizedBox(width: 8),
                    IconButton(
                      onPressed: () => PrintService.printReceipt(order),
                      icon: const Icon(Icons.print_outlined),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
                  children: [
                    AnimatedBuilder(
                      animation: _pulseController,
                      builder: (context, child) {
                        return Container(
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(32),
                            boxShadow: isOverdue
                                ? [
                                    BoxShadow(
                                      color: Colors.red.withOpacity(
                                        0.18 + (_pulseController.value * 0.22),
                                      ),
                                      blurRadius: 26,
                                      spreadRadius: 2,
                                    ),
                                  ]
                                : null,
                          ),
                          child: child,
                        );
                      },
                      child: AppPanel(
                        tint: isOverdue ? Colors.red : accent,
                        gradient: LinearGradient(
                          colors: [
                            accent.withOpacity(0.12),
                            AppTheme.panelColor(context),
                          ],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                AppPill(
                                  label: OrderUi.typeLabel(order.type),
                                  color: accent,
                                  icon: OrderUi.typeIcon(order.type),
                                ),
                                const SizedBox(width: 10),
                                if (order.scheduledFor != null)
                                  AppPill(
                                    label:
                                        'Förbeställd ${OrderUi.formatTime(order.scheduledFor!)}',
                                    color: AppTheme.gold,
                                  ),
                                const Spacer(),
                                Text(
                                  OrderUi.formatCurrency(order.total),
                                  style: Theme.of(context)
                                      .textTheme
                                      .headlineMedium
                                      ?.copyWith(
                                        color: accent,
                                      ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 18),
                            Text(
                              order.customerName,
                              style: Theme.of(context).textTheme.headlineMedium,
                            ),
                            const SizedBox(height: 8),
                            Text(
                              order.customerPhone,
                              style: Theme.of(context)
                                  .textTheme
                                  .titleMedium
                                  ?.copyWith(
                                    color: accent,
                                  ),
                            ),
                            if (order.type == 'DELIVERY' &&
                                order.deliveryStreet != null) ...[
                              const SizedBox(height: 12),
                              Text(
                                '${order.deliveryStreet}, ${order.deliveryZip ?? ''} ${order.deliveryCity ?? ''}'
                                    .trim(),
                                style: Theme.of(context).textTheme.bodyMedium,
                              ),
                            ],
                            if (isOverdue) ...[
                              const SizedBox(height: 16),
                              AppPanel(
                                padding: const EdgeInsets.all(14),
                                tint: Colors.red,
                                color: Colors.red.withOpacity(0.12),
                                child: Row(
                                  children: [
                                    const Icon(Icons.warning_amber_rounded,
                                        color: Colors.red),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Text(
                                        'Ordern ligger efter uppskattad tid. Kolla status och informera teamet vid behov.',
                                        style: Theme.of(context)
                                            .textTheme
                                            .bodyMedium
                                            ?.copyWith(color: Colors.red),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                    if (order.scheduledFor != null) ...[
                      const SizedBox(height: 16),
                      AppPanel(
                        tint: AppTheme.gold,
                        child: Row(
                          children: [
                            Container(
                              width: 52,
                              height: 52,
                              decoration: BoxDecoration(
                                color: AppTheme.gold.withOpacity(0.14),
                                borderRadius: BorderRadius.circular(18),
                              ),
                              child: const Icon(Icons.schedule_rounded,
                                  color: AppTheme.gold),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Förbeställning',
                                    style:
                                        Theme.of(context).textTheme.titleMedium,
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    OrderUi.scheduledLabel(order),
                                    style:
                                        Theme.of(context).textTheme.bodyMedium,
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    if (_hasNotesOrAlerts) ...[
                      const SizedBox(height: 16),
                      AppPanel(
                        tint: AppTheme.warning,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Noteringar och viktiga detaljer',
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            if (order.deliveryInstructions?.isNotEmpty ==
                                true) ...[
                              const SizedBox(height: 12),
                              _InfoRow(
                                icon: Icons.door_front_door_outlined,
                                title: 'Leveransinstruktion',
                                value: order.deliveryInstructions!,
                              ),
                            ],
                            if (order.note?.isNotEmpty == true) ...[
                              const SizedBox(height: 12),
                              _InfoRow(
                                icon: Icons.sticky_note_2_outlined,
                                title: 'Kundnotering',
                                value: order.note!,
                              ),
                            ],
                            if (_allergens.isNotEmpty) ...[
                              const SizedBox(height: 12),
                              Text(
                                'Allergener',
                                style: Theme.of(context).textTheme.titleMedium,
                              ),
                              const SizedBox(height: 10),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: _allergens
                                    .map(
                                      (allergen) => AppPill(
                                        label: allergen,
                                        color: Colors.red,
                                      ),
                                    )
                                    .toList(),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    AppPanel(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const AppSectionHeader(
                            eyebrow: 'Artiklar',
                            title: 'Beställning',
                          ),
                          const SizedBox(height: 14),
                          ...order.items.map(
                            (item) => Padding(
                              padding: const EdgeInsets.only(bottom: 14),
                              child: _ItemCard(item: item),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    AppPanel(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const AppSectionHeader(
                            eyebrow: 'Summering',
                            title: 'Betalning och totalsumma',
                          ),
                          const SizedBox(height: 14),
                          _SummaryRow(
                            label: 'Betalmetod',
                            value: order.paymentMethod ?? 'Ej angiven',
                          ),
                          if (order.deliveryFee > 0) ...[
                            const SizedBox(height: 10),
                            _SummaryRow(
                              label: 'Leveransavgift',
                              value: OrderUi.formatCurrency(order.deliveryFee),
                            ),
                          ],
                          if (order.discountAmount > 0) ...[
                            const SizedBox(height: 10),
                            _SummaryRow(
                              label: order.discountCode == null
                                  ? 'Rabatt'
                                  : 'Rabatt (${order.discountCode})',
                              value:
                                  '-${OrderUi.formatCurrency(order.discountAmount)}',
                              valueColor: Colors.green,
                            ),
                          ],
                          const Divider(height: 28),
                          _SummaryRow(
                            label: 'Totalt',
                            value: OrderUi.formatCurrency(order.total),
                            emphasize: true,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
      bottomNavigationBar: _buildActionFooter(),
    );
  }

  bool get _hasNotesOrAlerts {
    return (order.deliveryInstructions?.isNotEmpty ?? false) ||
        (order.note?.isNotEmpty ?? false) ||
        _allergens.isNotEmpty;
  }

  List<String> get _allergens {
    final raw = order.allergens;
    if (raw == null || raw.isEmpty || raw == '[]') return const [];

    try {
      return (jsonDecode(raw) as List)
          .map((item) => item.toString())
          .where((item) => item.trim().isNotEmpty)
          .toList();
    } catch (_) {
      return [raw];
    }
  }

  Widget? _buildActionFooter() {
    if (const {
      'DELIVERED',
      'COMPLETED',
      'CANCELLED',
      'REJECTED',
      'DELIVERING',
    }.contains(order.status)) {
      return null;
    }

    if (order.status == 'READY' && order.type == 'PICKUP') {
      return null;
    }

    final isPending = order.status == 'PENDING';
    final nextStatus = order.type == 'PICKUP' ? 'READY' : 'DELIVERING';

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
        child: AppPanel(
          padding: const EdgeInsets.all(12),
          child: SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () async {
                if (isPending) {
                  if (order.scheduledFor != null) {
                    await _acceptScheduledOrder();
                  } else {
                    _showAcceptDialog();
                  }
                  return;
                }

                final provider =
                    Provider.of<OrderProvider>(context, listen: false);
                final ok = await provider.updateStatus(order.id, nextStatus);
                if (!ok || !mounted) return;

                setState(() {
                  order = order.copyWith(status: nextStatus);
                });

                if (nextStatus == 'DELIVERING' || nextStatus == 'READY') {
                  Navigator.pop(context);
                }
              },
              icon: Icon(
                isPending
                    ? Icons.check_circle_outline_rounded
                    : order.type == 'PICKUP'
                        ? Icons.shopping_bag_rounded
                        : Icons.delivery_dining_rounded,
              ),
              label: Text(
                isPending
                    ? (order.scheduledFor != null
                        ? 'Bekräfta förbeställning'
                        : 'Godkänn order')
                    : (order.type == 'PICKUP'
                        ? 'Klar för hämtning'
                        : 'Maten är på väg'),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final String value;

  const _InfoRow({
    required this.icon,
    required this.title,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: Theme.of(context).colorScheme.primary),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 4),
              Text(value, style: Theme.of(context).textTheme.bodyMedium),
            ],
          ),
        ),
      ],
    );
  }
}

class _ItemCard extends StatelessWidget {
  final OrderItemModel item;

  const _ItemCard({required this.item});

  @override
  Widget build(BuildContext context) {
    final hasExtras = item.selectedExtras.isNotEmpty;
    final hasNote = item.note?.isNotEmpty == true;

    return Container(
      decoration: BoxDecoration(
        color: AppTheme.panelColor(context),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.borderColor(context)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Product header row
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Container(
                  width: 32,
                  height: 32,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: AppTheme.info.withOpacity(0.14),
                    borderRadius: BorderRadius.circular(9),
                  ),
                  child: Text(
                    '${item.quantity}×',
                    style: const TextStyle(
                      color: AppTheme.info,
                      fontWeight: FontWeight.w900,
                      fontSize: 13,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    item.productName,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  OrderUi.formatCurrency(item.subtotal),
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
          // Stacked extras
          if (hasExtras) ...[
            Divider(
                height: 1,
                color: AppTheme.borderColor(context),
                indent: 14,
                endIndent: 14),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: item.selectedExtras
                    .map(
                      (e) => Padding(
                        padding: const EdgeInsets.only(bottom: 5),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Padding(
                              padding: EdgeInsets.only(top: 1),
                              child: Icon(Icons.add_circle_outline_rounded,
                                  size: 14, color: AppTheme.success),
                            ),
                            const SizedBox(width: 7),
                            Expanded(
                              child: Text(
                                e.toString(),
                                style: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w700,
                                  color: AppTheme.success,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    )
                    .toList(),
              ),
            ),
          ],
          // Item note
          if (hasNote) ...[
            Divider(
                height: 1,
                color: AppTheme.borderColor(context),
                indent: 14,
                endIndent: 14),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.priority_high_rounded,
                      size: 16, color: AppTheme.warning),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      item.note!,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.warning,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  final String label;
  final String value;
  final bool emphasize;
  final Color? valueColor;

  const _SummaryRow({
    required this.label,
    required this.value,
    this.emphasize = false,
    this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    final titleStyle = emphasize
        ? Theme.of(context).textTheme.titleLarge
        : Theme.of(context).textTheme.titleMedium;
    final valueStyle = (emphasize
            ? Theme.of(context).textTheme.headlineMedium
            : Theme.of(context).textTheme.titleMedium)
        ?.copyWith(color: valueColor);

    return Row(
      children: [
        Expanded(child: Text(label, style: titleStyle)),
        const SizedBox(width: 12),
        Text(value, style: valueStyle),
      ],
    );
  }
}
