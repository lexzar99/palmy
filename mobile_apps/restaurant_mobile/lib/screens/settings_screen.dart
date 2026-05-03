import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:provider/provider.dart';

import '../core/log_service.dart';
import '../core/theme.dart';
import '../providers/auth_provider.dart';
import '../providers/order_provider.dart';
import '../providers/theme_provider.dart';
import '../widgets/app_ui.dart';
import 'log_screen.dart';
import 'print_settings_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  String _version = 'Laddar...';
  int _versionTapCount = 0;
  DateTime _lastTapTime = DateTime.now();

  @override
  void initState() {
    super.initState();
    _loadVersion();
  }

  Future<void> _loadVersion() async {
    final info = await PackageInfo.fromPlatform();
    if (!mounted) return;

    setState(() {
      _version = 'Version ${info.version}+${info.buildNumber}';
    });
  }

  @override
  Widget build(BuildContext context) {
    final themeProvider = Provider.of<ThemeProvider>(context);
    final orderProvider = Provider.of<OrderProvider>(context);
    final authProvider = Provider.of<AuthProvider>(context);

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
        children: [
          const AppSectionHeader(
            eyebrow: 'Kontroll',
            title: 'Inställningar',
            subtitle:
                'Hantera konto, utskrift, tema och support utan att lämna appen.',
          ),
          const SizedBox(height: 18),
          AppPanel(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [AppTheme.goldAccent, AppTheme.gold],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(22),
                  ),
                  child:
                      const Icon(Icons.storefront_rounded, color: AppTheme.ink),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        authProvider.user?['name'] ?? 'Restaurangkonto',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 6),
                      Text(
                        (authProvider.user?['role'] ?? 'personal')
                            .toString()
                            .toUpperCase(),
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 10,
                        runSpacing: 10,
                        children: [
                          AppPill(
                            label: orderProvider.isRestaurantOpen
                                ? 'Öppet'
                                : 'Stängt',
                            color: orderProvider.isRestaurantOpen
                                ? AppTheme.success
                                : AppTheme.danger,
                          ),
                          AppPill(
                            label: themeProvider.themeName,
                            color: AppTheme.gold,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          const AppSectionHeader(
            eyebrow: 'Hårdvara',
            title: 'Utskrift och drift',
          ),
          const SizedBox(height: 12),
          _SettingsTile(
            icon: Icons.print_rounded,
            title: 'Skrivarinställningar',
            subtitle: 'Bluetooth, nätverk, testutskrift och autoutskrift.',
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const PrintSettingsScreen()),
            ),
          ),
          const SizedBox(height: 12),
          _SettingsTile(
            icon: Icons.desktop_windows_rounded,
            title: 'Desktop-kontroll',
            subtitle: 'Öppettider, payouts och adminstyrning sköts centralt.',
            onTap: () {
              showDialog<void>(
                context: context,
                builder: (context) => AlertDialog(
                  title: const Text('Desktop-kontroll'),
                  content: const Text(
                    'Öppettider och ekonomi styrs fortsatt centralt i desktop-adminen. Business-appen fokuserar på drift, order och utskrift.',
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Stäng'),
                    ),
                  ],
                ),
              );
            },
          ),
          const SizedBox(height: 20),
          const AppSectionHeader(
            eyebrow: 'Tema',
            title: 'Tema och uttryck',
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 14,
            runSpacing: 14,
            children: ThemePreference.values
                .map(
                  (preference) => SizedBox(
                    width: 220,
                    child: _ThemeCard(
                      preference: preference,
                      selected: themeProvider.themePreference == preference,
                      onTap: () => themeProvider.setThemePreference(preference),
                    ),
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 20),
          const AppSectionHeader(
            eyebrow: 'Service',
            title: 'Support och service',
          ),
          const SizedBox(height: 12),
          _SettingsTile(
            icon: Icons.notifications_active_rounded,
            title: 'Skicka test-order',
            subtitle: 'Simulerar en inkommande order i liveflodet.',
            onTap: () {
              orderProvider.simulateOrder();
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Test-order skapad. Titta i fliken Ordrar.'),
                  backgroundColor: AppTheme.success,
                ),
              );
            },
          ),
          const SizedBox(height: 12),
          _SettingsTile(
            icon: Icons.info_outline_rounded,
            title: 'Appversion',
            subtitle: _version,
            onTap: _handleVersionTap,
            trailing: AppPill(label: 'Beta', color: AppTheme.gold),
          ),
          const SizedBox(height: 12),
          _SettingsTile(
            icon: Icons.logout_rounded,
            title: 'Logga ut',
            subtitle: 'Avsluta sessionen på den här enheten.',
            onTap: () => _handleLogout(context, authProvider),
          ),
        ],
      ),
    );
  }

  void _handleLogout(BuildContext context, authProvider) {
    final logoutCode = authProvider.logoutCode as String?;
    if (logoutCode == null || logoutCode.isEmpty) {
      logger.log('BUTTON: Logout (no code required)');
      authProvider.logout();
      return;
    }
    _showLogoutCodeDialog(context, authProvider, logoutCode);
  }

  void _showLogoutCodeDialog(BuildContext context, authProvider, String correctCode) {
    final controller = TextEditingController();
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Ange utloggningskod'),
        content: TextField(
          controller: controller,
          keyboardType: TextInputType.number,
          obscureText: true,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'Kod'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Avbryt'),
          ),
          ElevatedButton(
            onPressed: () {
              if (controller.text == correctCode) {
                Navigator.pop(context);
                logger.log('BUTTON: Logout (code verified)');
                authProvider.logout();
              } else {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Fel kod — utloggning nekad.'),
                    backgroundColor: Colors.red,
                  ),
                );
              }
            },
            child: const Text('Logga ut'),
          ),
        ],
      ),
    );
  }

  void _handleVersionTap() {
    final now = DateTime.now();
    if (now.difference(_lastTapTime).inSeconds > 2) {
      _versionTapCount = 0;
    }
    _lastTapTime = now;
    _versionTapCount++;

    if (_versionTapCount == 5) {
      _versionTapCount = 0;
      _showLogCodeDialog();
    }
  }

  void _showLogCodeDialog() {
    final controller = TextEditingController();
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Ange kod'),
        content: TextField(
          controller: controller,
          keyboardType: TextInputType.number,
          obscureText: true,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'Kod'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Avbryt'),
          ),
          ElevatedButton(
            onPressed: () {
              if (controller.text == '7970') {
                Navigator.pop(context);
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => const LogScreen()),
                );
              } else {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Fel kod')),
                );
              }
            },
            child: const Text('Öppna'),
          ),
        ],
      ),
    );
  }
}

