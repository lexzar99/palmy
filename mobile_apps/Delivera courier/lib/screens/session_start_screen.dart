import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme.dart';
import '../providers/auth_provider.dart';
import '../providers/session_provider.dart';
import '../widgets/app_ui.dart';
import '../widgets/courier_ui.dart';

/// Offline-vyn på Uppdrag-fliken. Ingen dashboard/intjäning här — bara en ren
/// uppmaning att gå online. Intjäning bor på Konto-fliken.
class SessionStartScreen extends StatelessWidget {
  const SessionStartScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final session = context.watch<SessionProvider>();
    final courier = context.watch<AuthProvider>().courier;
    final gold = AppTheme.isDark(context) ? AppTheme.ember : AppTheme.emberDeep;
    final first = courier?.name.split(' ').first;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 20, 24, 100),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Row(
              children: [
                Eyebrow('Bud'),
                Spacer(),
                _StatusPill(online: false),
              ],
            ),
            const Spacer(),
            // Ren statusmarkör (hairline-ring, ingen gradient-blob)
            Center(
              child: Container(
                width: 92,
                height: 92,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: AppTheme.mutedColor(context).withOpacity(0.35),
                    width: 1.5,
                  ),
                ),
                child: Icon(
                  Icons.power_settings_new_rounded,
                  size: 38,
                  color: AppTheme.mutedColor(context),
                ),
              ),
            ),
            const SizedBox(height: 28),
            Text(
              first != null ? 'Hej $first' : 'Välkommen',
              textAlign: TextAlign.center,
              style: theme.textTheme.displaySmall,
            ),
            const SizedBox(height: 10),
            Text(
              'Du är offline. Gå online för att se uppdrag i ${courier?.city ?? 'din stad'}. Vi delar din position bara medan du är online.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyLarge?.copyWith(
                color: AppTheme.mutedColor(context),
                height: 1.5,
              ),
            ),
            const Spacer(),
            EmberButton(
              label: 'Gå online',
              icon: Icons.bolt_rounded,
              busy: session.busy,
              color: gold,
              onPressed: session.busy
                  ? null
                  : () async {
                      final ok =
                          await context.read<SessionProvider>().goOnline();
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
    );
  }
}

class _StatusPill extends StatelessWidget {
  final bool online;
  const _StatusPill({required this.online});

  @override
  Widget build(BuildContext context) {
    final color = online ? AppTheme.success : AppTheme.mutedColor(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withOpacity(0.28)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 7),
          Text(
            online ? 'Online' : 'Offline',
            style: TextStyle(
              color: color,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}
