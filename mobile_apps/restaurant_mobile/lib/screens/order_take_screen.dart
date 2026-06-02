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
    final ink = isDark ? Colors.white : AppTheme.ink;
    final muted = AppTheme.mutedColor(context);
    final accent = OrderUi.colorFor(order);
    final isPickup = order.type == 'PICKUP';

    final hasAddress = order.type == 'DELIVERY' && order.deliveryStreet != null;
    final hasInstr = order.deliveryInstructions?.isNotEmpty == true;
    final hasNote = order.note?.isNotEmpty == true;

    final eyebrow = TextStyle(
      fontSize: 12,
      fontWeight: FontWeight.w800,
      letterSpacing: 1.6,
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
                      // Typ + tid
                      Row(
                        children: [
                          Text(
                              order.scheduledFor != null
                                  ? 'FÖRBESTÄLLNING'
                                  : (isPickup ? 'AVHÄMTNING' : 'LEVERANS'),
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 1.2,
                                color: accent,
                              )),
                          const Spacer(),
                          Text(OrderUi.formatTime(order.createdAt),
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: muted,
                              )),
                        ],
                      ),
                      const SizedBox(height: 6),
                      // Ordernummer — normal storlek, fint placerad.
                      Text(
                        '#${order.orderNumber}',
                        style: TextStyle(
                          fontSize: 26,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.5,
                          color: ink,
                        ),
                      ),

                      _rule(context),

                      // Kund
                      Text(
                        order.customerName,
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.3,
                          color: ink,
                        ),
                      ),
                      const SizedBox(height: 8),
                      _ContactLine(
                        icon: Icons.phone_rounded,
                        text: order.customerPhone,
                        color: ink,
                        muted: muted,
                        onTap: () {
                          Clipboard.setData(
                              ClipboardData(text: order.customerPhone));
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              behavior: SnackBarBehavior.floating,
                              content:
                                  Text('Nummer kopierat: ${order.customerPhone}'),
                              duration: const Duration(seconds: 2),
                            ),
                          );
                        },
                      ),
                      if (hasAddress) ...[
                        const SizedBox(height: 6),
                        _ContactLine(
                          icon: Icons.location_on_outlined,
                          text:
                              '${order.deliveryStreet}, ${order.deliveryZip ?? ''} ${order.deliveryCity ?? ''}'
                                  .trim(),
                          color: muted,
                          muted: muted,
                        ),
                      ],

                      // Meddelande
                      if (hasInstr || hasNote) ...[
                        _rule(context),
                        Text('MEDDELANDE', style: eyebrow),
                        if (hasInstr) ...[
                          const SizedBox(height: 8),
                          Text(
                            OrderUi.deliveryInstructionLabel(
                                order.deliveryInstructions),
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              height: 1.35,
                              color: ink,
                            ),
                          ),
                        ],
                        if (hasNote) ...[
                          const SizedBox(height: 8),
                          Text(
                            order.note!,
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              height: 1.35,
                              color: ink,
                            ),
                          ),
                        ],
                      ],

                      _rule(context),

                      // Beställning (kvitto)
                      Text('BESTÄLLNING', style: eyebrow),
                      const SizedBox(height: 12),
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

// Tunn skiljelinje (kvitto-känsla).
Widget _rule(BuildContext context) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
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

// ── Kontaktrad (telefon / adress) ───────────────────────────────────────────
class _ContactLine extends StatelessWidget {
  final IconData icon;
  final String text;
  final Color color;
  final Color muted;
  final VoidCallback? onTap;
  const _ContactLine({
    required this.icon,
    required this.text,
    required this.color,
    required this.muted,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final row = Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 1),
          child: Icon(icon, size: 17, color: muted),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            text,
            style: TextStyle(
              fontSize: 15.5,
              fontWeight: FontWeight.w600,
              height: 1.3,
              color: color,
            ),
          ),
        ),
      ],
    );
    if (onTap == null) return row;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(padding: const EdgeInsets.symmetric(vertical: 2), child: row),
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
