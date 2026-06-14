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
    final provider = Provider.of<OrderProvider>(context, listen: false);
    // Förvald tid + max styrs av leveransmodellen (plattform=15/max50,
    // self=40/max90, avhämtning=20). Dynamiskt — inget hårdkodat.
    var selectedMinutes = provider.defaultPrepMinutes(order.type);
    final maxMinutes = provider.maxPrepMinutes(order.type);
    final minuteOptions =
        [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90]
            .where((m) => m <= maxMinutes)
            .toList();

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
    final accent = OrderUi.colorFor(order); // typ-färg — bara hero-pillen
    final ink = AppTheme.isDark(context) ? Colors.white : AppTheme.ink;
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
                  padding: const EdgeInsets.fromLTRB(20, 6, 20, 28),
                  children: [
                    _OrderHero(order: order, accent: accent),
                    const SizedBox(height: 18),
                    // Refund-anmärkning från admin — visas tydligt högst upp
                    // när ordern är (helt eller delvis) återbetald. Innan
                    // status-strip:en så restaurangen ser det innan de börjar
                    // läsa kund/items.
                    if (order.isRefunded) ...[
                      _RefundBanner(order: order),
                      const SizedBox(height: 16),
                    ],
                    _StatusProgressStrip(order: order),
                    if (isOverdue) ...[
                      const SizedBox(height: 16),
                      _OverdueBanner(pulse: _pulseController),
                    ],
                    const _SectionDivider(),
                    _CustomerStrip(order: order, accent: ink),
                    if (order.note?.isNotEmpty == true ||
                        order.deliveryInstructions?.isNotEmpty == true ||
                        _allergens.isNotEmpty) ...[
                      const SizedBox(height: 14),
                      _NotesStrip(
                        order: order,
                        accent: ink,
                        allergens: _allergens,
                      ),
                    ],
                    if (order.scheduledFor != null) ...[
                      const SizedBox(height: 14),
                      _ScheduledStrip(order: order),
                    ],
                    const _SectionDivider(),
                    _ItemsCard(order: order, accent: ink),
                    const _SectionDivider(),
                    _SummaryCard(order: order, accent: ink),
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

    final isPending = order.status == 'PENDING';
    // Dynamiskt utifrån leveransmodellen: plattformsleverans → "Klar för
    // hämtning" (READY, budet tar över); self-leverans → "Markera på väg"
    // (DELIVERING). Avhämtning oförändrat.
    final provider = Provider.of<OrderProvider>(context, listen: false);
    final nextStatus = provider.advanceNextStatus(order.type);

    // Redan i slut-status för restaurangens del (t.ex. READY när budet tar
    // över, eller avhämtning klar för upphämtning) → ingen knapp.
    if (!isPending && order.status == nextStatus) {
      return null;
    }
    final advanceLabel = provider.advanceLabel(order.type);
    // Self-leverans markerar maten "på väg" → bil-ikon; annars hämtnings-ikon.
    final isOnTheWay = order.type == 'DELIVERY' && provider.selfDelivery;

    final label = isPending
        ? (order.scheduledFor != null
            ? 'Bekräfta förbeställning'
            : 'Godkänn order')
        : advanceLabel;

    final icon = isPending
        ? Icons.check_circle_outline_rounded
        : (isOnTheWay
            ? Icons.delivery_dining_rounded
            : Icons.shopping_bag_rounded);

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

/// Tunn linje mellan flata sektioner — håller layouten "delad" utan att varje
/// del behöver en egen ruta/container.
class _SectionDivider extends StatelessWidget {
  const _SectionDivider();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: Divider(
        height: 1,
        thickness: 1,
        color: AppTheme.borderColor(context),
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
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(
              child: Text(
                '#${order.orderNumber}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                  color: isDark ? Colors.white : AppTheme.ink,
                ),
              ),
            ),
            const SizedBox(width: 10),
            Text(
              OrderUi.formatCurrency(order.total),
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w900,
                letterSpacing: -0.3,
                color: isDark ? Colors.white : AppTheme.ink,
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

  List<_Step> _stepsFor(String type, bool selfDelivery) {
    if (type == 'PICKUP') {
      return const [
        _Step('PENDING', 'Inkommen'),
        _Step('PREPARING', 'Tillagas'),
        _Step('READY', 'Klar'),
      ];
    }
    // Plattformsleverans: restaurangen slutar vid "Klar" (READY) — budet sköter
    // resten. Self-leverans: restaurangen markerar "På väg" (DELIVERING) själv.
    if (!selfDelivery) {
      return const [
        _Step('PENDING', 'Inkommen'),
        _Step('PREPARING', 'Tillagas'),
        _Step('READY', 'Klar'),
        _Step('DELIVERED', 'Levererad'),
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
    // Monokrom progress-strip; status-ordet bär färgen.
    final accent = AppTheme.isDark(context) ? Colors.white : AppTheme.ink;
    final selfDelivery =
        Provider.of<OrderProvider>(context, listen: false).selfDelivery;
    final steps = _stepsFor(order.type, selfDelivery);
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

    final stepLabel = currentIndex >= 0 ? steps[currentIndex].label : '';

    return Row(
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
        const SizedBox(width: 14),
        if (isCancelled)
          Expanded(
            child: Row(
              children: [
                const Icon(Icons.cancel_rounded,
                    color: AppTheme.danger, size: 16),
                const SizedBox(width: 6),
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
        else ...[
          // Tunn segmenterad progress-bar — fylld upp t.o.m. nuvarande steg.
          Expanded(
            child: Row(
              children: List.generate(steps.length, (i) {
                final filled = i <= currentIndex;
                return Expanded(
                  child: Container(
                    height: 4,
                    margin: EdgeInsets.only(
                        right: i == steps.length - 1 ? 0 : 6),
                    decoration: BoxDecoration(
                      color: filled
                          ? accent
                          : AppTheme.mutedColor(context).withOpacity(0.18),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                );
              }),
            ),
          ),
          const SizedBox(width: 14),
          Text(
            stepLabel,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: OrderUi.statusColor(order.status),
            ),
          ),
        ],
      ],
    );
  }
}

class _Step {
  final String key;
  final String label;
  const _Step(this.key, this.label);
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
      padding: const EdgeInsets.symmetric(vertical: 2),
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
                    fontSize: 21,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -0.3,
                    color: isDark ? Colors.white : AppTheme.ink,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  order.customerPhone,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.mutedColor(context),
                  ),
                ),
                if (hasAddress) ...[
                  const SizedBox(height: 3),
                  Text(
                    '${order.deliveryStreet}, ${order.deliveryZip ?? ''} ${order.deliveryCity ?? ''}'
                        .trim(),
                    style: TextStyle(
                      fontSize: 14,
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

    final lineColor = AppTheme.mutedColor(context);
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
        color: AppTheme.preorder.withOpacity(0.10),
        borderRadius: BorderRadius.circular(18),
        border: Border(left: BorderSide(color: AppTheme.preorder, width: 4)),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: AppTheme.preorder.withOpacity(0.18),
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Icon(Icons.schedule_rounded,
                color: AppTheme.preorder, size: 22),
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
    final muted = AppTheme.mutedColor(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              'BESTÄLLNING',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                letterSpacing: 1.2,
                color: muted,
              ),
            ),
            const Spacer(),
            Text(
              '${order.items.fold<int>(0, (s, i) => s + i.quantity)} st',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                color: muted,
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        ...List.generate(order.items.length, (i) {
          return _ItemRow(
            item: order.items[i],
            ink: accent,
            muted: muted,
            isLast: i == order.items.length - 1,
          );
        }),
      ],
    );
  }
}

class _ItemRow extends StatelessWidget {
  final OrderItemModel item;
  final Color ink;
  final Color muted;
  final bool isLast;
  const _ItemRow({
    required this.item,
    required this.ink,
    required this.muted,
    required this.isLast,
  });

  @override
  Widget build(BuildContext context) {
    final hasExtras = item.selectedExtras.isNotEmpty;
    final hasNote = item.note?.isNotEmpty == true;
    return Padding(
      padding: EdgeInsets.only(bottom: isLast ? 0 : 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 34,
                child: Text(
                  '${item.quantity}×',
                  style: TextStyle(
                      fontSize: 16, fontWeight: FontWeight.w800, color: ink),
                ),
              ),
              Expanded(
                child: Text(
                  item.productName,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    height: 1.3,
                    color: ink,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Text(
                OrderUi.formatCurrency(item.subtotal),
                style: TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w800, color: ink),
              ),
            ],
          ),
          if (hasExtras)
            ...item.selectedExtras.map((e) {
              final name = (e['name'] ?? '').toString();
              final price = (e['price'] as num?)?.toDouble() ?? 0.0;
              return Padding(
                padding: const EdgeInsets.only(left: 34, top: 5),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '+ $name',
                        style: TextStyle(
                            fontSize: 14.5,
                            fontWeight: FontWeight.w500,
                            color: muted),
                      ),
                    ),
                    if (price > 0)
                      Text(
                        '+ ${OrderUi.formatCurrency(price)}',
                        style: TextStyle(
                            fontSize: 14.5,
                            fontWeight: FontWeight.w500,
                            color: muted),
                      ),
                  ],
                ),
              );
            }),
          if (hasNote)
            Padding(
              padding: const EdgeInsets.only(left: 34, top: 7),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.edit_note_rounded, size: 17, color: muted),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      item.note!,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        fontStyle: FontStyle.italic,
                        height: 1.3,
                        color: muted,
                      ),
                    ),
                  ),
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
      padding: const EdgeInsets.symmetric(vertical: 2),
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
                  fontSize: 30,
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
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: AppTheme.mutedColor(context),
          ),
        ),
        const Spacer(),
        Text(
          value,
          style: TextStyle(
            fontSize: 15,
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

/// Banner högst upp i detail-vyn när admin har återbetalat ordern.
/// Tydlig röd accent med belopp + anledning, så restaurangen direkt ser att
/// pengar har gått tillbaka (och varför).
class _RefundBanner extends StatelessWidget {
  final OrderModel order;
  const _RefundBanner({required this.order});

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final isFull = order.isFullyRefunded;
    final title = isFull ? 'ÅTERBETALD' : 'DELVIS ÅTERBETALD';
    final amount = OrderUi.formatCurrency(order.refundAmount ?? 0);
    final reason = (order.refundReason ?? '').trim();

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        color: AppTheme.danger.withOpacity(isDark ? 0.16 : 0.10),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: AppTheme.danger.withOpacity(0.45),
          width: 1,
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(
              color: AppTheme.danger.withOpacity(0.20),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(
              Icons.assignment_return_rounded,
              color: AppTheme.danger,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        color: AppTheme.danger,
                        fontWeight: FontWeight.w900,
                        fontSize: 12,
                        letterSpacing: 1.0,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '· $amount',
                      style: TextStyle(
                        color: AppTheme.danger,
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
                if (reason.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    reason,
                    style: TextStyle(
                      color: isDark ? Colors.white.withOpacity(0.82) : AppTheme.ink.withOpacity(0.78),
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                      height: 1.35,
                    ),
                  ),
                ],
                if (order.refundedAt != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    'Återbetalt ${OrderUi.formatDateTime(order.refundedAt!)}',
                    style: TextStyle(
                      color: AppTheme.mutedColor(context),
                      fontWeight: FontWeight.w600,
                      fontSize: 11.5,
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
