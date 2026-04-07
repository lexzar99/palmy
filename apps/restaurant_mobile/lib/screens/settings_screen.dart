import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/theme_provider.dart';
import '../providers/order_provider.dart';
import '../core/theme.dart';
import './print_settings_screen.dart';
import 'package:package_info_plus/package_info_plus.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  String _version = 'Laddar...';

  @override
  void initState() {
    super.initState();
    _loadVersion();
  }

  Future<void> _loadVersion() async {
    final info = await PackageInfo.fromPlatform();
    if (mounted) {
      setState(() {
        _version = 'Version ${info.version}+${info.buildNumber}';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final themeProvider = Provider.of<ThemeProvider>(context);
    final orderProvider = Provider.of<OrderProvider>(context);
    final authProvider = Provider.of<AuthProvider>(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    return Scaffold(
      appBar: AppBar(
        elevation: 0,
        title: const Text('INSTÄLLNINGAR', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, letterSpacing: 2)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(25),
        children: [
          _buildSectionHeader('PERSONAL & KONTO'),
          const SizedBox(height: 15),
          _buildInfoCard(
            context,
            icon: Icons.person_outline,
            title: authProvider.user?['name'] ?? 'Anställd',
            subtitle: (authProvider.user?['role'] ?? 'Personal').toString().toUpperCase(),
          ),
          const SizedBox(height: 35),

          _buildSectionHeader('UTSKRIFT & HÅRDVARA'),
          const SizedBox(height: 15),
          _buildSettingTile(
            context,
            icon: Icons.print_outlined,
            title: 'Skrivarinställningar',
            subtitle: 'Hitta och anslut skrivare',
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PrintSettingsScreen())),
          ),
          const SizedBox(height: 35),

          _buildSectionHeader('UTSEENDE & TEMA'),
          const SizedBox(height: 20),
            Wrap(
              spacing: 16,
              runSpacing: 16,
              children: [
                _buildThemeChip(themeProvider, 'MIDNIGHT GOLD'),
                _buildThemeChip(themeProvider, 'LIGHT MODE'),
                _buildThemeChip(themeProvider, 'SYNC WITH SYSTEM'),
              ],
            ),
          const SizedBox(height: 40),
          _buildSectionHeader('DEBUG & SUPPORT'),
          const SizedBox(height: 15),
          _buildSettingTile(
            context,
            icon: Icons.bug_report_outlined,
            title: 'Skicka Test-order',
            subtitle: 'Simulera inkommande order',
            onTap: () {
              orderProvider.simulateOrder();
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('✅ Test-order skickad! Gå till Ordrar.'), backgroundColor: Colors.green));
            },
          ),
          const SizedBox(height: 35),

          _buildSectionHeader('SYSTEM'),
          const SizedBox(height: 15),
          _buildSettingTile(
            context,
            icon: Icons.info_outline,
            title: 'App Version',
            subtitle: _version,
            trailing: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(color: AppTheme.gold.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
              child: const Text('BETA', style: TextStyle(color: AppTheme.gold, fontSize: 8, fontWeight: FontWeight.w900)),
            ),
          ),
          const SizedBox(height: 20),
          _buildSettingTile(
            context,
            icon: Icons.logout,
            title: 'Logga ut',
            subtitle: 'Avsluta sessionen',
            onTap: () => authProvider.logout(),
          ),
          const SizedBox(height: 50),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Row(
      children: [
        Text(title, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: AppTheme.gold, letterSpacing: 3)),
        const SizedBox(width: 15),
        Expanded(child: Container(height: 1, color: AppTheme.gold.withOpacity(0.1))),
      ],
    );
  }

  Widget _buildInfoCard(BuildContext context, {required IconData icon, required String title, required String subtitle}) {
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(color: Theme.of(context).colorScheme.surface, borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.04))),
      child: Row(
        children: [
          Container(width: 50, height: 50, decoration: BoxDecoration(color: AppTheme.gold.withOpacity(0.1), borderRadius: BorderRadius.circular(16)), child: Icon(icon, color: AppTheme.gold)),
          const SizedBox(width: 20),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: TextStyle(color: Theme.of(context).textTheme.bodyLarge?.color, fontWeight: FontWeight.w900, fontSize: 16)),
            const SizedBox(height: 4),
            Text(subtitle, style: TextStyle(color: Theme.of(context).textTheme.bodySmall?.color?.withOpacity(0.4), fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1.5)),
          ]),
        ],
      ),
    );
  }

  Widget _buildSettingTile(BuildContext context, {required IconData icon, required String title, required String subtitle, VoidCallback? onTap, Widget? trailing}) {
    return Container(
      decoration: BoxDecoration(color: Theme.of(context).colorScheme.surface, borderRadius: BorderRadius.circular(22), border: Border.all(color: Colors.white.withOpacity(0.02))),
      child: ListTile(
        onTap: onTap,
        contentPadding: const EdgeInsets.symmetric(horizontal: 22, vertical: 8),
        leading: Icon(icon, color: Theme.of(context).textTheme.bodyLarge?.color?.withOpacity(0.6), size: 22),
        title: Text(title, style: TextStyle(color: Theme.of(context).textTheme.bodyLarge?.color, fontWeight: FontWeight.w900, fontSize: 14)),
        subtitle: Text(subtitle, style: TextStyle(color: Theme.of(context).textTheme.bodySmall?.color?.withOpacity(0.4), fontSize: 11, fontWeight: FontWeight.bold)),
        trailing: trailing ?? Icon(Icons.chevron_right, color: Theme.of(context).textTheme.bodySmall?.color?.withOpacity(0.1)),
      ),
    );
  }

  Widget _buildThemeChip(ThemeProvider themeProvider, String label) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isSelected = themeProvider.themeName == label;
    return GestureDetector(
      onTap: () => themeProvider.setTheme(label),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 15),
        decoration: BoxDecoration(
          color: isSelected ? AppTheme.gold : Theme.of(context).colorScheme.surface.withOpacity(0.5),
          borderRadius: BorderRadius.circular(15),
          border: Border.all(color: isSelected ? AppTheme.gold : Colors.white10),
        ),
        child: Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w100, color: isSelected 
          ? (isDark ? AppTheme.charcoal : Colors.white) 
          : (isDark ? Colors.white60 : Colors.black87), letterSpacing: 1)),
      ),
    );
  }
}
