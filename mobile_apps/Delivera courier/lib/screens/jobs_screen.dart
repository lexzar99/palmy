import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../providers/session_provider.dart';
import '../widgets/app_ui.dart';
import '../widgets/courier_ui.dart';
import 'job_detail_screen.dart';

/// Tillgängliga uppdrag i kurirens stad (polling var 15:e sek).
class JobsScreen extends StatelessWidget {
  const JobsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final session = context.watch<SessionProvider>();
    final jobs = session.jobs;

    return RefreshIndicator(
      onRefresh: () => context.read<SessionProvider>().refreshJobs(),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 120),
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Eyebrow('Tillgängliga'),
                    const SizedBox(height: 6),
                    Text('Uppdrag', style: theme.textTheme.displaySmall),
                  ],
                ),
              ),
              const _OnlineToggle(),
            ],
          ),
          const SizedBox(height: 20),
          if (jobs.isEmpty)
            const Padding(
              padding: EdgeInsets.only(top: 40),
              child: AppEmptyState(
                icon: Icons.radar_rounded,
                title: 'Inga uppdrag just nu',
                subtitle:
                    'Vi söker efter nya leveranser i din stad. Du får en notis när ett uppdrag dyker upp.',
              ),
            )
          else
            ...jobs.map((j) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _JobCard(job: j),
                )),
        ],
      ),
    );
  }
}

class _OnlineToggle extends StatelessWidget {
  const _OnlineToggle();

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionProvider>();
    return GestureDetector(
      onTap: session.busy
          ? null
          : () => _confirmOffline(context),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: AppTheme.success.withOpacity(0.12),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: AppTheme.success.withOpacity(0.30)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: const BoxDecoration(
                color: AppTheme.success,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 7),
            const Text(
              'Online',
              style: TextStyle(
                color: AppTheme.success,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _confirmOffline(BuildContext context) async {
    final go = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _OfflineSheet(),
    );
    if (go == true && context.mounted) {
      await context.read<SessionProvider>().goOffline();
    }
  }
}

class _OfflineSheet extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      margin: const EdgeInsets.all(12),
      padding: const EdgeInsets.all(22),
      decoration: AppTheme.panelDecoration(context, radius: 22),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Gå offline?', style: theme.textTheme.titleLarge),
          const SizedBox(height: 8),
          Text(
            'Du slutar ta emot nya uppdrag och vi slutar dela din position. Pågående leveranser påverkas inte.',
            style: theme.textTheme.bodyMedium,
          ),
          const SizedBox(height: 22),
          EmberButton(
            label: 'Gå offline',
            icon: Icons.pause_rounded,
            color: AppTheme.danger,
            foreground: Colors.white,
            onPressed: () => Navigator.pop(context, true),
          ),
          const SizedBox(height: 10),
          GhostButton(
            label: 'Avbryt',
            onPressed: () => Navigator.pop(context, false),
          ),
        ],
      ),
    );
  }
}

class _JobCard extends StatelessWidget {
  final Job job;
  const _JobCard({required this.job});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final vehColor =
        job.vehicle == VehicleType.car ? AppTheme.info : AppTheme.ember;
    return AppPanel(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => JobDetailScreen(jobId: job.id)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              AppPill(
                label: job.vehicle.label,
                color: vehColor,
                icon: job.vehicle == VehicleType.car
                    ? Icons.directions_car_rounded
                    : Icons.pedal_bike_rounded,
              ),
              const SizedBox(width: 8),
              if (job.expiresAt > 0) CountdownPill(expiresAt: job.expiresAt),
              const Spacer(),
              Text(
                kr(job.payout),
                style: theme.textTheme.titleLarge?.copyWith(
                  color: AppTheme.isDark(context)
                      ? AppTheme.ember
                      : AppTheme.emberDeep,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(job.restaurantName, style: theme.textTheme.titleMedium),
          const SizedBox(height: 2),
          Text(job.pickupAddress, style: theme.textTheme.bodyMedium),
          const SizedBox(height: 10),
          Row(
            children: [
              Icon(Icons.straighten_rounded,
                  size: 15, color: AppTheme.mutedColor(context)),
              const SizedBox(width: 5),
              Text(km(job.distanceKm), style: theme.textTheme.bodyMedium),
              const SizedBox(width: 14),
              Icon(Icons.schedule_rounded,
                  size: 15, color: AppTheme.mutedColor(context)),
              const SizedBox(width: 5),
              Text(minutes(job.etaMin), style: theme.textTheme.bodyMedium),
              const SizedBox(width: 14),
              Icon(Icons.shopping_bag_outlined,
                  size: 15, color: AppTheme.mutedColor(context)),
              const SizedBox(width: 5),
              Text('${job.itemCount} st', style: theme.textTheme.bodyMedium),
            ],
          ),
        ],
      ),
    );
  }
}