class _SettingsTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final Widget? trailing;

  const _SettingsTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return AppPanel(
      onTap: onTap,
      padding: const EdgeInsets.all(18),
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: AppTheme.faintColor(context),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(icon, color: Theme.of(context).colorScheme.primary),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 4),
                Text(subtitle, style: Theme.of(context).textTheme.bodyMedium),
              ],
            ),
          ),
          const SizedBox(width: 12),
          trailing ??
              Icon(
                Icons.chevron_right_rounded,
                color: AppTheme.mutedColor(context),
              ),
        ],
      ),
    );
  }
}

class _ThemeCard extends StatelessWidget {
  final ThemePreference preference;
  final bool selected;
  final VoidCallback onTap;

  const _ThemeCard({
    required this.preference,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final accent = switch (preference) {
      ThemePreference.midnight => AppTheme.gold,
      ThemePreference.light => AppTheme.info,
      ThemePreference.system => AppTheme.success,
    };

    return AppPanel(
      onTap: onTap,
      tint: accent,
      color: selected ? accent.withOpacity(0.12) : AppTheme.panelColor(context),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: accent.withOpacity(0.14),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  switch (preference) {
                    ThemePreference.midnight => Icons.dark_mode_rounded,
                    ThemePreference.light => Icons.light_mode_rounded,
                    ThemePreference.system => Icons.phone_android_rounded,
                  },
                  color: accent,
                ),
              ),
              const Spacer(),
              if (selected)
                Icon(Icons.check_circle_rounded, color: accent)
              else
                Icon(Icons.circle_outlined,
                    color: AppTheme.mutedColor(context)),
            ],
          ),
          const SizedBox(height: 14),
          Text(preference.label,
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 6),
          Text(preference.description,
              style: Theme.of(context).textTheme.bodyMedium),
        ],
      ),
    );
  }
}
