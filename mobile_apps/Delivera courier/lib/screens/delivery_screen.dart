import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../core/theme.dart';
import '../models/models.dart';
import '../providers/session_provider.dart';
import '../widgets/app_ui.dart';
import '../widgets/courier_ui.dart';
import '../widgets/delivery_map.dart';

/// Leveransflöde i två faser:
///  1. EN_ROUTE_PICKUP — bocka av alla artiklar → svep "Hämtad".
///  2. PICKED_UP — kör till kund, valfritt foto → svep "Levererad" + metod.
class DeliveryScreen extends StatefulWidget {
  final String deliveryId;
  const DeliveryScreen({super.key, required this.deliveryId});

  @override
  State<DeliveryScreen> createState() => _DeliveryScreenState();
}

class _DeliveryScreenState extends State<DeliveryScreen> {
  final Set<int> _checked = {};
  String? _photoDataUrl;
  ProofMethod _method = ProofMethod.handed;
  final TextEditingController _messageCtrl = TextEditingController();

  @override
  void dispose() {
    _messageCtrl.dispose();
    super.dispose();
  }

  // Foto krävs när maten lämnas vid dörren (bevis); valfritt i hand.
  bool get _canComplete =>
      _method != ProofMethod.leftAtDoor || _photoDataUrl != null;
  // True medan _complete() själv sköter dialog + pop, så att null-grenen nedan
  // inte också poppar (skulle ge dubbel-pop och ta bort skärmen under).
  bool _completing = false;
  // Latch så null-grenen bara schemalägger EN pop (annars en per rebuild).
  bool _poppedForMissing = false;

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionProvider>();
    final delivery = session.activeById(widget.deliveryId);

