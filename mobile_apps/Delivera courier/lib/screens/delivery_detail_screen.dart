import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../providers/session_provider.dart';
import '../widgets/app_ui.dart';
import '../widgets/courier_ui.dart';

/// Detaljvy för EN leverans (aktiv eller från historiken): var den hämtades,
/// tider, hur lång tid budet tog på sig, artiklarna och kundnamn. Hämtar färsk
/// data via leverans-id så även gamla ordrar visar fullt innehåll.
class DeliveryDetailScreen extends StatefulWidget {
  final String deliveryId;
  const DeliveryDetailScreen({super.key, required this.deliveryId});

  @override
  State<DeliveryDetailScreen> createState() => _DeliveryDetailScreenState();
}

class _DeliveryDetailScreenState extends State<DeliveryDetailScreen> {
  late Future<ActiveDelivery?> _future;

  @override
  void initState() {
    super.initState();
    _future = context.read<SessionProvider>().fetchDeliveryDetail(widget.deliveryId);
  }

  String _hhmm(int? epochMs) =>
      epochMs == null ? '—' : timeOfDay(DateTime.fromMillisecondsSinceEpoch(epochMs));

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: AppBackdrop(
        child: SafeArea(
          child: FutureBuilder<ActiveDelivery?>(
            future: _future,
            builder: (context, snap) {
              if (snap.connectionState == ConnectionState.waiting) {
                return const Center(child: CircularProgressIndicator());
              }
              final d = snap.data;
              if (d == null) {
                return Column(
                  children: [
                    _bar(context, '#—'),
                    const Expanded(
                      child: Center(child: Text('Kunde inte hämta ordern')),
                    ),
                  ],
                );
              }
              return Column(
                children: [
                  _bar(context, '#${d.orderNumber}'),
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                      children: [
                        _CustomerBanner(name: d.dropoffName),
                        const SizedBox(height: 12),
                        AppPanel(
                          child: AddressRow(
                            icon: Icons.storefront_rounded,
                            iconColor: AppTheme.ember,
                            title: d.restaurantName,
                            address: d.pickupAddress,
                          ),
                        ),
                        const SizedBox(height: 10),
                        AppPanel(
                          child: AddressRow(
                            icon: Icons.flag_rounded,
                            iconColor: AppTheme.info,
                            title: d.dropoffName,
                            address: d.dropoffAddress,
                          ),
                        ),
                        if ((d.deliveryInstructions?.trim().isNotEmpty ?? false) ||
                            (d.deliveryNote?.trim().isNotEmpty ?? false)) ...[
                          const SizedBox(height: 10),
                          CustomerNotePanel(
                            instructions: d.deliveryInstructions,
                            note: d.deliveryNote,
                          ),
                        ],
                        const SizedBox(height: 16),
                        const AppSectionHeader(
                            eyebrow: 'Tider', title: 'Hur lång tid det tog'),
                        const SizedBox(height: 10),
                        AppPanel(
                          child: Column(
                            children: [
                              _timeRow('Accepterad', _hhmm(d.acceptedAt)),
                              _timeRow('Hämtad', _hhmm(d.pickedUpAt)),
                              _timeRow('Levererad', _hhmm(d.deliveredAt)),
                              const Divider(height: 18),
                              _timeRow('Till hämtning',
                                  d.pickupMin != null ? minutes(d.pickupMin!) : '—'),
                              _timeRow('Hämtad → levererad',
                                  d.deliverMin != null ? minutes(d.deliverMin!) : '—'),
                              _timeRow(
                                'Totalt',
                                d.totalMin != null ? minutes(d.totalMin!) : '—',
                                strong: true,
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 16),
                        AppSectionHeader(
                            eyebrow: 'Beställning',
                            title: '${d.itemCount} artiklar'),
                        const SizedBox(height: 10),
                        AppPanel(
                          child: Column(
                            children: [
                              for (final it in d.items)
                                Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 6),
                                  child: Row(
                                    children: [
                                      Text('${it.qty}×',
                                          style: theme.textTheme.titleSmall
                                              ?.copyWith(color: AppTheme.ember)),
                                      const SizedBox(width: 10),
                                      Expanded(
                                          child: Text(it.name,
                                              style: theme.textTheme.bodyMedium)),
                                    ],
                                  ),
                                ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                        AppPanel(
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text('Ersättning', style: theme.textTheme.bodyMedium),
                              Text(kr(d.payout),
                                  style: theme.textTheme.titleMedium?.copyWith(
                                      color: AppTheme.isDark(context)
                                          ? AppTheme.ember
                                          : AppTheme.emberDeep)),
                            ],
                          ),
                        ),
                        if (d.proofMethod != null || (d.proofMessage?.isNotEmpty ?? false)) ...[
                          const SizedBox(height: 16),
                          const AppSectionHeader(
                              eyebrow: 'Bevis', title: 'Överlämning'),
                          const SizedBox(height: 10),
                          AppPanel(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  d.proofMethod == 'LEFT_AT_DOOR'
                                      ? 'Lämnad vid dörren'
                                      : 'Lämnad i handen',
                                  style: theme.textTheme.titleSmall,
                                ),
                                if (d.proofMessage?.isNotEmpty ?? false) ...[
                                  const SizedBox(height: 6),
                                  Text(d.proofMessage!,
                                      style: theme.textTheme.bodyMedium),
                                ],
                              ],
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _bar(BuildContext context, String title) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: Row(
        children: [
          CircleIconButton(
            icon: Icons.arrow_back_rounded,
            onTap: () => Navigator.pop(context),
          ),
          const SizedBox(width: 12),
          Text(title, style: Theme.of(context).textTheme.titleLarge),
        ],
      ),
    );
  }

  Widget _timeRow(String label, String value, {bool strong = false}) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: strong
                  ? theme.textTheme.titleSmall
                  : theme.textTheme.bodyMedium
                      ?.copyWith(color: AppTheme.mutedColor(context))),
          Text(value,
              style: strong
                  ? theme.textTheme.titleMedium
                  : theme.textTheme.bodyMedium),
        ],
      ),
    );
  }
}

class _CustomerBanner extends StatelessWidget {
  final String name;
  const _CustomerBanner({required this.name});

  @override
  Widget build(BuildContext context) {
    return AppPanel(
      child: Row(
        children: [
          const Icon(Icons.person_rounded, color: AppTheme.info),
          const SizedBox(width: 12),
          Expanded(
            child: Text(name, style: Theme.of(context).textTheme.titleMedium),
          ),
        ],
      ),
    );
  }
}
