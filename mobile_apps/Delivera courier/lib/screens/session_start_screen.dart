import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../core/theme.dart';
import '../providers/auth_provider.dart';
import '../providers/session_provider.dart';
import '../widgets/app_ui.dart';
import '../widgets/courier_ui.dart';

/// Pre-shift-skärm: visas på Uppdrag-fliken när kuriren är offline.
class SessionStartScreen extends StatelessWidget {
  const SessionStartScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final session = context.watch<SessionProvider>();
    final courier = context.watch<AuthProvider>().courier;
    final accent =
        AppTheme.isDark(context) ? AppTheme.ember : AppTheme.emberDeep;

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 120),
      children: [
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Eyebrow('Bud'),
                  const SizedBox(height: 6),
                  Text(
                    'Hej${courier != null ? ' ${courier.name.split(' ').first}' : ''}',
                    style: theme.textTheme.displaySmall,
                  ),
                ],
              ),
            ),
            _OfflineDot(),
          ],
        ),
        const SizedBox(height: 24),
        // Dagens intjäning
        Row(
          children: [
            Expanded(
              child: AppMetricCard(
                eyebrow: 'Idag',
                value: kr(session.earnedToday),
                label: 'Intjänat',
                accent: accent,
                icon: Icons.payments_outlined,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: AppMetricCard(
                eyebrow: 'Idag',
                value: '${session.deliveriesToday}',
                label: 'Leveranser',
                accent: AppTheme.info,
                icon: Icons.check_circle_outline_rounded,
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),
        AppPanel(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  color: accent.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(22),
                ),
                child: Icon(Icons.bolt_rounded, size: 34, color: accent),
              ),
              const SizedBox(height: 18),
              Text('Du är offline', style: theme.textTheme.titleLarge),
              const SizedBox(height: 6),
              Text(
                'Gå online för att se tillgängliga uppdrag i ${courier?.city ?? 'din stad'}. Vi delar din position bara medan du är online.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium,
              ),
              const SizedBox(height: 22),
              EmberButton(
                label: 'Gå online',
                icon: Icons.play_arrow_rounded,
                busy: session.busy,
                onPressed: session.busy
                    ? null
                    : () async {
                        final ok = await context
                            .read<SessionProvider>()
                            .goOnline();
                        if (!ok && context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text(
                                  'Kunde inte gå online. Kontrollera platstjänster och uppkoppling.'),
                            ),
                          );
                        }
                      },
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _OfflineDot extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: AppTheme.faintColor(context),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: AppTheme.borderColor(context)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: AppTheme.mutedColor(context),
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 7),
          Text(
            'Offline',
            style: TextStyle(
              color: AppTheme.mutedColor(context),
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}
