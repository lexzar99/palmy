import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../core/order_ui.dart';
import '../core/theme.dart';
import '../models/order_model.dart';
import '../providers/order_provider.dart';
import 'accept_result_screen.dart';
import 'order_detail_screen.dart';

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
    10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90
  ];

  @override
  void initState() {
    super.initState();
    _selectedMinutes = widget.order.type == 'PICKUP' ? 20 : 40;
  }

  Future<void> _accept() async {
    if (_busy || _rejecting) return;
    setState(() => _busy = true);

    final provider = Provider.of<OrderProvider>(context, listen: false);
    final ok = await provider.updateStatus(
      widget.order.id,
      'PREPARING',
      estimatedTime: _selectedMinutes,
    );

    if (!mounted) return;
    if (!ok) {
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Kunde inte godkänna order')),
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
        title: const Text('Neka order?',
            style: TextStyle(fontWeight: FontWeight.w900)),
        content: const Text(
            'Ordern avvisas och kunden meddelas. Kan inte ångras.'),
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
                  borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Neka',
                style: TextStyle(fontWeight: FontWeight.w900)),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;
    setState(() => _rejecting = true);

    final provider = Provider.of<OrderProvider>(context, listen: false);
    await provider.updateStatus(widget.order.id, 'REJECTED');
    if (!mounted) return;
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final order = widget.order;
    final isDark = AppTheme.isDark(context);
    final accent = OrderUi.typeColor(order.type);
    final goldColor = isDark ? AppTheme.gold : AppTheme.brandGold;

    return Scaffold(
      backgroundColor: isDark ? AppTheme.midnight : AppTheme.mist,
      body: SafeArea(
        child: Column(
          children: [
            _MinimalHeader(order: order, goldColor: goldColor),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                children: [
                  _CustomerCard(order: order, goldColor: goldColor, isDark: isDark),
                  if (order.note?.isNotEmpty == true ||
                      order.deliveryInstructions?.isNotEmpty == true) ...[
                    const SizedBox(height: 12),
                    _NoteCard(order: order, goldColor: goldColor, isDark: isDark),
                  ],
                  const SizedBox(height: 12),
                  _TypeRow(type: order.type, accent: accent, isDark: isDark),
                  const SizedBox(height: 12),
                  _OrderSection(
                      order: order, goldColor: goldColor, isDark: isDark),
                ],
              ),
            ),
            _BottomBar(
              options: _minuteOptions,
              selected: _selectedMinutes,
              accent: accent,
              goldColor: goldColor,
              isDark: isDark,
              busy: _busy,
              rejecting: _rejecting,
              order: order,
              onTimeChanged: (m) => setState(() => _selectedMinutes = m),
              onAccept: _accept,
              onReject: _reject,
            ),
          ],
        ),
      ),
    );
  }
}

// ── Minimal header ────────────────────────────────────────────────────────────
class _MinimalHeader extends StatelessWidget {
  final OrderModel order;
  final Color goldColor;
  const _MinimalHeader({required this.order, required this.goldColor});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 6, 8, 6),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).maybePop(),
            icon: Icon(Icons.arrow_back_rounded,
                color: AppTheme.isDark(context)
                    ? Colors.white
                    : AppTheme.ink),
          ),
          Expanded(
            child: Text(
              'Order #${order.orderNumber}',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w800,
                color: AppTheme.mutedColor(context),
                letterSpacing: 0.2,
              ),
            ),
          ),
          IconButton(
            tooltip: 'Alla detaljer',
            icon: Icon(Icons.info_outline_rounded,
                color: AppTheme.mutedColor(context)),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(
                  builder: (_) => OrderDetailScreen(order: order)),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Customer card ─────────────────────────────────────────────────────────────
class _CustomerCard extends StatelessWidget {
  final OrderModel order;
  final Color goldColor;
  final bool isDark;
  const _CustomerCard(
      {required this.order, required this.goldColor, required this.isDark});

  @override
  Widget build(BuildContext context) {
    return _Card(
      isDark: isDark,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Avatar
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: goldColor.withOpacity(0.14),
              shape: BoxShape.circle,
            ),
            child: Icon(Icons.person_rounded, color: goldColor, size: 26),
          ),
          const SizedBox(width: 14),
          // Info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  order.customerName,
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -0.5,
                    color: isDark ? Colors.white : AppTheme.ink,
                  ),
                ),
                const SizedBox(height: 6),
                _ContactRow(
                  icon: Icons.phone_rounded,
                  text: order.customerPhone,
                  color: goldColor,
                ),
                if (order.type == 'DELIVERY' &&
                    order.deliveryStreet != null) ...[
                  const SizedBox(height: 4),
                  _ContactRow(
                    icon: Icons.location_on_rounded,
                    text:
                        '${order.deliveryStreet}, ${order.deliveryZip ?? ''} ${order.deliveryCity ?? ''}'
                            .trim(),
                    color: goldColor,
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          // Call button
          GestureDetector(
            onTap: () {
              Clipboard.setData(
                  ClipboardData(text: order.customerPhone));
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text('Nummer kopierat: ${order.customerPhone}'),
                  duration: const Duration(seconds: 2),
                ),
              );
            },
            child: Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                color: goldColor.withOpacity(0.12),
                shape: BoxShape.circle,
                border: Border.all(color: goldColor.withOpacity(0.35)),
              ),
              child: Icon(Icons.phone_rounded, color: goldColor, size: 20),
            ),
          ),
        ],
      ),
    );
  }
}