    if (delivery == null) {
      // Levererad/borttagen. Om _complete() pågår sköter den dialog + pop själv.
      // Annars (t.ex. omfördelad av admin) poppar vi tillbaka — men bara EN gång.
      if (!_completing && !_poppedForMissing) {
        _poppedForMissing = true;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) Navigator.of(context).maybePop();
        });
      }
      return const Scaffold(
        backgroundColor: Colors.transparent,
        body: AppBackdrop(child: SizedBox.shrink()),
      );
    }

    final pickup = delivery.status == DeliveryStatus.enRoutePickup;
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: AppBackdrop(
        child: SafeArea(
          child: Column(
            children: [
              _Header(delivery: delivery, pickup: pickup),
              Expanded(
                child: pickup
                    ? _PickupPhase(
                        delivery: delivery,
                        checked: _checked,
                        onToggle: (i) => setState(() {
                          _checked.contains(i)
                              ? _checked.remove(i)
                              : _checked.add(i);
                        }),
                      )
                    : _DeliverPhase(
                        delivery: delivery,
                        photoDataUrl: _photoDataUrl,
                        method: _method,
                        messageController: _messageCtrl,
                        onMethod: (m) => setState(() => _method = m),
                        onPhoto: _takePhoto,
                        onRemovePhoto: () =>
                            setState(() => _photoDataUrl = null),
                      ),
              ),
              _ActionBar(
                pickup: pickup,
                allChecked: _checked.length >= delivery.items.length,
                canComplete: _canComplete,
                onPickedUp: () => _markPickedUp(delivery),
                onComplete: () => _complete(delivery),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _takePhoto() async {
    final picker = ImagePicker();
    final file = await picker.pickImage(
      source: ImageSource.camera,
      maxWidth: 1280,
      imageQuality: 70,
    );
    if (file == null) return;
    final bytes = await file.readAsBytes();
    final b64 = base64Encode(bytes);
    if (mounted) {
      setState(() => _photoDataUrl = 'data:image/jpeg;base64,$b64');
    }
  }

  Future<void> _markPickedUp(ActiveDelivery delivery) async {
    final err =
        await context.read<SessionProvider>().markPickedUp(delivery.id);
    if (!mounted) return;
    if (err != null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(err)));
    } else {
      setState(_checked.clear);
    }
  }

  Future<void> _complete(ActiveDelivery delivery) async {
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _completing = true);
    final err = await context.read<SessionProvider>().completeDelivery(
          delivery.id,
          method: _method,
          photoDataUrl: _photoDataUrl,
          message: _messageCtrl.text,
        );
    if (!mounted) return;
    if (err != null) {
      setState(() => _completing = false);
      messenger.showSnackBar(SnackBar(content: Text(err)));
      return;
    }
    // Bekräftelse + tillbaka (ingen summa här — intjäning syns på Konto).
    await showDialog(
      context: context,
      barrierColor: Colors.black.withOpacity(0.55),
      builder: (_) => const _DeliveredDialog(),
    );
    navigator.pop();
  }
}

class _Header extends StatelessWidget {
  final ActiveDelivery delivery;
  final bool pickup;
  const _Header({required this.delivery, required this.pickup});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = pickup ? AppTheme.ember : AppTheme.info;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: Column(
        children: [
          Row(
            children: [
              CircleIconButton(
                icon: Icons.arrow_back_rounded,
                onTap: () => Navigator.pop(context),
              ),
              const SizedBox(width: 12),
              Text('#${delivery.orderNumber}',
                  style: theme.textTheme.titleLarge),
              const Spacer(),
              AppPill(
                label: pickup ? 'Hämtning' : 'Leverans',
                color: color,
                filled: true,
                icon: pickup
                    ? Icons.storefront_rounded
                    : Icons.directions_bike_rounded,
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Två-stegs progress
          Row(
            children: [
              const _StepBar(
                  active: true, label: 'Hämta', color: AppTheme.ember),
              const SizedBox(width: 8),
              _StepBar(
                  active: !pickup, label: 'Lämna', color: AppTheme.info),
            ],
          ),
        ],
      ),
    );
  }
}

class _StepBar extends StatelessWidget {
  final bool active;
  final String label;
  final Color color;
  const _StepBar(
      {required this.active, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 4,
            decoration: BoxDecoration(
              color: active ? color : AppTheme.mutedColor(context).withOpacity(0.2),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 5),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: active ? color : AppTheme.mutedColor(context),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Fas 1: hämtning ──────────────────────────────────────────────────────────
class _PickupPhase extends StatelessWidget {
  final ActiveDelivery delivery;
  final Set<int> checked;
  final ValueChanged<int> onToggle;
  const _PickupPhase({
    required this.delivery,
    required this.checked,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
      children: [
        DeliveryMap(
          pickup: delivery.pickup,
          dropoff: delivery.dropoff,
          pickupAddress: delivery.pickupAddress,
          dropoffAddress: delivery.dropoffAddress,
          focusDropoff: false,
        ),
        const SizedBox(height: 14),
        // Kundens namn tydligt — så budet kan säga "leverans till kund X".
        _CustomerBanner(name: delivery.dropoffName),
        const SizedBox(height: 12),
        AppPanel(
          child: AddressRow(
            icon: Icons.storefront_rounded,
            iconColor: AppTheme.ember,
            title: delivery.restaurantName,
            address: delivery.pickupAddress,
          ),
        ),
        const SizedBox(height: 16),
        const AppSectionHeader(
          eyebrow: 'Kontrollera',
          title: 'Bocka av beställningen',
          subtitle: 'Alla artiklar måste bockas av innan du svepar.',
        ),
        const SizedBox(height: 10),
        AppPanel(
          child: Column(
            children: [
              for (var i = 0; i < delivery.items.length; i++)
                _CheckItem(
                  item: delivery.items[i],
                  checked: checked.contains(i),
                  onTap: () => onToggle(i),
                  last: i == delivery.items.length - 1,
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Center(
          child: Text(
            '${checked.length}/${delivery.items.length} avbockade',
            style: theme.textTheme.bodyMedium,
          ),
        ),
      ],
    );
  }
}

/// Tydlig kund-banner i hämtningsfasen — budet ser direkt vem ordern går till.
class _CustomerBanner extends StatelessWidget {
  final String name;
  const _CustomerBanner({required this.name});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AppPanel(
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: AppTheme.faintColor(context),
              borderRadius: BorderRadius.circular(13),
              border: Border.all(color: AppTheme.borderColor(context)),
            ),
            child: Icon(Icons.person_rounded,
                size: 22, color: AppTheme.mutedColor(context)),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'LEVERANS TILL',
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: AppTheme.mutedColor(context),
                    letterSpacing: 1.0,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  name.isEmpty ? 'Kund' : name,
                  style: theme.textTheme.titleLarge,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CheckItem extends StatelessWidget {
  final OrderItem item;
  final bool checked;
  final VoidCallback onTap;
  final bool last;
  const _CheckItem({
    required this.item,
    required this.checked,
    required this.onTap,
    required this.last,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(10),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Row(
              children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 160),
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    color: checked ? AppTheme.success : Colors.transparent,
                    borderRadius: BorderRadius.circular(9),
                    border: Border.all(
                      color: checked
                          ? AppTheme.success
                          : AppTheme.mutedColor(context).withOpacity(0.4),
                      width: 1.5,
                    ),
                  ),
                  child: checked
                      ? const Icon(Icons.check_rounded,
                          size: 18, color: Colors.white)
                      : null,
                ),
                const SizedBox(width: 14),
                Text('${item.qty}×',
                    style: theme.textTheme.titleMedium
                        ?.copyWith(color: AppTheme.mutedColor(context))),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    item.name,
                    style: theme.textTheme.bodyLarge?.copyWith(
                      decoration: checked ? TextDecoration.lineThrough : null,
                      color: checked ? AppTheme.mutedColor(context) : null,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        if (!last)
          Divider(height: 1, color: AppTheme.borderColor(context)),
      ],
    );
  }
}

// ── Fas 2: leverans ──────────────────────────────────────────────────────────
class _DeliverPhase extends StatelessWidget {
  final ActiveDelivery delivery;
  final String? photoDataUrl;
  final ProofMethod method;
  final TextEditingController messageController;
  final ValueChanged<ProofMethod> onMethod;
  final VoidCallback onPhoto;
  final VoidCallback onRemovePhoto;
  const _DeliverPhase({
    required this.delivery,
    required this.photoDataUrl,
    required this.method,
    required this.messageController,
    required this.onMethod,
    required this.onPhoto,
    required this.onRemovePhoto,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
      children: [
        DeliveryMap(
          pickup: delivery.pickup,
          dropoff: delivery.dropoff,
          pickupAddress: delivery.pickupAddress,
          dropoffAddress: delivery.dropoffAddress,
          focusDropoff: true,
        ),
        const SizedBox(height: 14),
        AppPanel(
          child: AddressRow(
            icon: Icons.flag_rounded,
            iconColor: AppTheme.info,
            title: delivery.dropoffName,
            address: delivery.dropoffAddress,
          ),
        ),
        const SizedBox(height: 16),
        const AppSectionHeader(
            eyebrow: 'Överlämning', title: 'Hur levererades den?'),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: _MethodChip(
                label: 'Lämnad i hand',
                icon: Icons.front_hand_rounded,
                selected: method == ProofMethod.handed,
                onTap: () => onMethod(ProofMethod.handed),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _MethodChip(
                label: 'Vid dörren',
                icon: Icons.door_front_door_rounded,
                selected: method == ProofMethod.leftAtDoor,
                onTap: () => onMethod(ProofMethod.leftAtDoor),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        AppSectionHeader(
          // Vid dörren = foto obligatoriskt (bevis). I hand = valfritt.
          eyebrow: method == ProofMethod.leftAtDoor ? 'Obligatoriskt' : 'Valfritt',
          title: 'Leveransfoto',
          subtitle: method == ProofMethod.leftAtDoor
              ? 'Foto krävs när maten lämnas vid dörren.'
              : 'Ta ett foto som bevis om du vill.',
        ),
        const SizedBox(height: 10),
        if (photoDataUrl == null)
          GhostButton(
            label: method == ProofMethod.leftAtDoor ? 'Ta foto (krävs)' : 'Ta foto',
            icon: Icons.camera_alt_outlined,
            onPressed: onPhoto,
          )
        else
          AppPanel(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: Image.memory(
                    base64Decode(photoDataUrl!.split(',').last),
                    width: 56,
                    height: 56,
                    fit: BoxFit.cover,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Text('Foto bifogat',
                      style: theme.textTheme.titleMedium),
                ),
                IconButton(
                  icon: const Icon(Icons.close_rounded),
                  onPressed: onRemovePhoto,
                ),
              ],
            ),
          ),
        const SizedBox(height: 16),
        const AppSectionHeader(
          eyebrow: 'Valfritt',
          title: 'Notering',
          subtitle: 'Skriv något som landar hos support, t.ex. var du ställt maten.',
        ),
        const SizedBox(height: 10),
        AppPanel(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
          child: TextField(
            controller: messageController,
            minLines: 2,
            maxLines: 4,
            maxLength: 1000,
            textInputAction: TextInputAction.newline,
            decoration: const InputDecoration(
              border: InputBorder.none,
              counterText: '',
              hintText: 'T.ex. "Ställd bakom blomkrukan till höger om dörren"',
            ),
          ),
        ),
      ],
    );
  }
}

class _MethodChip extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;
  const _MethodChip({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final color = AppTheme.isDark(context) ? AppTheme.ember : AppTheme.emberDeep;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 12),
        decoration: BoxDecoration(
          color: selected ? color.withOpacity(0.12) : AppTheme.faintColor(context),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected ? color.withOpacity(0.5) : AppTheme.borderColor(context),
            width: selected ? 1.5 : 1,
          ),
        ),
        child: Column(
          children: [
            Icon(icon, color: selected ? color : AppTheme.mutedColor(context)),
            const SizedBox(height: 8),
            Text(
              label,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: selected ? color : AppTheme.mutedColor(context),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ActionBar extends StatelessWidget {
  final bool pickup;
  final bool allChecked;
  final bool canComplete;
  final Future<void> Function() onPickedUp;
  final Future<void> Function() onComplete;
  const _ActionBar({
    required this.pickup,
    required this.allChecked,
    required this.canComplete,
    required this.onPickedUp,
    required this.onComplete,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.fromLTRB(
          20, 12, 20, MediaQuery.of(context).padding.bottom + 12),
      decoration: BoxDecoration(
        color: AppTheme.panelColor(context),
        border: Border(top: BorderSide(color: AppTheme.borderColor(context))),
      ),
      child: pickup
          ? SwipeToConfirm(
              label: allChecked ? 'Svep — Hämtad' : 'Bocka av alla först',
              icon: Icons.shopping_bag_rounded,
              color: AppTheme.ember,
              enabled: allChecked,
              onConfirm: onPickedUp,
            )
          : SwipeToConfirm(
              label: canComplete ? 'Svep — Levererad' : 'Ta foto vid dörren först',
              icon: Icons.check_rounded,
              color: AppTheme.success,
              enabled: canComplete,
              onConfirm: onComplete,
            ),
    );
  }
}

/// Ren, monokrom bekräftelse efter levererad order. Ingen summa — bara att
/// uppdraget är klart. Egen panel istället för Dialogens mörka standardyta.
class _DeliveredDialog extends StatelessWidget {
  const _DeliveredDialog();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Dialog(
      backgroundColor: Colors.transparent,
      elevation: 0,
      insetPadding: const EdgeInsets.symmetric(horizontal: 40),
      child: Container(
        padding: const EdgeInsets.fromLTRB(28, 34, 28, 24),
        decoration: BoxDecoration(
          color: AppTheme.panelColor(context),
          borderRadius: BorderRadius.circular(28),
          border: Border.all(color: AppTheme.borderColor(context)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.30),
              blurRadius: 30,
              offset: const Offset(0, 14),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 84,
              height: 84,
              decoration: BoxDecoration(
                color: AppTheme.success.withOpacity(0.12),
                shape: BoxShape.circle,
                border: Border.all(
                    color: AppTheme.success.withOpacity(0.35), width: 2),
              ),
              child: const Icon(Icons.check_rounded,
                  size: 44, color: AppTheme.success),
            ),
            const SizedBox(height: 22),
            Text('Levererad', style: theme.textTheme.headlineSmall),
            const SizedBox(height: 6),
            Text(
              'Snyggt jobbat — uppdraget är klart.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium,
            ),
            const SizedBox(height: 26),
            EmberButton(
              label: 'Klar',
              onPressed: () => Navigator.pop(context),
              height: 52,
            ),
          ],
        ),
      ),
    );
  }
}
