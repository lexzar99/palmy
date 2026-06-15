import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../providers/session_provider.dart';
import '../widgets/app_ui.dart';
import 'delivery_detail_screen.dart';

/// Egen sida för leveranshistoriken (bröts ut från Konto-fliken). Visar de
/// senaste slutförda leveranserna grupperade per dag, med en summering högst
/// upp. Tryck på en rad → full leveransdetalj.
class HistoryScreen extends StatelessWidget {
  const HistoryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final session = context.watch<SessionProvider>();
    final history = session.history;
    final accent =
        AppTheme.isDark(context) ? AppTheme.ember : AppTheme.emberDeep;

    final totalEarned =
        history.fold<double>(0, (sum, h) => sum + h.payout);

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: AppBackdrop(
        child: SafeArea(
          child: Column(
            children: [
              // Egen, enkel topbar med tillbaka-pil.
              Padding(
                padding: const EdgeInsets.fromLTRB(8, 8, 16, 4),
                child: Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.arrow_back_rounded),
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                    const SizedBox(width: 4),
                    Text('Historik', style: theme.textTheme.titleLarge),
                  ],
                ),
              ),
              Expanded(
                child: RefreshIndicator(
                  onRefresh: () =>
                      context.read<SessionProvider>().refreshHistory(),
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
                    children: [
                      // Summering över hela den hämtade historiken.
                      AppPanel(
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('TOTALT',
                                      style: theme.textTheme.labelMedium
                                          ?.copyWith(
                                        color: AppTheme.mutedColor(context),
                                        letterSpacing: 1.0,
                                      )),
                                  const SizedBox(height: 6),
                                  Text(kr(totalEarned),
                                      style: theme.textTheme.headlineSmall
                                          ?.copyWith(color: accent)),
                                  const SizedBox(height: 2),
                                  Text('${history.length} leveranser',
                                      style: theme.textTheme.bodyMedium),
                                ],
                              ),
                            ),
                            Container(
                              width: 46,
                              height: 46,
                              decoration: BoxDecoration(
                                color: AppTheme.faintColor(context),
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(
                                    color: AppTheme.borderColor(context)),
                              ),
                              child: Icon(Icons.receipt_long_rounded,
                                  color: AppTheme.mutedColor(context),
                                  size: 22),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 20),
                      if (history.isEmpty)
                        const AppEmptyState(
                          icon: Icons.receipt_long_outlined,
                          title: 'Inga leveranser än',
                          subtitle: 'Dina slutförda leveranser visas här.',
                        )
                      else
                        ..._groupedHistory(context, history),
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

  List<Widget> _groupedHistory(
      BuildContext context, List<HistoryOrder> history) {
    final widgets = <Widget>[];
    String? currentDay;
    for (final h in history) {
      final label = dayLabel(h.deliveredAt);
      if (label != currentDay) {
        currentDay = label;
        widgets.add(Padding(
          padding: const EdgeInsets.only(top: 8, bottom: 6),
          child: Text(
            label,
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color: AppTheme.mutedColor(context),
                  letterSpacing: 0.8,
                ),
          ),
        ));
      }
      widgets.add(HistoryRow(order: h));
    }
    return widgets;
  }
}

/// Tappbar historikrad → full leveransdetalj. (Delas av Konto-kortet och
/// historiksidan.)
class HistoryRow extends StatelessWidget {
  final HistoryOrder order;
  const HistoryRow({super.key, required this.order});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final meta = [
      timeOfDay(order.deliveredAt),
      km(order.distanceKm),
      if (order.totalMin != null) minutes(order.totalMin!),
    ].join('  ·  ');
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => DeliveryDetailScreen(deliveryId: order.id),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('#${order.orderNumber} · ${order.restaurantName}',
                      style: theme.textTheme.titleSmall),
                  const SizedBox(height: 2),
                  Text(meta, style: theme.textTheme.bodySmall),
                ],
              ),
            ),
            Text(
              kr(order.payout),
              style: theme.textTheme.titleMedium?.copyWith(
                color: AppTheme.isDark(context)
                    ? AppTheme.ember
                    : AppTheme.emberDeep,
              ),
            ),
            const SizedBox(width: 6),
            Icon(Icons.chevron_right_rounded,
                size: 20, color: AppTheme.mutedColor(context)),
          ],
        ),
      ),
    );
  }
}
