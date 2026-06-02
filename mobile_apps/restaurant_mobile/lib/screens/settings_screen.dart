import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:provider/provider.dart';

import '../core/theme.dart';
import '../providers/auth_provider.dart';
import '../providers/order_provider.dart';
import '../providers/theme_provider.dart';
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

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 140),
          children: [
            _Header(),
            const SizedBox(height: 22),
            _ProfileCard(
              name:
                  (authProvider.user?['name'] ?? 'Restaurangkonto').toString(),
              role: (authProvider.user?['role'] ?? 'personal')
                  .toString()
                  .toUpperCase(),
              isOpen: orderProvider.isRestaurantOpen,
            ),
            const SizedBox(height: 26),
            _SectionLabel(label: 'Hårdvara'),
            const SizedBox(height: 8),
            _SettingRow(
              icon: Icons.print_rounded,
              iconColor: AppTheme.info,
              title: 'Skrivarinställningar',
              subtitle: 'Bluetooth och nätverk',
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(
                    builder: (_) => const PrintSettingsScreen()),
              ),
            ),
            const SizedBox(height: 26),
            _SectionLabel(label: 'Utseende'),
            const SizedBox(height: 10),
            _ThemePicker(provider: themeProvider),
            const SizedBox(height: 26),
            _SectionLabel(label: 'Support'),
            const SizedBox(height: 8),
            _SettingRow(
              icon: Icons.notifications_active_rounded,
              iconColor: AppTheme.success,
              title: 'Skicka test-order',
              subtitle: 'Simulerar en inkommande order',
              onTap: () {
                orderProvider.simulateOrder();
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text(
                        'Test-order skapad · se fliken Order'),
                    backgroundColor: AppTheme.success,
                  ),
                );
              },
            ),
            const SizedBox(height: 8),
            _SettingRow(
              icon: Icons.info_outline_rounded,
              iconColor: AppTheme.lavender,
              title: 'Appversion',
              subtitle: _version,
              onTap: _handleVersionTap,
              trailing: _BetaPill(),
            ),
          ],
        ),
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

class _Header extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'INSTÄLLNINGAR',
          style: TextStyle(
            color: AppTheme.mutedColor(context),
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.4,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Konto & utrustning',
          style: TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w900,
            height: 1.0,
            letterSpacing: -1.0,
            color: isDark ? Colors.white : AppTheme.ink,
          ),
        ),
      ],
    );
  }
}

class _ProfileCard extends StatelessWidget {
  final String name;
  final String role;
  final bool isOpen;
  const _ProfileCard({
    required this.name,
    required this.role,
    required this.isOpen,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final statusColor = isOpen ? AppTheme.success : AppTheme.danger;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppTheme.panelColor(context),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: AppTheme.borderColor(context)),
        boxShadow: isDark
            ? []
            : [
                BoxShadow(
                  color: AppTheme.ember.withOpacity(0.08),
                  blurRadius: 18,
                  offset: const Offset(0, 6),
                ),
              ],
      ),
      child: Row(
        children: [
          Container(
            width: 60,
            height: 60,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [AppTheme.emberSoft, AppTheme.ember],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(18),
              boxShadow: [
                BoxShadow(
                  color: AppTheme.ember.withOpacity(0.32),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: const Center(
              child: Icon(
                Icons.storefront_rounded,
                color: AppTheme.ink,
                size: 28,
              ),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.2,
                    color: isDark ? Colors.white : AppTheme.ink,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: statusColor.withOpacity(0.14),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        isOpen ? 'ÖPPET' : 'STÄNGD',
                        style: TextStyle(
                          color: statusColor,
                          fontSize: 10.5,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.8,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      role,
                      style: TextStyle(
                        color: AppTheme.mutedColor(context),
                        fontSize: 10.5,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.8,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String label;
  const _SectionLabel({required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 2),
      child: Text(
        label.toUpperCase(),
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w800,
          letterSpacing: 1.4,
          color: AppTheme.mutedColor(context),
        ),
      ),
    );
  }
}

class _SettingRow extends StatelessWidget {
  final IconData icon;
  final Color? iconColor;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final Widget? trailing;

  const _SettingRow({
    required this.icon,
    this.iconColor,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final iconC = iconColor ?? AppTheme.ember;
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppTheme.panelColor(context),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppTheme.borderColor(context)),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: iconC.withOpacity(0.14),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: iconC, size: 19),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: isDark ? Colors.white : AppTheme.ink,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.mutedColor(context),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              trailing ??
                  Icon(
                    Icons.chevron_right_rounded,
                    color: AppTheme.mutedColor(context),
                    size: 20,
                  ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BetaPill extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: AppTheme.ember.withOpacity(0.16),
        borderRadius: BorderRadius.circular(8),
      ),
      child: const Text(
        'BETA',
        style: TextStyle(
          color: AppTheme.ember,
          fontSize: 11,
          fontWeight: FontWeight.w900,
          letterSpacing: 0.8,
        ),
      ),
    );
  }
}

class _ThemePicker extends StatelessWidget {
  final ThemeProvider provider;
  const _ThemePicker({required this.provider});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: ThemePreference.values.map((pref) {
        final selected = provider.themePreference == pref;
        return Expanded(
          child: Padding(
            padding: EdgeInsets.only(
              right: pref != ThemePreference.values.last ? 8 : 0,
            ),
            child: _ThemeCard(
              preference: pref,
              selected: selected,
              onTap: () => provider.setThemePreference(pref),
            ),
          ),
        );
      }).toList(),
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
    final isDark = AppTheme.isDark(context);
    final accent = isDark ? AppTheme.ember : AppTheme.emberDeep;
    final icon = switch (preference) {
      ThemePreference.midnight => Icons.dark_mode_rounded,
      ThemePreference.light => Icons.light_mode_rounded,
      ThemePreference.system => Icons.phone_iphone_rounded,
    };

    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
          decoration: BoxDecoration(
            color: selected
                ? accent.withOpacity(0.12)
                : AppTheme.panelColor(context),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: selected
                  ? accent.withOpacity(0.45)
                  : AppTheme.borderColor(context),
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Column(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: accent.withOpacity(selected ? 0.18 : 0.10),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: accent, size: 19),
              ),
              const SizedBox(height: 10),
              Text(
                preference.label,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: selected
                      ? accent
                      : (isDark ? Colors.white : AppTheme.ink),
                  letterSpacing: 0.1,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
