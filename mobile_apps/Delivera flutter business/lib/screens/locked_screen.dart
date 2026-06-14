import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme.dart';
import '../providers/auth_provider.dart';
import '../widgets/app_ui.dart';

/// Visas när admin har loggat ut plattan (RestaurantDevice.revoked = true).
/// Personalen kan inte själva logga in igen — bara admin kan åter-aktivera
/// enheten i admin-panelen. "Försök igen" kollar om admin har gjort det.
class LockedScreen extends StatelessWidget {
  const LockedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: AppBackdrop(
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(28),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: Consumer<AuthProvider>(
                  builder: (context, auth, _) {
                    return Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Center(
                          child: Container(
                            width: 88,
                            height: 88,
                            decoration: BoxDecoration(
                              color: AppTheme.danger.withOpacity(0.12),
                              borderRadius: BorderRadius.circular(26),
                            ),
                            child: const Icon(
                              Icons.lock_outline_rounded,
                              size: 40,
                              color: AppTheme.danger,
                            ),
                          ),
                        ),
                        const SizedBox(height: 26),
                        Text(
                          'Utloggad',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 26,
                            fontWeight: FontWeight.w900,
                            letterSpacing: -0.6,
                            color: isDark ? Colors.white : AppTheme.ink,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Den här plattan har loggats ut av admin. Kontakta '
                          'admin för att aktivera den igen.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                            height: 1.4,
                            color: AppTheme.mutedColor(context),
                          ),
                        ),
                        const SizedBox(height: 24),
                        EmberButton(
                          label: 'Försök igen',
                          icon: Icons.refresh_rounded,
                          onPressed: () => auth.bootstrapTerminal(),
                        ),
                      ],
                    );
                  },
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
