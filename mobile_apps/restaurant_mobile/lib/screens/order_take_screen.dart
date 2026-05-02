import 'package:flutter/material.dart';
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

  static const _minuteOptions = [
    10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90
  ];

  @override
  void initState() {
    super.initState();
    _selectedMinutes = widget.order.type == 'PICKUP' ? 20 : 40;
  }

  Future<void> _accept() async {
    if (_busy) return;
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

  @override
  Widget build(BuildContext context) {
    final order = widget.order;
    final accent = OrderUi.typeColor(order.type);

    return Scaffold(
      body: Container(
        decoration: BoxDecoration(gradient: AppTheme.shellGradient(context)),
        child: SafeArea(
          child: Column(
            children: [
              _Header(order: order, accent: accent),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                  children: [
                    _CustomerCard(order: order, accent: accent),
                    const SizedBox(height: 12),
                    _ItemsCard(order: order, accent: accent),
                    if (order.note?.isNotEmpty == true ||
                        order.deliveryInstructions?.isNotEmpty == true) ...[
                      const SizedBox(height: 12),
                      _NoteCard(order: order),
                    ],
                  ],
                ),
              ),
              // Fixed bottom: time picker + accept button
              _BottomBar(
                options: _minuteOptions,
                selected: _selectedMinutes,
                accent: accent,
                busy: _busy,
                onTimeChanged: (m) => setState(() => _selectedMinutes = m),
                onAccept: _accept,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Header ────────────────────────────────────────────────────────────────────
class _Header extends StatelessWidget {
  final OrderModel order;
  final Color accent;
  const _Header({required this.order, required this.accent});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 8, 8, 4),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).maybePop(),
            icon: const Icon(Icons.arrow_back_rounded),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '#${order.orderNumber}',
                  style: TextStyle(
                    color: AppTheme.mutedColor(context),
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.1,
                  ),
                ),
                const SizedBox(height: 1),
                Row(
                  children: [
                    Text(
                      OrderUi.typeLabel(order.type).toUpperCase(),
                      style: TextStyle(
                        color: accent,
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -0.4,
                      ),
                    ),
                    if (order.scheduledFor != null) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppTheme.gold.withOpacity(0.18),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          'Förbeställd',
                          style: const TextStyle(
                            color: AppTheme.gold,
                            fontSize: 11,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Alla detaljer',
            icon: const Icon(Icons.info_outline_rounded),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => OrderDetailScreen(order: order),
              ),
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
  const _CustomerCard({required this.order, required this.accent});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.panelColor(context),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: accent.withOpacity(0.22)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  order.customerName,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -0.4,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Text(
                OrderUi.formatCurrency(order.total),
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                  color: accent,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Icon(Icons.phone_rounded, size: 13, color: accent),
              const SizedBox(width: 5),
              Text(
                order.customerPhone,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: accent,
                ),
              ),
            ],
          ),
          if (order.type == 'DELIVERY' && order.deliveryStreet != null) ...[
            const SizedBox(height: 6),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.location_on_rounded,
                    size: 13, color: AppTheme.mutedColor(context)),
                const SizedBox(width: 5),
                Expanded(
                  child: Text(
                    '${order.deliveryStreet}, ${order.deliveryZip ?? ''} ${order.deliveryCity ?? ''}'
                        .trim(),
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.mutedColor(context),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

// ── Items card ────────────────────────────────────────────────────────────────
class _ItemsCard extends StatelessWidget {
  final OrderModel order;
  final Color accent;
  const _ItemsCard({required this.order, required this.accent});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 4),
      decoration: BoxDecoration(
        color: AppTheme.panelColor(context),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppTheme.borderColor(context)),
      ),
      child: Column(
        children: [
          for (var i = 0; i < order.items.length; i++) ...[
            _itemRow(context, order.items[i], accent),
            if (i < order.items.length - 1)
              Divider(
                height: 1,
                indent: 16,
                endIndent: 16,
                color: AppTheme.borderColor(context),
              ),
          ],
        ],
      ),
    );
  }

  Widget _itemRow(BuildContext context, OrderItemModel item, Color accent) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Product line
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 34,
                height: 34,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: accent.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  '${item.quantity}×',
                  style: TextStyle(
                    color: accent,
                    fontWeight: FontWeight.w900,
                    fontSize: 13,
                  ),
                ),
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(top: 7),
                  child: Text(
                    item.productName,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(top: 7),
                child: Text(
                  OrderUi.formatCurrency(item.subtotal),
                  style: const TextStyle(
                      fontSize: 14, fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ),
          // Stacked extras
          if (item.selectedExtras.isNotEmpty) ...[
            const SizedBox(height: 6),
            Padding(
              padding: const EdgeInsets.only(left: 45),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: item.selectedExtras
                    .map(
                      (e) => Padding(
                        padding: const EdgeInsets.only(bottom: 3),
                        child: Row(
                          children: [
                            Icon(Icons.add_rounded,
                                size: 13,
                                color: AppTheme.mutedColor(context)),
                            const SizedBox(width: 4),
                            Text(
                              e.toString(),
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: AppTheme.mutedColor(context),
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
          // Item-level note
          if (item.note?.isNotEmpty == true) ...[
            const SizedBox(height: 6),
            Padding(
              padding: const EdgeInsets.only(left: 45),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: AppTheme.warning.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(10),
                  border:
                      Border.all(color: AppTheme.warning.withOpacity(0.35)),
                ),
                child: Text(
                  item.note!,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.warning,
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ── Note card ─────────────────────────────────────────────────────────────────
class _NoteCard extends StatelessWidget {
  final OrderModel order;
  const _NoteCard({required this.order});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.warning.withOpacity(0.10),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.warning.withOpacity(0.38)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.priority_high_rounded,
              color: AppTheme.warning, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (order.note?.isNotEmpty == true)
                  Text(
                    order.note!,
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 14),
                  ),
                if (order.deliveryInstructions?.isNotEmpty == true) ...[
                  if (order.note?.isNotEmpty == true)
                    const SizedBox(height: 5),
                  Text(
                    order.deliveryInstructions!,
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, fontSize: 13),
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

// ── Bottom bar: time picker + accept button ───────────────────────────────────
class _BottomBar extends StatelessWidget {
  final List<int> options;
  final int selected;
  final Color accent;
  final bool busy;
  final ValueChanged<int> onTimeChanged;
  final VoidCallback onAccept;

  const _BottomBar({
    required this.options,
    required this.selected,
    required this.accent,
    required this.busy,
    required this.onTimeChanged,
    required this.onAccept,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppTheme.panelColor(context),
        border: Border(
          top: BorderSide(color: AppTheme.borderColor(context)),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Label row
              Row(
                children: [
                  Text(
                    'UPPSKATTAD TID',
                    style: TextStyle(
                      color: AppTheme.mutedColor(context),
                      fontSize: 11,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.2,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: accent.withOpacity(0.16),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      '$selected min',
                      style: TextStyle(
                        color: accent,
                        fontSize: 12,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              // Centered time scroller
              _TimePicker(
                options: options,
                selected: selected,
                accent: accent,
                onChanged: onTimeChanged,
              ),
              const SizedBox(height: 12),
              // Accept button
              SizedBox(
                width: double.infinity,
                height: 58,
                child: ElevatedButton(
                  onPressed: busy ? null : onAccept,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: accent,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(18),
                    ),
                    elevation: 0,
                  ),
                  child: busy
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 3,
                          ),
                        )
                      : Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.check_rounded,
                                color: Colors.white, size: 24),
                            const SizedBox(width: 8),
                            Text(
                              'Ta emot · $selected min',
                              style: const TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 0.2,
                              ),
                            ),
                          ],
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

// ── Time picker — StatefulWidget for centered auto-scroll ─────────────────────
class _TimePicker extends StatefulWidget {
  final List<int> options;
  final int selected;
  final Color accent;
  final ValueChanged<int> onChanged;

  const _TimePicker({
    required this.options,
    required this.selected,
    required this.accent,
    required this.onChanged,
  });

  @override
  State<_TimePicker> createState() => _TimePickerState();
}

class _TimePickerState extends State<_TimePicker> {
  late final ScrollController _scroll;
  static const double _itemW = 62.0;
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
    final target =
        idx * (_itemW + _gap) - viewport / 2 + _itemW / 2;
    final clamped =
        target.clamp(0.0, _scroll.position.maxScrollExtent);
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
      height: 60,
      child: ListView.separated(
        controller: _scroll,
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 4),
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
                    : AppTheme.panelColor(context).withOpacity(0.0),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: isSel
                      ? widget.accent
                      : AppTheme.borderColor(context),
                  width: isSel ? 2 : 1,
                ),
              ),
              child: Center(
                child: AnimatedDefaultTextStyle(
                  duration: const Duration(milliseconds: 180),
                  style: TextStyle(
                    color: isSel
                        ? Colors.white
                        : Theme.of(context).textTheme.bodyLarge?.color,
                    fontSize: isSel ? 22 : 18,
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