class _ContactRow extends StatelessWidget {
  final IconData icon;
  final String text;
  final Color color;
  const _ContactRow(
      {required this.icon, required this.text, required this.color});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 13, color: color),
        const SizedBox(width: 5),
        Expanded(
          child: Text(
            text,
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

// ── Note card ─────────────────────────────────────────────────────────────────
class _NoteCard extends StatelessWidget {
  final OrderModel order;
  final Color goldColor;
  final bool isDark;
  const _NoteCard(
      {required this.order, required this.goldColor, required this.isDark});

  @override
  Widget build(BuildContext context) {
    final text = [
      if (order.note?.isNotEmpty == true) order.note!,
      if (order.deliveryInstructions?.isNotEmpty == true)
        order.deliveryInstructions!,
    ].join('\n');

    return _Card(
      isDark: isDark,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.chat_bubble_outline_rounded, color: goldColor, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'NOTERING TILL RESTAURANGEN',
                  style: TextStyle(
                    color: goldColor,
                    fontSize: 11,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1.4,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  text,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: isDark ? Colors.white : AppTheme.ink,
                    height: 1.4,
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

// ── Type row (display only) ───────────────────────────────────────────────────
class _TypeRow extends StatelessWidget {
  final String type;
  final Color accent;
  final bool isDark;
  const _TypeRow(
      {required this.type, required this.accent, required this.isDark});

  @override
  Widget build(BuildContext context) {
    final isPickup = type == 'PICKUP';
    final bg = isDark ? const Color(0xFF1A2740) : Colors.white;
    final borderC = isDark
        ? Colors.white.withOpacity(0.10)
        : AppTheme.ink.withOpacity(0.10);

    return Container(
      height: 48,
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: borderC, width: 1.2),
      ),
      child: Row(
        children: [
          _TypeTab(
            label: 'AVHÄMTNING',
            icon: Icons.shopping_bag_rounded,
            active: isPickup,
            accent: accent,
            isDark: isDark,
            first: true,
          ),
          Container(width: 1, color: borderC),
          _TypeTab(
            label: 'UTKÖRNING',
            icon: Icons.delivery_dining_rounded,
            active: !isPickup,
            accent: accent,
            isDark: isDark,
            first: false,
          ),
        ],
      ),
    );
  }
}

class _TypeTab extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool active;
  final Color accent;
  final bool isDark;
  final bool first;
  const _TypeTab({
    required this.label,
    required this.icon,
    required this.active,
    required this.accent,
    required this.isDark,
    required this.first,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        decoration: BoxDecoration(
          color: active ? accent : Colors.transparent,
          borderRadius: BorderRadius.horizontal(
            left: first ? const Radius.circular(13) : Radius.zero,
            right: first ? Radius.zero : const Radius.circular(13),
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              size: 16,
              color: active
                  ? Colors.white
                  : (isDark
                      ? Colors.white.withOpacity(0.40)
                      : AppTheme.ink.withOpacity(0.35)),
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w900,
                letterSpacing: 0.8,
                color: active
                    ? Colors.white
                    : (isDark
                        ? Colors.white.withOpacity(0.40)
                        : AppTheme.ink.withOpacity(0.35)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Order section ─────────────────────────────────────────────────────────────
class _OrderSection extends StatelessWidget {
  final OrderModel order;
  final Color goldColor;
  final bool isDark;
  const _OrderSection(
      {required this.order, required this.goldColor, required this.isDark});

  @override
  Widget build(BuildContext context) {
    return _Card(
      isDark: isDark,
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
            child: Row(
              children: [
                Icon(Icons.receipt_long_rounded, color: goldColor, size: 18),
                const SizedBox(width: 8),
                Text(
                  'BESTÄLLNING',
                  style: TextStyle(
                    color: goldColor,
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1.6,
                  ),
                ),
                const Spacer(),
                Text(
                  'Order #${order.orderNumber}',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: goldColor,
                  ),
                ),
              ],
            ),
          ),
          Divider(
              height: 1,
              color: isDark
                  ? Colors.white.withOpacity(0.08)
                  : AppTheme.ink.withOpacity(0.07)),
          // Items
          ...order.items.asMap().entries.map((entry) {
            final i = entry.key;
            final item = entry.value;
            return Column(
              children: [
                _ItemRow(item: item, goldColor: goldColor, isDark: isDark),
                if (i < order.items.length - 1)
                  Divider(
                    height: 1,
                    indent: 16,
                    endIndent: 16,
                    color: isDark
                        ? Colors.white.withOpacity(0.06)
                        : AppTheme.ink.withOpacity(0.06),
                  ),
              ],
            );
          }),
          const SizedBox(height: 4),
          // Total row
          Divider(
              height: 1,
              color: isDark
                  ? Colors.white.withOpacity(0.08)
                  : AppTheme.ink.withOpacity(0.07)),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
            child: Row(
              children: [
                Text(
                  'Totalt',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w900,
                    color: isDark ? Colors.white : AppTheme.ink,
                  ),
                ),
                const Spacer(),
                Text(
                  OrderUi.formatCurrency(order.total),
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                    color: goldColor,
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

class _ItemRow extends StatelessWidget {
  final OrderItemModel item;
  final Color goldColor;
  final bool isDark;
  const _ItemRow(
      {required this.item, required this.goldColor, required this.isDark});

  @override
  Widget build(BuildContext context) {
    final hasExtras = item.selectedExtras.isNotEmpty;
    final hasNote = item.note?.isNotEmpty == true;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Qty badge
          Container(
            width: 30,
            height: 30,
            alignment: Alignment.center,
            margin: const EdgeInsets.only(top: 1),
            decoration: BoxDecoration(
              color: goldColor.withOpacity(0.12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              '${item.quantity}x',
              style: TextStyle(
                color: goldColor,
                fontWeight: FontWeight.w900,
                fontSize: 12,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Name + price
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        item.productName,
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w900,
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
                        fontWeight: FontWeight.w900,
                        color: goldColor,
                      ),
                    ),
                  ],
                ),
                // Extras: single line with · separator
                if (hasExtras) ...[
                  const SizedBox(height: 3),
                  Text(
                    item.selectedExtras.join(' · '),
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: isDark
                          ? Colors.white.withOpacity(0.50)
                          : AppTheme.ink.withOpacity(0.45),
                      height: 1.4,
                    ),
                  ),
                ],
                // Item note
                if (hasNote) ...[
                  const SizedBox(height: 5),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.edit_outlined,
                          size: 12,
                          color: AppTheme.brandGold.withOpacity(0.90)),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          'Notering: ${item.note}',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: AppTheme.brandGold.withOpacity(0.90),
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                      ),
                    ],
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

// ── Bottom bar ────────────────────────────────────────────────────────────────
class _BottomBar extends StatelessWidget {
  final List<int> options;
  final int selected;
  final Color accent;
  final Color goldColor;
  final bool isDark;
  final bool busy;
  final bool rejecting;
  final OrderModel order;
  final ValueChanged<int> onTimeChanged;
  final VoidCallback onAccept;
  final VoidCallback onReject;

  const _BottomBar({
    required this.options,
    required this.selected,
    required this.accent,
    required this.goldColor,
    required this.isDark,
    required this.busy,
    required this.rejecting,
    required this.order,
    required this.onTimeChanged,
    required this.onAccept,
    required this.onReject,
  });

  @override
  Widget build(BuildContext context) {
    final borderC = isDark
        ? Colors.white.withOpacity(0.08)
        : AppTheme.ink.withOpacity(0.08);

    return Container(
      decoration: BoxDecoration(
        color: isDark ? AppTheme.storm : Colors.white,
        border: Border(top: BorderSide(color: borderC, width: 1)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Time label row
              Row(
                children: [
                  Icon(Icons.schedule_rounded,
                      size: 15, color: AppTheme.mutedColor(context)),
                  const SizedBox(width: 6),
                  Text(
                    'ÖNSKAD TID',
                    style: TextStyle(
                      color: AppTheme.mutedColor(context),
                      fontSize: 11,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.4,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                    decoration: BoxDecoration(
                      color: goldColor.withOpacity(0.14),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      '$selected min',
                      style: TextStyle(
                        color: goldColor,
                        fontSize: 12,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  const Spacer(),
                  // Ready time estimate
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        'Beräknas klar',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.mutedColor(context),
                        ),
                      ),
                      Text(
                        _readyTime(selected),
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w900,
                          color: goldColor,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 10),
              // Horizontal time scroll
              _TimePicker(
                options: options,
                selected: selected,
                accent: goldColor,
                isDark: isDark,
                onChanged: onTimeChanged,
              ),
              const SizedBox(height: 14),
              // NEKA + ACCEPTERA
              Row(
                children: [
                  // NEKA button
                  GestureDetector(
                    onTap: rejecting ? null : onReject,
                    child: Container(
                      width: 62,
                      height: 56,
                      decoration: BoxDecoration(
                        color: AppTheme.danger.withOpacity(0.10),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                            color: AppTheme.danger.withOpacity(0.50),
                            width: 1.4),
                      ),
                      child: rejecting
                          ? const Center(
                              child: SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                    color: AppTheme.danger, strokeWidth: 2.5),
                              ),
                            )
                          : Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: const [
                                Icon(Icons.close_rounded,
                                    color: AppTheme.danger, size: 20),
                                SizedBox(height: 2),
                                Text(
                                  'NEKA',
                                  style: TextStyle(
                                    color: AppTheme.danger,
                                    fontSize: 10,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: 0.8,
                                  ),
                                ),
                              ],
                            ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  // ACCEPTERA button
                  Expanded(
                    child: GestureDetector(
                      onTap: busy ? null : onAccept,
                      child: Container(
                        height: 56,
                        decoration: BoxDecoration(
                          color: busy
                              ? accent.withOpacity(0.60)
                              : accent,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: busy
                            ? const Center(
                                child: SizedBox(
                                  width: 22,
                                  height: 22,
                                  child: CircularProgressIndicator(
                                      color: Colors.white, strokeWidth: 3),
                                ),
                              )
                            : Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  const Icon(Icons.check_rounded,
                                      color: Colors.white, size: 20),
                                  const SizedBox(width: 8),
                                  const Text(
                                    'ACCEPTERA ORDER',
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontSize: 14,
                                      fontWeight: FontWeight.w900,
                                      letterSpacing: 1.0,
                                    ),
                                  ),
                                ],
                              ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _readyTime(int minutes) {
    final ready = DateTime.now().add(Duration(minutes: minutes));
    final h = ready.hour.toString().padLeft(2, '0');
    final m = ready.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }
}

// ── Time picker (StatefulWidget, centers selected) ────────────────────────────
class _TimePicker extends StatefulWidget {
  final List<int> options;
  final int selected;
  final Color accent;
  final bool isDark;
  final ValueChanged<int> onChanged;

  const _TimePicker({
    required this.options,
    required this.selected,
    required this.accent,
    required this.isDark,
    required this.onChanged,
  });

  @override
  State<_TimePicker> createState() => _TimePickerState();
}

class _TimePickerState extends State<_TimePicker> {
  late final ScrollController _scroll;
  static const double _itemW = 58.0;
  static const double _gap = 8.0;

  @override
  void initState() {
    super.initState();
    _scroll = ScrollController();
    WidgetsBinding.instance
        .addPostFrameCallback((_) => _scrollToSelected(animate: false));
  }

  @override
  void didUpdateWidget(_TimePicker old) {
    super.didUpdateWidget(old);
    if (old.selected != widget.selected) {
      WidgetsBinding.instance
          .addPostFrameCallback((_) => _scrollToSelected());
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
          duration: const Duration(milliseconds: 260),
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
      height: 54,
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
                        ? Colors.white.withOpacity(0.06)
                        : AppTheme.ink.withOpacity(0.05)),
                borderRadius: BorderRadius.circular(13),
                border: Border.all(
                  color: isSel
                      ? widget.accent
                      : (widget.isDark
                          ? Colors.white.withOpacity(0.12)
                          : AppTheme.ink.withOpacity(0.12)),
                  width: isSel ? 2 : 1,
                ),
              ),
              child: Center(
                child: AnimatedDefaultTextStyle(
                  duration: const Duration(milliseconds: 180),
                  style: TextStyle(
                    color: isSel
                        ? Colors.white
                        : (widget.isDark
                            ? Colors.white.withOpacity(0.60)
                            : AppTheme.ink.withOpacity(0.55)),
                    fontSize: isSel ? 20 : 17,
                    fontWeight:
                        isSel ? FontWeight.w900 : FontWeight.w700,
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

// ── Shared card container ─────────────────────────────────────────────────────
class _Card extends StatelessWidget {
  final Widget child;
  final bool isDark;
  final EdgeInsets? padding;
  const _Card({required this.child, required this.isDark, this.padding});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding ?? const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF16233D) : Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: isDark
              ? Colors.white.withOpacity(0.09)
              : AppTheme.ink.withOpacity(0.09),
          width: 1.2,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(isDark ? 0.18 : 0.05),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: child,
    );
  }
}
