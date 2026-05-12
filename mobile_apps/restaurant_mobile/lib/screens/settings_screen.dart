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
  String _version = '—';
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
    setState(() => _version = '${info.version}+${info.buildNumber}');
  }

  @override
  Widget build(BuildContext context) {
    final themeProvider = Provider.of<ThemeProvider>(context);
    final orderProvider = Provider.of<OrderProvider>(context);
    final authProvider = Provider.of<AuthProvider>(context);
    final isDark = AppTheme.isDark(context);

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        children: [
          // ── Title ──────────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 6, 4, 18),
            child: Text(
              'Inställningar',
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w600,
                letterSpacing: -0.5,
                color: isDark ? Colors.white : AppTheme.ink,
              ),
            ),
          ),

          // ── Profile card ────────────────────────────────────────────────
          AppPanel(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: isDark ? AppTheme.gold : AppTheme.lightGold,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(Icons.storefront_rounded,
                      color: isDark ? AppTheme.ink : Colors.white, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        authProvider.user?['name'] ?? 'Restaurangkonto',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: isDark ? Colors.white : AppTheme.ink,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        (authProvider.user?['role'] ?? 'personal')
                            .toString()
                            .toUpperCase(),
                        style: TextStyle(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w500,
                          letterSpacing: 0.6,
                          color: AppTheme.mutedColor(context),
                        ),
                      ),
                    ],
                  ),
                ),
                AppPill(
                  label: orderProvider.isRestaurantOpen ? 'Öppet' : 'Stängt',
                  color: orderProvider.isRestaurantOpen
                      ? AppTheme.success
                      : AppTheme.danger,
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // ── Hårdvara ────────────────────────────────────────────────────
          _SectionLabel(label: 'Hårdvara'),
          const SizedBox(height: 8),
          _CompactTile(
            icon: Icons.print_rounded,
            title: 'Skrivarinställningar',
            subtitle: 'Bluetooth och nätverk',
            onTap: () => Navigator.push(context,
                MaterialPageRoute(builder: (_) => const PrintSettingsScreen())),
          ),
          const SizedBox(height: 20),

          // ── Tema ────────────────────────────────────────────────────────
          _SectionLabel(label: 'Tema'),
          const SizedBox(height: 8),
          Row(
            children: ThemePreference.values.map((pref) {
              final selected = themeProvider.themePreference == pref;
              final accent = switch (pref) {
                ThemePreference.midnight => AppTheme.gold,
                ThemePreference.light => AppTheme.info,
                ThemePreference.system => AppTheme.success,
              };
              return Expanded(
                child: Padding(
                  padding: EdgeInsets.only(
                    right: pref != ThemePreference.values.last ? 8 : 0,
                  ),
                  child: _CompactThemeCard(
                    preference: pref,
                    selected: selected,
                    accent: accent,
                    onTap: () => themeProvider.setThemePreference(pref),
                  ),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 20),

          // ── Support ─────────────────────────────────────────────────────
          _SectionLabel(label: 'Support'),
          const SizedBox(height: 8),
          _CompactTile(
            icon: Icons.notifications_active_rounded,
            title: 'Skicka test-order',
            subtitle: 'Simulerar en inkommande order',
            onTap: () {
              orderProvider.simulateOrder();
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Test-order skapad · se fliken Ordrar'),
                  backgroundColor: AppTheme.success,
                ),
              );
            },
          ),
          const SizedBox(height: 8),
          _CompactTile(
            icon: Icons.info_outline_rounded,
            title: 'Appversion',
            subtitle: _version,
            onTap: _handleVersionTap,
            trailing: AppPill(label: 'Beta', color: AppTheme.gold),
          ),
          const SizedBox(height: 8),
          _CompactTile(
            icon: Icons.logout_rounded,
            iconColor: AppTheme.danger,
            title: 'Logga ut',
            subtitle: 'Avsluta sessionen på den här enheten',
            onTap: () => _handleLogout(context, authProvider),
          ),
        ],
      ),
    );
  }

  void _handleLogout(BuildContext context, dynamic authProvider) {
    final logoutCode = authProvider.logoutCode as String?;
    if (logoutCode == null || logoutCode.isEmpty) {
      logger.log('BUTTON: Logout (no code required)');
      authProvider.logout();
      return;
    }
    _showLogoutCodeDialog(context, authProvider, logoutCode);
  }

  void _showLogoutCodeDialog(
      BuildContext context, dynamic authProvider, String correctCode) {
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
    if (now.difference(_lastTapTime).inSeconds > 2) _versionTapCount = 0;
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

// ── Section label ─────────────────────────────────────────────────────────────
class _SectionLabel extends StatelessWidget {
  final String label;
  const _SectionLabel({required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 2),
      child: Text(
        label.toUpperCase(),
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.9,
          color: AppTheme.mutedColor(context),
        ),
      ),
    );
  }
}

// ── Compact settings tile ─────────────────────────────────────────────────────
class _CompactTile extends StatelessWidget {
  final IconData icon;
  final Color? iconColor;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final Widget? trailing;

  const _CompactTile({
    required this.icon,
    this.iconColor,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    final resolvedIconColor =
        iconColor ?? Theme.of(context).colorScheme.primary;
    return AppPanel(
      onTap: onTap,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: resolvedIconColor.withOpacity(0.10),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: resolvedIconColor, size: 17),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(
                        fontSize: 14, fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(subtitle,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: AppTheme.mutedColor(context),
                    )),
              ],
            ),
          ),
          const SizedBox(width: 8),
          trailing ??
              Icon(Icons.chevron_right_rounded,
                  color: AppTheme.mutedColor(context), size: 18),
        ],
      ),
    );
  }
}

// ── Compact theme card ─────────────────────────────────────────────────────────
class _CompactThemeCard extends StatelessWidget {
  final ThemePreference preference;
  final bool selected;
  final Color accent;
  final VoidCallback onTap;

  const _CompactThemeCard({
    required this.preference,
    required this.selected,
    required this.accent,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return AppPanel(
      onTap: onTap,
      tint: accent,
      color: selected
          ? accent.withOpacity(0.10)
          : AppTheme.panelColor(context),
      padding: const EdgeInsets.all(12),
      child: Column(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: accent.withOpacity(0.12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(
              switch (preference) {
                ThemePreference.midnight => Icons.dark_mode_rounded,
                ThemePreference.light => Icons.light_mode_rounded,
                ThemePreference.system => Icons.phone_android_rounded,
              },
              color: accent,
              size: 16,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            preference.label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: selected
                  ? accent
                  : AppTheme.mutedColor(context),
            ),
            textAlign: TextAlign.center,
          ),
          if (selected) ...[
            const SizedBox(height: 4),
            Icon(Icons.check_circle_rounded, color: accent, size: 13),
          ],
        ],
      ),
    );
  }
}
