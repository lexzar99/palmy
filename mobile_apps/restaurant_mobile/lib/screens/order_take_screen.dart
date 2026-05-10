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
    // Omedelbar feedback INNAN nätverksanrop – så snabb dubbel-tap
    // visuellt syns blockerad. setState först, sen haptic.
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
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800),
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
      body: AbsorbPointer(
        // Blockera ALLA touch-events (inkl. accept-knappen själv) så fort
        // ett accept/reject pågår – garanterar att dubbeltap inte triggar
        // två requests innan setState hunnit re-rendera.
        absorbing: _busy || _rejecting,
        child: SafeArea(
          child: Column(
          children: [
            _MinimalHeader(order: order, accent: accent),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                children: [
                  _CustomerCard(order: order, accent: accent, isDark: isDark),
                  if (order.note?.isNotEmpty == true ||
                      order.deliveryInstructions?.isNotEmpty == true) ...[
                    const SizedBox(height: 10),
                    _NoteCard(order: order, accent: accent, isDark: isDark),
                  ],
                  const SizedBox(height: 10),
                  _OrderSection(
                      order: order, accent: accent, isDark: isDark),
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
      ),
    );
  }
}

// ── Minimal header med stort Order # + typ-pill ─────────────────────────────
class _MinimalHeader extends StatelessWidget {
  final OrderModel order;
  final Color accent;
  const _MinimalHeader({required this.order, required this.accent});

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final isPickup = order.type == 'PICKUP';
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 4, 8, 8),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).maybePop(),
            icon: Icon(Icons.arrow_back_rounded,
                color: isDark ? Colors.white : AppTheme.ink),
          ),
          Expanded(
            child: Row(
              children: [
                Text(
                  '#${order.orderNumber}',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -0.4,
                    color: isDark ? Colors.white : AppTheme.ink,
                  ),
                ),
                const SizedBox(width: 10),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: accent.withOpacity(0.14),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        isPickup
                            ? Icons.shopping_bag_rounded
                            : Icons.delivery_dining_rounded,
                        size: 12,
                        color: accent,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        isPickup ? 'AVHÄMTNING' : 'LEVERANS',
                        style: TextStyle(
                          color: accent,
                          fontSize: 10,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.6,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
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
  final Color accent;
  final bool isDark;
  const _CustomerCard(
      {required this.order, required this.accent, required this.isDark});

  @override
  Widget build(BuildContext context) {
    return _Card(
      isDark: isDark,
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  order.customerName,
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
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
                if (order.type == 'DELIVERY' &&
                    order.deliveryStreet != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    '${order.deliveryStreet}, ${order.deliveryZip ?? ''} ${order.deliveryCity ?? ''}'
                        .trim(),
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.mutedColor(context),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 10),
          GestureDetector(
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
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: accent.withOpacity(0.12),
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.phone_rounded, color: accent, size: 18),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Note card – tunn rad med vänster färg-kant ─────────────────────────────
class _NoteCard extends StatelessWidget {
  final OrderModel order;
  final Color accent;
  final bool isDark;
  const _NoteCard(
      {required this.order, required this.accent, required this.isDark});

  @override
  Widget build(BuildContext context) {
    final hasInstruction = order.deliveryInstructions?.isNotEmpty == true;
    final hasNote = order.note?.isNotEmpty == true;

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: accent.withOpacity(0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border(left: BorderSide(color: accent, width: 3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (hasInstruction) ...[
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.directions_walk_rounded, color: accent, size: 16),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    OrderUi.deliveryInstructionLabel(order.deliveryInstructions),
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w900,
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
                Icon(Icons.chat_bubble_outline_rounded, color: accent, size: 16),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    order.note!,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: isDark
                          ? Colors.white.withOpacity(0.85)
                          : AppTheme.ink.withOpacity(0.80),
                      height: 1.35,
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

// ── Order section – ren lista utan tung header ──────────────────────────────
class _OrderSection extends StatelessWidget {
  final OrderModel order;
  final Color accent;
  final bool isDark;
  const _OrderSection(
      {required this.order, required this.accent, required this.isDark});

  @override
  Widget build(BuildContext context) {
    return _Card(
      isDark: isDark,
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ...order.items.asMap().entries.map((entry) {
            final i = entry.key;
            final item = entry.value;
            return Column(
              children: [
                _ItemRow(item: item, accent: accent, isDark: isDark),
                if (i < order.items.length - 1)
                  Divider(
                    height: 1,
                    indent: 14,
                    endIndent: 14,
                    color: isDark
                        ? Colors.white.withOpacity(0.06)
                        : AppTheme.ink.withOpacity(0.06),
                  ),
              ],
            );
          }),
          Divider(
              height: 1,
              color: isDark
                  ? Colors.white.withOpacity(0.08)
                  : AppTheme.ink.withOpacity(0.07)),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
            child: Row(
              children: [
                Text(
                  'Totalt',
                  style: TextStyle(
                    fontSize: 14,
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
                    color: accent,
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
  final Color accent;
  final bool isDark;
  const _ItemRow(
      {required this.item, required this.accent, required this.isDark});

  @override
  Widget build(BuildContext context) {
    final hasExtras = item.selectedExtras.isNotEmpty;
    final hasNote = item.note?.isNotEmpty == true;

    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 28,
            height: 28,
            alignment: Alignment.center,
            margin: const EdgeInsets.only(top: 1),
            decoration: BoxDecoration(
              color: accent.withOpacity(0.12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              '${item.quantity}×',
              style: TextStyle(
                color: accent,
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
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        item.productName,
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
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
                  const SizedBox(height: 4),
                  ...item.selectedExtras.map((e) {
                    final name =
                        e is Map ? (e['name'] ?? '').toString() : e.toString();
                    final price = e is Map
                        ? ((e['price'] as num?)?.toDouble() ?? 0.0)
                        : 0.0;
                    final requiredFlag = e is Map ? e['required'] as bool? : null;
                    final isMandatory = requiredFlag ?? (price == 0);
                    return Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Row(
                        children: [
                          Text(
                            isMandatory ? '-- ' : '++ ',
                            style: TextStyle(
                              fontSize: isMandatory ? 13 : 12,
                              fontWeight: FontWeight.w900,
                              color: isMandatory
                                  ? (isDark ? Colors.white : AppTheme.ink)
                                  : accent,
                            ),
                          ),
                          Expanded(
                            child: Text(
                              name,
                              style: TextStyle(
                                fontSize: isMandatory ? 13 : 12,
                                fontWeight: isMandatory
                                    ? FontWeight.w800
                                    : FontWeight.w700,
                                color: isMandatory
                                    ? (isDark ? Colors.white : AppTheme.ink)
                                    : accent,
                              ),
                            ),
                          ),
                          if (!isMandatory)
                            Text(
                              OrderUi.formatCurrency(price),
                              style: TextStyle(
                                fontSize: 12,
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
                  const SizedBox(height: 4),
                  Text(
                    '✎  ${item.note}',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: accent,
                      fontStyle: FontStyle.italic,
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
              // Horizontal scroll pill picker (mix: info-rad ovan + scroll)
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

// ── Horizontal scroll time picker ────────────────────────────────────────────
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
