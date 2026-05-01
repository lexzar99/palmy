import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/order_ui.dart';
import '../core/theme.dart';
import '../models/order_model.dart';
import '../providers/order_provider.dart';
import 'accept_result_screen.dart';
import 'order_detail_screen.dart';

/// Stripped-down "take the order" page focused on the action.
///
/// No insights, no extra panels — only what's needed to accept:
///   • who ordered, what they ordered, total
///   • a big time wheel (20 / 40 default depending on type)
///   • one prominent accept button
///
/// All the diagnostic / extra info lives on the full OrderDetailScreen,
/// reachable via the (i) icon in the corner.
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

  static const _minuteOptions = [10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90];

  @override
  void initState() {
    super.initState();
    // Pickup → 20 min default, Delivery → 40 min default.
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
                    const SizedBox(height: 14),
                    _ItemsCard(order: order, accent: accent),
                    if (order.note?.isNotEmpty == true ||
                        order.deliveryInstructions?.isNotEmpty == true) ...[
                      const SizedBox(height: 14),
                      _NoteCard(order: order),
                    ],
                    const SizedBox(height: 18),
                    _TimePicker(
                      options: _minuteOptions,
                      selected: _selectedMinutes,
                      accent: accent,
                      onChanged: (m) => setState(() => _selectedMinutes = m),
                    ),
                    const SizedBox(height: 8),
                  ],
                ),
              ),
              _AcceptButton(
                busy: _busy,
                minutes: _selectedMinutes,
                accent: accent,
                onTap: _accept,
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
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
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
                const SizedBox(height: 2),
                Text(
                  OrderUi.typeLabel(order.type).toUpperCase(),
                  style: TextStyle(
                    color: accent,
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -0.4,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Detaljer',
            icon: const Icon(Icons.info_outline_rounded),
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => OrderDetailScreen(order: order),
                ),
              );
            },
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
        border: Border.all(color: accent.withOpacity(0.18)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  order.customerName,
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -0.6,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Text(
                OrderUi.formatCurrency(order.total),
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                  color: accent,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Icon(Icons.phone_rounded, size: 14, color: accent),
              const SizedBox(width: 6),
              Text(
                order.customerPhone,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: accent,
                ),
              ),
            ],
          ),
          if (order.type == 'DELIVERY' && order.deliveryStreet != null) ...[
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  Icons.location_on_rounded,
                  size: 14,
                  color: AppTheme.mutedColor(context),
                ),
                const SizedBox(width: 6),
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
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.panelColor(context),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppTheme.borderColor(context)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var i = 0; i < order.items.length; i++) ...[
            _itemRow(context, order.items[i], accent),
            if (i < order.items.length - 1)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Divider(
                  height: 1,
                  color: AppTheme.borderColor(context),
                ),
              ),
          ],
        ],
      ),
    );
  }

  Widget _itemRow(BuildContext context, OrderItemModel item, Color accent) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 38,
          height: 38,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: accent.withOpacity(0.16),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(
            '${item.quantity}×',
            style: TextStyle(
              color: accent,
              fontWeight: FontWeight.w900,
              fontSize: 14,
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                item.productName,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                ),
              ),
              if (item.selectedExtras.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  item.selectedExtras
                      .map((e) => e.toString())
                      .join(' • '),
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
        Text(
          OrderUi.formatCurrency(item.subtotal),
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
        ),
      ],
    );
  }
}

// ── Note card (only shows when there's something to show) ─────────────────────
class _NoteCard extends StatelessWidget {
  final OrderModel order;
  const _NoteCard({required this.order});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.warning.withOpacity(0.12),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.warning.withOpacity(0.4)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.priority_high_rounded,
            color: AppTheme.warning,
            size: 18,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (order.note?.isNotEmpty == true)
                  Text(
                    order.note!,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                    ),
                  ),
                if (order.deliveryInstructions?.isNotEmpty == true) ...[
                  if (order.note?.isNotEmpty == true) const SizedBox(height: 6),
                  Text(
                    order.deliveryInstructions!,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
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

// ── Time picker ───────────────────────────────────────────────────────────────
class _TimePicker extends StatelessWidget {
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
  Widget build(BuildContext context) {
    final initialIndex = options.indexOf(selected);
    final controller = ScrollController(
      initialScrollOffset: initialIndex <= 0 ? 0.0 : initialIndex * 70.0,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4),
          child: Row(
            children: [
              Text(
                'TID',
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
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: 64,
          child: ListView.separated(
            controller: controller,
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            itemCount: options.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (context, i) {
              final m = options[i];
              final isSel = m == selected;
              return GestureDetector(
                onTap: () => onChanged(m),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  width: 62,
                  decoration: BoxDecoration(
                    color: isSel ? accent : AppTheme.panelColor(context),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(
                      color: isSel ? accent : AppTheme.borderColor(context),
                      width: isSel ? 2 : 1,
                    ),
                  ),
                  child: Center(
                    child: Text(
                      '$m',
                      style: TextStyle(
                        color: isSel
                            ? Colors.white
                            : Theme.of(context).textTheme.titleLarge?.color,
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

// ── Big accept button ─────────────────────────────────────────────────────────
class _AcceptButton extends StatelessWidget {
  final bool busy;
  final int minutes;
  final Color accent;
  final VoidCallback onTap;

  const _AcceptButton({
    required this.busy,
    required this.minutes,
    required this.accent,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        child: SizedBox(
          width: double.infinity,
          height: 64,
          child: ElevatedButton(
            onPressed: busy ? null : onTap,
            style: ElevatedButton.styleFrom(
              backgroundColor: accent,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(20),
              ),
              elevation: 0,
            ),
            child: busy
                ? const SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(
                      color: Colors.white,
                      strokeWidth: 3,
                    ),
                  )
                : Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(
                        Icons.check_rounded,
                        color: Colors.white,
                        size: 26,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Ta emot · $minutes min',
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.2,
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}
