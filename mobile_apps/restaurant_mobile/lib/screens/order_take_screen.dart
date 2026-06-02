import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../core/order_ui.dart';
import '../core/theme.dart';
import '../models/order_model.dart';
import '../providers/order_provider.dart';
import '../widgets/app_ui.dart';
import 'accept_result_screen.dart';

class OrderTakeScreen extends StatefulWidget {
  final OrderModel order;
  final DateTime arrivedAt;

  const OrderTakeScreen({
    super.key,
    required this.order,
    required this.arrivedAt,
  });

  @override
  State<OrderTakeScreen> createState() => _OrderTakeScreenState();
}

class _OrderTakeScreenState extends State<OrderTakeScreen> {
  late int _selectedMinutes;
  bool _busy = false;
  bool _rejecting = false;

  static const _minuteOptions = [
    10,
    15,
    20,
    25,
    30,
    35,
    40,
    45,
    50,
    60,
    70,
    80,
    90
  ];

  @override
  void initState() {
    super.initState();
    _selectedMinutes = widget.order.type == 'PICKUP' ? 20 : 40;
  }

  Future<void> _accept() async {
    if (_busy || _rejecting) return;
    setState(() => _busy = true);
    HapticFeedback.mediumImpact();

    final provider = Provider.of<OrderProvider>(context, listen: false);
    final ok = await provider.updateStatus(
      widget.order.id,
      'PREPARING',
      estimatedTime: _selectedMinutes,
    );

    if (!mounted) return;
    if (!ok) {
      setState(() => _busy = false);
      HapticFeedback.heavyImpact();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppTheme.danger,
          behavior: SnackBarBehavior.floating,
          content: const Text(
            'Kunde inte godkänna order — kontrollera nätverk',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
          ),
        ),
      );
      return;
    }

    final seconds = DateTime.now().difference(widget.arrivedAt).inSeconds;
    Navigator.of(context).pushReplacement(
      PageRouteBuilder(
        transitionDuration: const Duration(milliseconds: 320),
        pageBuilder: (_, __, ___) => AcceptResultScreen(seconds: seconds),
        transitionsBuilder: (_, anim, __, child) =>
            FadeTransition(opacity: anim, child: child),
      ),
    );
  }

  Future<void> _reject() async {
    if (_busy || _rejecting) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: const Text(
          'Neka order?',
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
        content:
            const Text('Ordern avvisas och kunden meddelas. Kan inte ångras.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Avbryt'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.danger,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14)),
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Neka',
                style: TextStyle(fontWeight: FontWeight.w800)),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;
    setState(() => _rejecting = true);

    final provider = Provider.of<OrderProvider>(context, listen: false);
    final ok = await provider.updateStatus(widget.order.id, 'REJECTED');
    if (!mounted) return;
    if (!ok) {
      setState(() => _rejecting = false);
      HapticFeedback.heavyImpact();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppTheme.danger,
          behavior: SnackBarBehavior.floating,
          content: const Text(
            'Kunde inte neka order — kontrollera nätverk',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
          ),
        ),
      );
      return;
    }
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final order = widget.order;
    final isDark = AppTheme.isDark(context);
    final accent = OrderUi.typeColor(order.type);

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: AppBackdrop(
        child: AbsorbPointer(
          absorbing: _busy || _rejecting,
          child: SafeArea(
            child: Column(
              children: [
                _HeroHeader(onReject: _reject),
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(20, 6, 20, 12),
                    children: [
                      _BigOrderNumber(order: order, accent: accent),
                      const SizedBox(height: 18),
                      _CustomerStrip(order: order, accent: accent),
                      if (order.note?.isNotEmpty == true ||
                          order.deliveryInstructions?.isNotEmpty == true) ...[
                        const SizedBox(height: 12),
                        _NoteStrip(order: order, accent: accent),
                      ],
                      const SizedBox(height: 18),
                      _ItemList(order: order, accent: accent),
                      const SizedBox(height: 18),
                      _TotalRow(order: order, accent: accent),
                    ],
                  ),
                ),
                _BottomBar(
                  options: _minuteOptions,
                  selected: _selectedMinutes,
                  accent: accent,
                  isDark: isDark,
                  busy: _busy,
                  rejecting: _rejecting,
                  onTimeChanged: (m) => setState(() {
                    HapticFeedback.selectionClick();
                    _selectedMinutes = m;
                  }),
                  onAccept: _accept,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── Hero header: back + neka ─────────────────────────────────────────────────
class _HeroHeader extends StatelessWidget {
  final VoidCallback onReject;
  const _HeroHeader({required this.onReject});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 4),
      child: Row(
        children: [
          _IconButton(
            icon: Icons.arrow_back_rounded,
            onTap: () => Navigator.of(context).maybePop(),
          ),
          const Spacer(),
          GestureDetector(
            onTap: onReject,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
              decoration: BoxDecoration(
                color: AppTheme.danger.withOpacity(0.10),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: AppTheme.danger.withOpacity(0.40),
                  width: 1,
                ),
              ),
              child: const Text(
                'NEKA',
                style: TextStyle(
                  color: AppTheme.danger,
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.8,
                ),
              ),
            ),
          ),
        ],
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

// ── Massiv #nummer ──────────────────────────────────────────────────────────
class _BigOrderNumber extends StatelessWidget {
  final OrderModel order;
  final Color accent;
  const _BigOrderNumber({required this.order, required this.accent});

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final isPickup = order.type == 'PICKUP';
    final typeLabel = isPickup ? 'AVHÄMTNING' : 'LEVERANS';
    final typeIcon =
        isPickup ? Icons.shopping_bag_rounded : Icons.delivery_dining_rounded;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
              decoration: BoxDecoration(
                color: accent.withOpacity(0.14),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(typeIcon, color: accent, size: 14),
                  const SizedBox(width: 6),
                  Text(
                    typeLabel,
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
              OrderUi.formatTime(order.createdAt),
              style: TextStyle(
                color: AppTheme.mutedColor(context),
                fontSize: 12,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.3,
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
                fontSize: 36,
                fontWeight: FontWeight.w700,
                height: 1.0,
                color: AppTheme.mutedColor(context),
              ),
            ),
            const SizedBox(width: 2),
            Flexible(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.bottomLeft,
                child: Text(
                  order.orderNumber,
                  style: TextStyle(
                    fontSize: 76,
                    fontWeight: FontWeight.w900,
                    height: 0.9,
                    letterSpacing: -3,
                    color: isDark ? Colors.white : AppTheme.ink,
                  ),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

// ── Kundinfo som strip ──────────────────────────────────────────────────────
class _CustomerStrip extends StatelessWidget {
  final OrderModel order;
  final Color accent;
  const _CustomerStrip({required this.order, required this.accent});

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final hasAddress = order.type == 'DELIVERY' && order.deliveryStreet != null;

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
                    letterSpacing: -0.3,
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
                    content: Text('Nummer kopierat: ${order.customerPhone}'),
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

// ── Noteringsstrip ──────────────────────────────────────────────────────────
class _NoteStrip extends StatelessWidget {
  final OrderModel order;
  final Color accent;
  const _NoteStrip({required this.order, required this.accent});

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final hasInstr = order.deliveryInstructions?.isNotEmpty == true;
    final hasNote = order.note?.isNotEmpty == true;

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        color: accent.withOpacity(0.10),
        borderRadius: BorderRadius.circular(18),
        border: Border(left: BorderSide(color: accent, width: 4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (hasInstr) ...[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.directions_walk_rounded, color: accent, size: 17),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    OrderUi.deliveryInstructionLabel(
                        order.deliveryInstructions),
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: isDark ? Colors.white : AppTheme.ink,
                    ),
                  ),
                ),
              ],
            ),
            if (hasNote) const SizedBox(height: 8),
          ],
          if (hasNote)
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.chat_bubble_outline_rounded,
                    color: accent, size: 17),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    order.note!,
                    style: TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w700,
                      color: isDark
                          ? Colors.white.withOpacity(0.92)
                          : AppTheme.ink.withOpacity(0.86),
                      height: 1.4,
                    ),
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

// ── Item-list ───────────────────────────────────────────────────────────────
class _ItemList extends StatelessWidget {
  final OrderModel order;
  final Color accent;
  const _ItemList({required this.order, required this.accent});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 4),
      decoration: BoxDecoration(
        color: AppTheme.panelColor(context),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppTheme.borderColor(context)),
      ),
      child: Column(
        children: List.generate(order.items.length, (i) {
          final item = order.items[i];
          return Column(
            children: [
              _ItemRow(item: item, accent: accent),
              if (i < order.items.length - 1)
                Divider(
                  height: 1,
                  indent: 18,
                  endIndent: 18,
                  color: AppTheme.borderColor(context),
                ),
            ],
          );
        }),
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
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
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
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        item.productName,
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          letterSpacing: -0.2,
                          color: isDark ? Colors.white : AppTheme.ink,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
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

class _TotalRow extends StatelessWidget {
  final OrderModel order;
  final Color accent;
  const _TotalRow({required this.order, required this.accent});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          'Totalt',
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w700,
            color: AppTheme.mutedColor(context),
            letterSpacing: 0.2,
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
    );
  }
}

// ── Bottom bar ───────────────────────────────────────────────────────────────
class _BottomBar extends StatelessWidget {
  final List<int> options;
  final int selected;
  final Color accent;
  final bool isDark;
  final bool busy;
  final bool rejecting;
  final ValueChanged<int> onTimeChanged;
  final VoidCallback onAccept;

  const _BottomBar({
    required this.options,
    required this.selected,
    required this.accent,
    required this.isDark,
    required this.busy,
    required this.rejecting,
    required this.onTimeChanged,
    required this.onAccept,
  });

  String _readyTime(int minutes) {
    final ready = DateTime.now().add(Duration(minutes: minutes));
    return OrderUi.formatTime(ready);
  }

  @override
  Widget build(BuildContext context) {
    final bg = isDark ? AppTheme.storm : Colors.white;
    final borderC = isDark
        ? Colors.white.withOpacity(0.08)
        : AppTheme.ink.withOpacity(0.07);

    return Container(
      decoration: BoxDecoration(
        color: bg,
        border: Border(top: BorderSide(color: borderC, width: 1)),
        boxShadow: isDark
            ? []
            : [
                BoxShadow(
                  color: Colors.black.withOpacity(0.04),
                  blurRadius: 18,
                  offset: const Offset(0, -2),
                ),
              ],
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'TID',
                        style: TextStyle(
                          color: AppTheme.mutedColor(context),
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.4,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            '$selected',
                            style: TextStyle(
                              fontSize: 26,
                              fontWeight: FontWeight.w900,
                              height: 1.0,
                              letterSpacing: -1,
                              color: isDark ? Colors.white : AppTheme.ink,
                            ),
                          ),
                          const SizedBox(width: 4),
                          Padding(
                            padding: const EdgeInsets.only(bottom: 4),
                            child: Text(
                              'min',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                color: AppTheme.mutedColor(context),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  const Spacer(),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        'KLAR',
                        style: TextStyle(
                          color: AppTheme.mutedColor(context),
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.4,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _readyTime(selected),
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: accent,
                          letterSpacing: -0.3,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 10),
              _TimeStrip(
                options: options,
                selected: selected,
                accent: accent,
                isDark: isDark,
                onChanged: onTimeChanged,
              ),
              const SizedBox(height: 12),
              EmberButton(
                label: rejecting ? 'NEKAR...' : 'ACCEPTERA · $selected min',
                icon: Icons.bolt_rounded,
                busy: busy,
                onPressed: busy ? null : onAccept,
                color: accent,
                foreground: isDark ? AppTheme.ink : Colors.white,
                height: 52,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TimeStrip extends StatefulWidget {
  final List<int> options;
  final int selected;
  final Color accent;
  final bool isDark;
  final ValueChanged<int> onChanged;

  const _TimeStrip({
    required this.options,
    required this.selected,
    required this.accent,
    required this.isDark,
    required this.onChanged,
  });

  @override
  State<_TimeStrip> createState() => _TimeStripState();
}

class _TimeStripState extends State<_TimeStrip> {
  late final ScrollController _scroll;
  static const double _itemW = 52.0;
  static const double _gap = 8.0;

  @override
  void initState() {
    super.initState();
    _scroll = ScrollController();
    WidgetsBinding.instance
        .addPostFrameCallback((_) => _scrollToSelected(animate: false));
  }

  @override
  void didUpdateWidget(_TimeStrip old) {
    super.didUpdateWidget(old);
    if (old.selected != widget.selected) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToSelected());
    }
  }

  void _scrollToSelected({bool animate = true}) {
    if (!_scroll.hasClients) return;
    final idx = widget.options.indexOf(widget.selected);
    if (idx < 0) return;
    final viewport = _scroll.position.viewportDimension;
    final target = idx * (_itemW + _gap) - viewport / 2 + _itemW / 2;
    final clamped = target.clamp(0.0, _scroll.position.maxScrollExtent);
    if (animate) {
      _scroll.animateTo(clamped,
          duration: const Duration(milliseconds: 280),
          curve: Curves.easeOutCubic);
    } else {
      _scroll.jumpTo(clamped);
    }
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 46,
      child: ListView.separated(
        controller: _scroll,
        scrollDirection: Axis.horizontal,
        physics: const ClampingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 2),
        itemCount: widget.options.length,
        separatorBuilder: (_, __) => const SizedBox(width: _gap),
        itemBuilder: (context, i) {
          final m = widget.options[i];
          final isSel = m == widget.selected;
          return GestureDetector(
            onTap: () => widget.onChanged(m),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              width: _itemW,
              decoration: BoxDecoration(
                color: isSel
                    ? widget.accent
                    : (widget.isDark
                        ? Colors.white.withOpacity(0.05)
                        : AppTheme.ink.withOpacity(0.04)),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: isSel
                      ? widget.accent
                      : (widget.isDark
                          ? Colors.white.withOpacity(0.10)
                          : AppTheme.ink.withOpacity(0.10)),
                  width: isSel ? 0 : 1,
                ),
                boxShadow: isSel
                    ? [
                        BoxShadow(
                          color: widget.accent.withOpacity(0.32),
                          blurRadius: 10,
                          offset: const Offset(0, 4),
                        ),
                      ]
                    : null,
              ),
              child: Center(
                child: AnimatedDefaultTextStyle(
                  duration: const Duration(milliseconds: 180),
                  style: TextStyle(
                    color: isSel
                        ? (widget.isDark ? AppTheme.ink : Colors.white)
                        : (widget.isDark
                            ? Colors.white.withOpacity(0.68)
                            : AppTheme.ink.withOpacity(0.62)),
                    fontSize: isSel ? 17 : 14,
                    fontWeight: isSel ? FontWeight.w900 : FontWeight.w700,
                  ),
                  child: Text('$m'),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
