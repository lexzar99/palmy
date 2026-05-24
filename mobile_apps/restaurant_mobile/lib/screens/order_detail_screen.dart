import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
    final deadline =
        baseTime.add(Duration(minutes: order.estimatedTime! + 20));
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
    final screenContext = context;
    var selectedMinutes = order.type == 'PICKUP' ? 20 : 40;
    const minuteOptions = [
      5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90
    ];

    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setModalState) {
            return Padding(
              padding: EdgeInsets.fromLTRB(
                14,
                14,
                14,
                MediaQuery.of(ctx).viewInsets.bottom + 14,
              ),
              child: Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: AppTheme.panelColor(ctx),
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: AppTheme.borderColor(ctx)),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Tid till klar',
                      style: Theme.of(ctx).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Klar ca ${OrderUi.formatTime(DateTime.now().add(Duration(minutes: selectedMinutes)))}',
                      style: Theme.of(ctx).textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 16),
                    SizedBox(
                      height: 56,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        physics: const BouncingScrollPhysics(),
                        itemCount: minuteOptions.length,
                        separatorBuilder: (_, __) => const SizedBox(width: 8),
                        itemBuilder: (ctx, i) {
                          final m = minuteOptions[i];
                          final isSel = m == selectedMinutes;
                          final isDark = AppTheme.isDark(ctx);
                          final accent =
                              isDark ? AppTheme.ember : AppTheme.emberDeep;
                          return GestureDetector(
                            onTap: () =>
                                setModalState(() => selectedMinutes = m),
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 180),
                              width: 62,
                              decoration: BoxDecoration(
                                color: isSel
                                    ? accent
                                    : AppTheme.faintColor(ctx),
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(
                                  color: isSel
                                      ? accent
                                      : AppTheme.borderColor(ctx),
                                ),
                              ),
                              child: Center(
                                child: Text(
                                  '$m',
                                  style: TextStyle(
                                    color: isSel
                                        ? (isDark ? AppTheme.ink : Colors.white)
                                        : (isDark
                                            ? Colors.white
                                            : AppTheme.ink),
                                    fontSize: isSel ? 17 : 15,
                                    fontWeight: isSel
                                        ? FontWeight.w900
                                        : FontWeight.w700,
                                  ),
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                    const SizedBox(height: 20),
                    EmberButton(
                      label: 'Godkänn order · $selectedMinutes min',
                      icon: Icons.check_rounded,
                      onPressed: () async {
                        Navigator.pop(ctx);
                        final provider = Provider.of<OrderProvider>(
                            screenContext,
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
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final accent = OrderUi.typeColor(order.type);
    final isOverdue = _checkIfOverdue();

    return Scaffold(
      extendBody: true,
      backgroundColor: Colors.transparent,
      body: AppBackdrop(
        child: SafeArea(
          child: Column(
            children: [
              _DetailHeader(
                onBack: () => Navigator.pop(context),
                onPrint: () => PrintService.printReceipt(order),
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(20, 6, 20, 12),
                  children: [
                    _OrderHero(order: order, accent: accent),
                    const SizedBox(height: 18),
                    _StatusProgressStrip(order: order),
                    const SizedBox(height: 18),
                    if (isOverdue) ...[
                      _OverdueBanner(pulse: _pulseController),
                      const SizedBox(height: 14),
                    ],
                    _CustomerStrip(order: order, accent: accent),
                    if (order.note?.isNotEmpty == true ||
                        order.deliveryInstructions?.isNotEmpty == true ||
                        _allergens.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      _NotesStrip(
                        order: order,
                        accent: accent,
                        allergens: _allergens,
                      ),
                    ],
                    if (order.scheduledFor != null) ...[
                      const SizedBox(height: 12),
                      _ScheduledStrip(order: order),
                    ],
                    const SizedBox(height: 18),
                    _ItemsCard(order: order, accent: accent),
                    const SizedBox(height: 12),
                    _SummaryCard(order: order, accent: accent),
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

    final label = isPending
        ? (order.scheduledFor != null
            ? 'Bekräfta förbeställning'
            : 'Godkänn order')
        : (order.type == 'PICKUP'
            ? 'Klar för hämtning'
            : 'Maten är på väg');

    final icon = isPending
        ? Icons.check_circle_outline_rounded
        : (order.type == 'PICKUP'
            ? Icons.shopping_bag_rounded
            : Icons.delivery_dining_rounded);

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
        child: EmberButton(
          label: label,
          icon: icon,
          height: 60,
          onPressed: () async {
            HapticFeedback.mediumImpact();
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
        ),
      ),
    );
  }
}

// ── Header ──────────────────────────────────────────────────────────────────
class _DetailHeader extends StatelessWidget {
  final VoidCallback onBack;
  final VoidCallback onPrint;
  const _DetailHeader({required this.onBack, required this.onPrint});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 4),
      child: Row(
        children: [
          _CircleButton(icon: Icons.arrow_back_rounded, onTap: onBack),
          const Spacer(),
          _CircleButton(icon: Icons.print_outlined, onTap: onPrint),
        ],
      ),
    );
  }
}

class _CircleButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  const _CircleButton({required this.icon, required this.onTap});

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
          width: 42,
          height: 42,
          decoration: BoxDecoration(
            color: AppTheme.faintColor(context),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppTheme.borderColor(context)),
          ),
          child: Icon(
            icon,
            color: isDark ? Colors.white : AppTheme.ink,
            size: 20,
          ),
        ),
      ),
    );
  }
}

// ── Hero block ──────────────────────────────────────────────────────────────
class _OrderHero extends StatelessWidget {
  final OrderModel order;
  final Color accent;
  const _OrderHero({required this.order, required this.accent});

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final isPickup = order.type == 'PICKUP';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
              decoration: BoxDecoration(
                color: accent.withOpacity(0.14),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    isPickup
                        ? Icons.shopping_bag_rounded
                        : Icons.delivery_dining_rounded,
                    color: accent,
                    size: 14,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    isPickup ? 'AVHÄMTNING' : 'LEVERANS',
                    style: TextStyle(
                      color: accent,
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.8,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Text(
              OrderUi.formatDateTime(order.createdAt),
              style: TextStyle(
                color: AppTheme.mutedColor(context),
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              '#',
              style: TextStyle(
                fontSize: 32,
                fontWeight: FontWeight.w700,
                height: 1.0,
                color: AppTheme.mutedColor(context),
              ),
            ),
            const SizedBox(width: 2),
            Expanded(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.bottomLeft,
                child: Text(
                  order.orderNumber,
                  style: TextStyle(
                    fontSize: 64,
                    fontWeight: FontWeight.w900,
                    height: 0.9,
                    letterSpacing: -2.5,
                    color: isDark ? Colors.white : AppTheme.ink,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                OrderUi.formatCurrency(order.total),
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                  color: accent,
                  letterSpacing: -0.4,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

// ── Status progress strip ───────────────────────────────────────────────────
class _StatusProgressStrip extends StatelessWidget {
  final OrderModel order;
  const _StatusProgressStrip({required this.order});

  List<_Step> _stepsFor(String type) {
    if (type == 'PICKUP') {
      return const [
        _Step('PENDING', 'Inkommen'),
        _Step('PREPARING', 'Tillagas'),
        _Step('READY', 'Klar'),
        _Step('COMPLETED', 'Hämtad'),
      ];
    }
    return const [
      _Step('PENDING', 'Inkommen'),
      _Step('PREPARING', 'Tillagas'),
      _Step('DELIVERING', 'På väg'),
      _Step('DELIVERED', 'Levererad'),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final accent = OrderUi.typeColor(order.type);
    final steps = _stepsFor(order.type);
    final isCancelled =
        order.status == 'CANCELLED' || order.status == 'REJECTED';

    int currentIndex = -1;
    for (var i = 0; i < steps.length; i++) {
      if (steps[i].key == order.status) {
        currentIndex = i;
        break;
      }
      if (steps[i].key == 'PREPARING' && order.status == 'ACCEPTED') {
        currentIndex = i;
        break;
      }
      if (steps[i].key == 'COMPLETED' && order.status == 'DELIVERED') {
        currentIndex = i;
        break;
      }
    }
    if (isCancelled) currentIndex = -2;

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
      decoration: BoxDecoration(
        color: AppTheme.panelColor(context),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppTheme.borderColor(context)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                'STATUS',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.2,
                  color: AppTheme.mutedColor(context),
                ),
              ),
              const Spacer(),
              Text(
                OrderUi.statusLabel(order.status),
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: isCancelled
                      ? AppTheme.danger
                      : OrderUi.statusColor(order.status),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (isCancelled)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.danger.withOpacity(0.10),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  const Icon(Icons.cancel_rounded,
                      color: AppTheme.danger, size: 18),
                  const SizedBox(width: 8),
                  Text(
                    OrderUi.statusLabel(order.status),
                    style: const TextStyle(
                      color: AppTheme.danger,
                      fontWeight: FontWeight.w800,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            )
          else
            Row(
              children: List.generate(steps.length * 2 - 1, (i) {
                if (i.isOdd) {
                  final between = (i - 1) ~/ 2;
                  final filled = between < currentIndex;
                  return Expanded(
                    child: Container(
                      height: 2.5,
                      margin: const EdgeInsets.symmetric(horizontal: 4),
                      decoration: BoxDecoration(
                        color: filled
                            ? accent
                            : AppTheme.mutedColor(context).withOpacity(0.20),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  );
                }
                final idx = i ~/ 2;
                final done = idx <= currentIndex;
                final current = idx == currentIndex;
                return _ProgressDot(
                  active: done,
                  current: current,
                  accent: accent,
                );
              }),
            ),
          const SizedBox(height: 10),
          if (!isCancelled)
            Row(
              children: steps.map((s) {
                return Expanded(
                  child: Text(
                    s.label,
                    textAlign: TextAlign.center,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.mutedColor(context),
                      letterSpacing: 0.2,
                    ),
                  ),
                );
              }).toList(),
            ),
        ],
      ),
    );
  }
}

class _Step {
  final String key;
  final String label;
  const _Step(this.key, this.label);
}

class _ProgressDot extends StatelessWidget {
  final bool active;
  final bool current;
  final Color accent;
  const _ProgressDot({
    required this.active,
    required this.current,
    required this.accent,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: current ? 18 : 14,
      height: current ? 18 : 14,
      decoration: BoxDecoration(
        color: active ? accent : Colors.transparent,
        shape: BoxShape.circle,
        border: Border.all(
          color: active
              ? accent
              : AppTheme.mutedColor(context).withOpacity(0.45),
          width: current ? 3 : 1.5,
        ),
        boxShadow: current
            ? [
                BoxShadow(
                  color: accent.withOpacity(0.42),
                  blurRadius: 10,
                  spreadRadius: 1,
                ),
              ]
            : null,
      ),
    );
  }
}

// ── Customer strip ──────────────────────────────────────────────────────────
class _CustomerStrip extends StatelessWidget {
  final OrderModel order;
  final Color accent;
  const _CustomerStrip({required this.order, required this.accent});

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final hasAddress =
        order.type == 'DELIVERY' && order.deliveryStreet != null;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.panelColor(context),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppTheme.borderColor(context)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  order.customerName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.2,
                    color: isDark ? Colors.white : AppTheme.ink,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  order.customerPhone,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.mutedColor(context),
                  ),
                ),
                if (hasAddress) ...[
                  const SizedBox(height: 2),
                  Text(
                    '${order.deliveryStreet}, ${order.deliveryZip ?? ''} ${order.deliveryCity ?? ''}'
                        .trim(),
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.mutedColor(context),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 12),
          Material(
            color: Colors.transparent,
            borderRadius: BorderRadius.circular(14),
            child: InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: () {
                Clipboard.setData(ClipboardData(text: order.customerPhone));
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text(
                        'Nummer kopierat: ${order.customerPhone}'),
                    duration: const Duration(seconds: 2),
                  ),
                );
              },
              child: Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: accent.withOpacity(0.14),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(Icons.phone_rounded, color: accent, size: 20),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NotesStrip extends StatelessWidget {
  final OrderModel order;
  final Color accent;
  final List<String> allergens;
  const _NotesStrip({
    required this.order,
    required this.accent,
    required this.allergens,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final hasInstr = order.deliveryInstructions?.isNotEmpty == true;
    final hasNote = order.note?.isNotEmpty == true;
    final hasAllergens = allergens.isNotEmpty;

    final lineColor = AppTheme.warning;
    final textColor = isDark ? Colors.white : AppTheme.ink;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: lineColor.withOpacity(0.08),
        borderRadius: BorderRadius.circular(18),
        border: Border(left: BorderSide(color: lineColor, width: 4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (hasInstr)
            _NoteRow(
              icon: Icons.directions_walk_rounded,
              color: lineColor,
              text: OrderUi.deliveryInstructionLabel(
                  order.deliveryInstructions),
              textColor: textColor,
            ),
          if (hasNote) ...[
            if (hasInstr) const SizedBox(height: 10),
            _NoteRow(
              icon: Icons.chat_bubble_outline_rounded,
              color: lineColor,
              text: order.note!,
              textColor: textColor,
            ),
          ],
          if (hasAllergens) ...[
            if (hasInstr || hasNote) const SizedBox(height: 12),
            Text(
              'ALLERGENER',
              style: TextStyle(
                color: AppTheme.danger,
                fontSize: 10.5,
                fontWeight: FontWeight.w900,
                letterSpacing: 1.0,
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: allergens
                  .map((a) => Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: AppTheme.danger.withOpacity(0.14),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          a,
                          style: const TextStyle(
                            color: AppTheme.danger,
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ))
                  .toList(),
            ),
          ],
        ],
      ),
    );
  }
}

class _NoteRow extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String text;
  final Color textColor;
  const _NoteRow({
    required this.icon,
    required this.color,
    required this.text,
    required this.textColor,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: color, size: 18),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            text,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: textColor,
              height: 1.4,
            ),
          ),
        ),
      ],
    );
  }
}

class _ScheduledStrip extends StatelessWidget {
  final OrderModel order;
  const _ScheduledStrip({required this.order});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.ember.withOpacity(0.10),
        borderRadius: BorderRadius.circular(18),
        border: Border(left: BorderSide(color: AppTheme.ember, width: 4)),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: AppTheme.ember.withOpacity(0.18),
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Icon(Icons.schedule_rounded,
                color: AppTheme.ember, size: 22),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Förbeställning',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 2),
                Text(
                  OrderUi.scheduledLabel(order),
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ItemsCard extends StatelessWidget {
  final OrderModel order;
  final Color accent;
  const _ItemsCard({required this.order, required this.accent});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppTheme.panelColor(context),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppTheme.borderColor(context)),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
            child: Row(
              children: [
                Text(
                  'ARTIKLAR',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.2,
                    color: AppTheme.mutedColor(context),
                  ),
                ),
                const Spacer(),
                Text(
                  '${order.items.fold<int>(0, (s, i) => s + i.quantity)} st',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: AppTheme.mutedColor(context),
                  ),
                ),
              ],
            ),
          ),
          ...List.generate(order.items.length, (i) {
            return Column(
              children: [
                _ItemRow(item: order.items[i], accent: accent),
                if (i < order.items.length - 1)
                  Divider(
                    height: 1,
                    indent: 16,
                    endIndent: 16,
                    color: AppTheme.borderColor(context),
                  ),
              ],
            );
          }),
        ],
      ),
    );
  }
}

