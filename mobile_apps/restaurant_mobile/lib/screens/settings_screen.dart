import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:provider/provider.dart';

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
    final ink = isDark ? Colors.white : AppTheme.ink;
    final muted = AppTheme.mutedColor(context);
    final isOpen = orderProvider.isRestaurantOpen;
    final name = (authProvider.user?['name'] ?? 'Restaurangkonto').toString();

    final eyebrow = TextStyle(
      fontSize: 12,
      fontWeight: FontWeight.w800,
      letterSpacing: 1.4,
      color: muted,
    );

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 140),
          children: [
            Text('INSTÄLLNINGAR', style: eyebrow),
            const SizedBox(height: 6),
            Text(
              'Konto & utrustning',
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w900,
                height: 1.0,
                letterSpacing: -1.0,
                color: ink,
              ),
            ),

            _rule(context),

            // Konto
            Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.3,
                color: ink,
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: isOpen ? AppTheme.success : AppTheme.danger,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  isOpen ? 'Öppet' : 'Stängd',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: ink,
                  ),
                ),
              ],
            ),

            _rule(context),

            // Utseende
            Text('UTSEENDE', style: eyebrow),
            const SizedBox(height: 12),
            _ThemeSegment(provider: themeProvider),

            const SizedBox(height: 32),

            // Stor primär-knapp + liten sekundär-knapp.
            EmberButton(
              label: 'Skrivarinställningar',
              icon: Icons.print_rounded,
              height: 56,
              color: ink,
              foreground: isDark ? AppTheme.ink : Colors.white,
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const PrintSettingsScreen()),
              ),
            ),
            const SizedBox(height: 12),
            _GhostButton(
              label: 'Skicka test-order',
              icon: Icons.notifications_active_rounded,
              onPressed: () {
                orderProvider.simulateOrder();
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    behavior: SnackBarBehavior.floating,
                    content: Text('Test-order skapad · se fliken Order'),
                  ),
                );
              },
            ),

            const SizedBox(height: 28),

            // Version (5 tryck → loggvy).
            Center(
              child: GestureDetector(
                onTap: _handleVersionTap,
                behavior: HitTestBehavior.opaque,
                child: Text(
                  'Levera Business · $_version',
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: muted,
                  ),
                ),
              ),
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

// Tunn skiljelinje.
Widget _rule(BuildContext context) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 20),
      child: Divider(
        height: 1,
        thickness: 1,
        color: AppTheme.borderColor(context),
      ),
    );

// Liten, sekundär ghost-knapp (tunn kant, ingen fyllning).
class _GhostButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback onPressed;
  const _GhostButton({
    required this.label,
    required this.icon,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final ink = isDark ? Colors.white : AppTheme.ink;
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          height: 44,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppTheme.borderColor(context)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 17, color: ink),
              const SizedBox(width: 8),
              Text(
                label,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: ink,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// Enkel monokrom segment-kontroll för tema (Mörkt / Ljust / System).
class _ThemeSegment extends StatelessWidget {
  final ThemeProvider provider;
  const _ThemeSegment({required this.provider});

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final ink = isDark ? Colors.white : AppTheme.ink;
    final fg = isDark ? AppTheme.ink : Colors.white;
    final muted = AppTheme.mutedColor(context);

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.borderColor(context)),
      ),
      child: Row(
        children: ThemePreference.values.map((pref) {
          final selected = provider.themePreference == pref;
          return Expanded(
            child: GestureDetector(
              onTap: () => provider.setThemePreference(pref),
              behavior: HitTestBehavior.opaque,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                padding: const EdgeInsets.symmetric(vertical: 10),
                decoration: BoxDecoration(
                  color: selected ? ink : Colors.transparent,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Center(
                  child: Text(
                    pref.label,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                      color: selected ? fg : muted,
                    ),
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
