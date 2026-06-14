import 'dart:convert';

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

  static const _allMinuteOptions = [
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
    // Förvald tillagningstid styrs av leveransmodellen (plattform=15, self=40,
    // avhämtning=20). Dynamiskt via OrderProvider — inget hårdkodat.
    _selectedMinutes = Provider.of<OrderProvider>(context, listen: false)
        .defaultPrepMinutes(widget.order.type);
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

  List<String> get _allergens {
    final raw = widget.order.allergens;
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

  @override
  Widget build(BuildContext context) {
    final order = widget.order;
    final isDark = AppTheme.isDark(context);
    final ink = isDark ? Colors.white : AppTheme.ink;
    final muted = AppTheme.mutedColor(context);
    final accent = OrderUi.colorFor(order);

    final hasInstr = order.deliveryInstructions?.isNotEmpty == true;
    final hasNote = order.note?.isNotEmpty == true;
    final allergens = _allergens;

    final eyebrow = TextStyle(
      fontSize: 11,
      fontWeight: FontWeight.w800,
      letterSpacing: 1.2,
      color: muted,
    );

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
                    padding: const EdgeInsets.fromLTRB(24, 4, 24, 16),
                    children: [
                      // Hero: typ-pill + datum
                      Row(
                        children: [
                          _TypePill(order: order, accent: accent),
                          const SizedBox(width: 10),
                          Text(
                            OrderUi.formatDateTime(order.createdAt),
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: muted,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      // Ordernummer + total
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
                                color: ink,
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
                              color: ink,
                            ),
                          ),
                        ],
                      ),

                      _rule(context),

                      // Kund — namn + telefon + adress, ring-knapp till höger
                      _CustomerBlock(order: order, ink: ink, muted: muted),

                      // Meddelande / instruktioner / allergener (boxad callout)
                      if (hasInstr || hasNote || allergens.isNotEmpty) ...[
                        const SizedBox(height: 14),
                        _MessageCallout(
                          order: order,
                          allergens: allergens,
                          ink: ink,
                        ),
                      ],

                      _rule(context),

                      // Beställning (kvitto)
                      Row(
                        children: [
                          Text('BESTÄLLNING', style: eyebrow),
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
                        return _ReceiptItem(
                          item: order.items[i],
                          ink: ink,
                          muted: muted,
                          isLast: i == order.items.length - 1,
                        );
                      }),

                      _rule(context),

                      // Total
                      Row(
                        children: [
                          Text('TOTALT',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 1.0,
                                color: muted,
                              )),
                          const Spacer(),
                          Text(
                            OrderUi.formatCurrency(order.total),
                            style: TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.w900,
                              letterSpacing: -0.5,
                              color: ink,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                _BottomBar(
                  options: _allMinuteOptions
                      .where((m) =>
                          m <=
                          Provider.of<OrderProvider>(context, listen: false)
                              .maxPrepMinutes(widget.order.type))
                      .toList(),
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

// Tunn skiljelinje (kvitto-känsla).
Widget _rule(BuildContext context) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: Divider(
        height: 1,
        thickness: 1,
        color: AppTheme.borderColor(context),
      ),
    );

// ── Header: tillbaka + neka ──────────────────────────────────────────────────
class _HeroHeader extends StatelessWidget {
  final VoidCallback onReject;
  const _HeroHeader({required this.onReject});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 12, 4),
      child: Row(
        children: [
          _IconButton(
            icon: Icons.arrow_back_rounded,
            onTap: () => Navigator.of(context).maybePop(),
          ),
          const Spacer(),
          TextButton(
            onPressed: onReject,
            child: const Text(
              'Neka',
              style: TextStyle(
                color: AppTheme.danger,
                fontSize: 15,
                fontWeight: FontWeight.w800,
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

// ── Typ-pill (leverans/avhämtning/förbeställning) ────────────────────────────
class _TypePill extends StatelessWidget {
  final OrderModel order;
  final Color accent;
  const _TypePill({required this.order, required this.accent});

  @override
  Widget build(BuildContext context) {
    final isPickup = order.type == 'PICKUP';
    final isPre = order.scheduledFor != null;
    final label =
        isPre ? 'FÖRBESTÄLLNING' : (isPickup ? 'AVHÄMTNING' : 'LEVERANS');
    final icon = isPre
        ? Icons.schedule_rounded
        : (isPickup
            ? Icons.shopping_bag_rounded
            : Icons.delivery_dining_rounded);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
      decoration: BoxDecoration(
        color: accent.withOpacity(0.14),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: accent, size: 14),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              color: accent,
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.8,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Kund: namn + telefon + adress, ring-knapp till höger ─────────────────────
class _CustomerBlock extends StatelessWidget {
  final OrderModel order;
  final Color ink;
  final Color muted;
  const _CustomerBlock({
    required this.order,
    required this.ink,
    required this.muted,
  });

  @override
  Widget build(BuildContext context) {
    final hasAddress =
        order.type == 'DELIVERY' && order.deliveryStreet != null;
    return Row(
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
                  color: ink,
                ),
              ),
              const SizedBox(height: 5),
              Text(
                order.customerPhone,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: muted,
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
                    color: muted,
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
                  behavior: SnackBarBehavior.floating,
                  content: Text('Nummer kopierat: ${order.customerPhone}'),
                  duration: const Duration(seconds: 2),
                ),
              );
            },
            child: Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: ink.withOpacity(0.10),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(Icons.phone_rounded, color: ink, size: 20),
            ),
          ),
        ),
      ],
    );
  }
}

// ── Meddelande / instruktioner / allergener (boxad callout) ──────────────────
class _MessageCallout extends StatelessWidget {
  final OrderModel order;
  final List<String> allergens;
  final Color ink;
  const _MessageCallout({
    required this.order,
    required this.allergens,
    required this.ink,
  });

  @override
  Widget build(BuildContext context) {
    final muted = AppTheme.mutedColor(context);
    final hasInstr = order.deliveryInstructions?.isNotEmpty == true;
    final hasNote = order.note?.isNotEmpty == true;
    final hasAllergens = allergens.isNotEmpty;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: muted.withOpacity(0.08),
        borderRadius: BorderRadius.circular(18),
        border: Border(left: BorderSide(color: muted, width: 4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (hasInstr)
            _NoteRow(
              icon: Icons.directions_walk_rounded,
              color: muted,
              text: OrderUi.deliveryInstructionLabel(
                  order.deliveryInstructions),
              textColor: ink,
            ),
          if (hasNote) ...[
            if (hasInstr) const SizedBox(height: 10),
            _NoteRow(
              icon: Icons.chat_bubble_outline_rounded,
              color: muted,
              text: order.note!,
              textColor: ink,
            ),
          ],
          if (hasAllergens) ...[
            if (hasInstr || hasNote) const SizedBox(height: 12),
            const Text(
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

// ── Kvitto-rad för en artikel ───────────────────────────────────────────────
class _ReceiptItem extends StatelessWidget {
  final OrderItemModel item;
  final Color ink;
  final Color muted;
  final bool isLast;
  const _ReceiptItem({
    required this.item,
    required this.ink,
    required this.muted,
    required this.isLast,
  });

  @override
  Widget build(BuildContext context) {
    final extras = item.selectedExtras;
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
          ...extras.map((e) {
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

// ── Bottom bar: tid + acceptera (monokrom) ──────────────────────────────────
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

  String _readyTime(int minutes) =>
      OrderUi.formatTime(DateTime.now().add(Duration(minutes: minutes)));

  @override
  Widget build(BuildContext context) {
    final bg = isDark ? AppTheme.storm : Colors.white;
    final ink = isDark ? Colors.white : AppTheme.ink;
    final muted = AppTheme.mutedColor(context);
    final action = accent;
    final actionFg = accent == AppTheme.brandGold ? AppTheme.ink : Colors.white;
    final borderC = AppTheme.borderColor(context);

    return Container(
      decoration: BoxDecoration(
        color: bg,
        border: Border(top: BorderSide(color: borderC, width: 1)),
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
                      Text('TID',
                          style: TextStyle(
                            color: muted,
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1.4,
                          )),
                      const SizedBox(height: 2),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text('$selected',
                              style: TextStyle(
                                fontSize: 26,
                                fontWeight: FontWeight.w900,
                                height: 1.0,
                                letterSpacing: -1,
                                color: ink,
                              )),
                          const SizedBox(width: 4),
                          Padding(
                            padding: const EdgeInsets.only(bottom: 4),
                            child: Text('min',
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  color: muted,
                                )),
                          ),
                        ],
                      ),
                    ],
                  ),
                  const Spacer(),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text('KLAR',
                          style: TextStyle(
                            color: muted,
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1.4,
                          )),
                      const SizedBox(height: 4),
                      Text(_readyTime(selected),
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: ink,
                            letterSpacing: -0.3,
                          )),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 10),
              _TimeStrip(
                options: options,
                selected: selected,
                action: action,
                actionFg: actionFg,
                isDark: isDark,
                onChanged: onTimeChanged,
              ),
              const SizedBox(height: 12),
              EmberButton(
                label: rejecting ? 'NEKAR...' : 'ACCEPTERA · $selected min',
                icon: Icons.bolt_rounded,
                busy: busy,
                onPressed: busy ? null : onAccept,
                color: action,
                foreground: actionFg,
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
  final Color action;
  final Color actionFg;
  final bool isDark;
  final ValueChanged<int> onChanged;

  const _TimeStrip({
    required this.options,
    required this.selected,
    required this.action,
    required this.actionFg,
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
                    ? widget.action
                    : (widget.isDark
                        ? Colors.white.withOpacity(0.05)
                        : AppTheme.ink.withOpacity(0.04)),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: isSel
                      ? widget.action
                      : AppTheme.borderColor(context),
                  width: 1,
                ),
              ),
              child: Center(
                child: AnimatedDefaultTextStyle(
                  duration: const Duration(milliseconds: 180),
                  style: TextStyle(
                    color: isSel
                        ? widget.actionFg
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
