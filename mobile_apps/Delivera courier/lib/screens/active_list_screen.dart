import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/constants.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../providers/session_provider.dart';
import '../widgets/app_ui.dart';
import '../widgets/courier_ui.dart';
import 'delivery_screen.dart';

/// Pågående leveranser (max 3). Varje kort leder till leveransflödet.
class ActiveListScreen extends StatelessWidget {
  const ActiveListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final session = context.watch<SessionProvider>();
    final active = session.active;

    return RefreshIndicator(
      onRefresh: () => context.read<SessionProvider>().refreshActive(),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 120),
        children: [
          const Eyebrow('Pågående'),
          const SizedBox(height: 6),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('Leveranser', style: theme.textTheme.displaySmall),
              const Spacer(),
              Text('${active.length}/${Constants.maxActive}',
                  style: theme.textTheme.titleMedium
                      ?.copyWith(color: AppTheme.mutedColor(context))),
            ],
          ),
          const SizedBox(height: 20),
          if (active.isEmpty)
            const Padding(
              padding: EdgeInsets.only(top: 40),
              child: AppEmptyState(
                icon: Icons.local_shipping_outlined,
                title: 'Inga pågående leveranser',
                subtitle:
                    'Acceptera ett uppdrag på Uppdrag-fliken så dyker det upp här.',
              ),
            )
          else
            ...active.map((a) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _ActiveCard(delivery: a),
                )),
        ],
      ),
    );
  }
}

class _ActiveCard extends StatelessWidget {
  final ActiveDelivery delivery;
  const _ActiveCard({required this.delivery});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final pickup = delivery.status == DeliveryStatus.enRoutePickup;
    final stepColor = pickup ? AppTheme.ember : AppTheme.info;
    final stepLabel = pickup ? 'Hämta' : 'Lämna';
    final stepIcon =
        pickup ? Icons.storefront_rounded : Icons.flag_rounded;
    final target = pickup ? delivery.restaurantName : delivery.dropoffName;
    final addr = pickup ? delivery.pickupAddress : delivery.dropoffAddress;

    return AppPanel(
      onTap: () => Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => DeliveryScreen(deliveryId: delivery.id),
      )),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              AppPill(label: stepLabel, color: stepColor, icon: stepIcon),
              const Spacer(),
              Text('#${delivery.orderNumber}',
                  style: theme.textTheme.titleMedium
                      ?.copyWith(color: AppTheme.mutedColor(context))),
            ],
          ),
          const SizedBox(height: 12),
          Text(target, style: theme.textTheme.titleLarge),
          const SizedBox(height: 2),
          Text(addr, style: theme.textTheme.bodyMedium),
          if (pickup && delivery.readyForPickup) ...[
            const SizedBox(height: 12),
            const ReadyForPickupBanner(),
          ],
          const SizedBox(height: 14),
          Row(
            children: [
              Icon(Icons.payments_outlined,
                  size: 15, color: AppTheme.mutedColor(context)),
              const SizedBox(width: 5),
              Text(kr(delivery.payout), style: theme.textTheme.bodyMedium),
              const Spacer(),
              Text('Öppna',
                  style: theme.textTheme.labelLarge?.copyWith(color: stepColor)),
              Icon(Icons.chevron_right_rounded, size: 18, color: stepColor),
            ],
          ),
        ],
      ),
    );
  }
}