class _ItemRow extends StatelessWidget {
  final OrderItemModel item;
  final Color accent;
  const _ItemRow({required this.item, required this.accent});

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final hasExtras = item.selectedExtras.isNotEmpty;
    final hasNote = item.note?.isNotEmpty == true;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            alignment: Alignment.center,
            margin: const EdgeInsets.only(top: 1),
            decoration: BoxDecoration(
              color: accent.withOpacity(0.14),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              '${item.quantity}×',
              style: TextStyle(
                color: accent,
                fontWeight: FontWeight.w800,
                fontSize: 13,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        item.productName,
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: isDark ? Colors.white : AppTheme.ink,
                          letterSpacing: -0.2,
                        ),
                      ),
                    ),
                    Text(
                      OrderUi.formatCurrency(item.subtotal),
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: isDark ? Colors.white : AppTheme.ink,
                      ),
                    ),
                  ],
                ),
                if (hasExtras) ...[
                  const SizedBox(height: 6),
                  ...item.selectedExtras.map((e) {
                    final name = (e['name'] ?? '').toString();
                    final price = (e['price'] as num?)?.toDouble() ?? 0.0;
                    final requiredFlag = e['required'] as bool?;
                    final isMandatory = requiredFlag ?? (price == 0);
                    return Padding(
                      padding: const EdgeInsets.only(top: 3),
                      child: Row(
                        children: [
                          Container(
                            width: 16,
                            height: 16,
                            margin: const EdgeInsets.only(right: 8),
                            decoration: BoxDecoration(
                              color: isMandatory
                                  ? AppTheme.mutedColor(context)
                                      .withOpacity(0.20)
                                  : accent.withOpacity(0.16),
                              borderRadius: BorderRadius.circular(5),
                            ),
                            child: Icon(
                              isMandatory
                                  ? Icons.remove_rounded
                                  : Icons.add_rounded,
                              size: 11,
                              color: isMandatory
                                  ? AppTheme.mutedColor(context)
                                  : accent,
                            ),
                          ),
                          Expanded(
                            child: Text(
                              name,
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: isMandatory
                                    ? (isDark ? Colors.white : AppTheme.ink)
                                    : accent,
                              ),
                            ),
                          ),
                          if (!isMandatory)
                            Text(
                              '+ ${OrderUi.formatCurrency(price)}',
                              style: TextStyle(
                                fontSize: 12.5,
                                fontWeight: FontWeight.w700,
                                color: accent,
                              ),
                            ),
                        ],
                      ),
                    );
                  }),
                ],
                if (hasNote) ...[
                  const SizedBox(height: 6),
                  Container(
                    padding: const EdgeInsets.fromLTRB(10, 7, 10, 7),
                    decoration: BoxDecoration(
                      color: AppTheme.warning.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.edit_note_rounded,
                            size: 16, color: AppTheme.warning),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            item.note!,
                            style: const TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w700,
                              color: AppTheme.warning,
                              height: 1.3,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final OrderModel order;
  final Color accent;
  const _SummaryCard({required this.order, required this.accent});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
      decoration: BoxDecoration(
        color: AppTheme.panelColor(context),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppTheme.borderColor(context)),
      ),
      child: Column(
        children: [
          _Row(
            label: 'Betalmetod',
            value: (order.paymentMethod ?? 'Ej angiven').toUpperCase(),
          ),
          if (order.deliveryFee > 0) ...[
            const SizedBox(height: 8),
            _Row(
              label: 'Leveransavgift',
              value: OrderUi.formatCurrency(order.deliveryFee),
            ),
          ],
          if (order.discountAmount > 0) ...[
            const SizedBox(height: 8),
            _Row(
              label: order.discountCode == null
                  ? 'Rabatt'
                  : 'Rabatt (${order.discountCode})',
              value: '-${OrderUi.formatCurrency(order.discountAmount)}',
              valueColor: AppTheme.success,
            ),
          ],
          const SizedBox(height: 12),
          Divider(
            height: 1,
            color: AppTheme.borderColor(context),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Text(
                'TOTALT',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: AppTheme.mutedColor(context),
                  letterSpacing: 1.2,
                ),
              ),
              const Spacer(),
              Text(
                OrderUi.formatCurrency(order.total),
                style: TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w900,
                  color: accent,
                  letterSpacing: -0.5,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;
  const _Row({required this.label, required this.value, this.valueColor});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: AppTheme.mutedColor(context),
          ),
        ),
        const Spacer(),
        Text(
          value,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w800,
            color: valueColor ??
                (AppTheme.isDark(context) ? Colors.white : AppTheme.ink),
          ),
        ),
      ],
    );
  }
}

class _OverdueBanner extends StatelessWidget {
  final AnimationController pulse;
  const _OverdueBanner({required this.pulse});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: pulse,
      builder: (_, __) {
        return Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppTheme.danger.withOpacity(0.10),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: AppTheme.danger.withOpacity(0.30 + pulse.value * 0.25),
              width: 1.4,
            ),
            boxShadow: [
              BoxShadow(
                color: AppTheme.danger
                    .withOpacity(0.12 + pulse.value * 0.18),
                blurRadius: 20,
                spreadRadius: 1,
              ),
            ],
          ),
          child: Row(
            children: [
              const Icon(Icons.warning_amber_rounded,
                  color: AppTheme.danger, size: 22),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Ordern ligger efter uppskattad tid — kolla status med teamet.',
                  style: TextStyle(
                    color: AppTheme.danger,
                    fontWeight: FontWeight.w800,
                    fontSize: 13,
                    height: 1.35,
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
