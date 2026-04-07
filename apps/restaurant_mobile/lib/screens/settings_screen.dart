import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/order_provider.dart';
import '../core/theme.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _soundEnabled = true;
  bool _vibrationEnabled = true;

  final List<Map<String, String>> _alarms = [
    {'name': 'Standard Signal', 'file': 'order_notification.mp3'},
    {'name': 'Digital Chime', 'file': 'digital.mp3'},
    {'name': 'Retro Bell', 'file': 'bell.mp3'},
    {'name': 'Modern Alert', 'file': 'modern.mp3'},
  ];

  @override
  Widget build(BuildContext context) {
    final auth = Provider.of<AuthProvider>(context);
    final orderProvider = Provider.of<OrderProvider>(context);
    final user = auth.user;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppTheme.charcoal,
        elevation: 0,
        title: const Text('INSTÄLLNINGAR',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, letterSpacing: 2)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(25),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Restaurant info
            Container(
              padding: const EdgeInsets.all(25),
              decoration: BoxDecoration(
                color: AppTheme.zinc,
                borderRadius: BorderRadius.circular(28),
                border: Border.all(color: AppTheme.gold.withOpacity(0.2), width: 1.5),
              ),
              child: Row(
                children: [
                  Container(
                    width: 55, height: 55,
                    decoration: BoxDecoration(
                      color: AppTheme.gold,
                      borderRadius: BorderRadius.circular(18),
                      boxShadow: [BoxShadow(color: AppTheme.gold.withOpacity(0.1), blurRadius: 10)],
                    ),
                    child: const Center(child: Text('M',
                      style: TextStyle(color: AppTheme.charcoal, fontSize: 28, fontWeight: FontWeight.w900))),
                  ),
                  const SizedBox(width: 20),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          (user?['name'] ?? user?['restaurantName'] ?? 'MatGo Business').toString().toUpperCase(),
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900, color: Colors.white),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          user?['email'] ?? '',
                          style: const TextStyle(fontSize: 13, color: AppTheme.gold, fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 40),

            // Notifications
            _buildSectionHeader('NOTIFIKATIONER & LJUD'),
            const SizedBox(height: 20),
            _buildSettingTile(
              icon: Icons.notifications_active_outlined,
              title: 'Ljud vid ny order',
              subtitle: 'Spela upp signal när en order inkommer',
              trailing: Switch(
                value: _soundEnabled,
                onChanged: (v) => setState(() => _soundEnabled = v),
                activeColor: AppTheme.gold,
              ),
            ),
            
            // SIGNAL SELECTION
            if (_soundEnabled) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Colors.black26,
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: Colors.white10),
                ),
                child: Column(
                  children: _alarms.map((alarm) {
                    final isSelected = orderProvider.selectedAlarm == alarm['file'];
                    return ListTile(
                      onTap: () => orderProvider.setAlarm(alarm['file']!),
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(isSelected ? Icons.radio_button_checked : Icons.radio_button_off, 
                        color: isSelected ? AppTheme.gold : Colors.white24, size: 20),
                      title: Text(alarm['name']!, 
                        style: TextStyle(fontSize: 14, fontWeight: isSelected ? FontWeight.w900 : FontWeight.bold, color: Colors.white)),
                      trailing: isSelected ? const Icon(Icons.music_note, color: AppTheme.gold, size: 18) : null,
                    );
                  }).toList(),
                ),
              ),
            ],

            const SizedBox(height: 10),
            _buildSettingTile(
              icon: Icons.vibration,
              title: 'Vibration',
              subtitle: 'Vibrera enheten vid ny order',
              trailing: Switch(
                value: _vibrationEnabled,
                onChanged: (v) => setState(() => _vibrationEnabled = v),
                activeColor: AppTheme.gold,
              ),
            ),

            const SizedBox(height: 40),

            // App info
            _buildSectionHeader('SYSTEM'),
            const SizedBox(height: 20),
            _buildSettingTile(
              icon: Icons.info_outline,
              title: 'App Version',
              subtitle: 'Version 1.12.0',
              trailing: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(8)),
                child: const Text('LATEST', style: TextStyle(fontSize: 8, fontWeight: FontWeight.w900, color: Colors.white38)),
              ),
            ),

            const SizedBox(height: 40),

            // Logout
            SizedBox(
              width: double.infinity,
              height: 65,
              child: OutlinedButton.icon(
                onPressed: () => auth.logout(),
                icon: const Icon(Icons.logout, color: Colors.redAccent),
                label: const Text('LOGGA UT FRÅN SYSTEMET',
                  style: TextStyle(color: Colors.redAccent, fontSize: 13, fontWeight: FontWeight.w900, letterSpacing: 2)),
                style: OutlinedButton.styleFrom(
                  side: BorderSide(color: Colors.redAccent.withOpacity(0.3), width: 2),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
                ),
              ),
            ),
            const SizedBox(height: 40),
          ],
        ),
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

  Widget _buildSettingTile({
    required IconData icon,
    required String title,
    required String subtitle,
    Widget? trailing,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 18),
      decoration: BoxDecoration(
        color: AppTheme.zinc,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: Colors.white.withOpacity(0.04)),
      ),
      child: Row(
        children: [
          Icon(icon, size: 24, color: Colors.white38),
          const SizedBox(width: 20),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: Colors.white)),
                const SizedBox(height: 4),
                Text(subtitle, style: const TextStyle(fontSize: 12, color: Colors.white38, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
          if (trailing != null) trailing,
        ],
      ),
    );
  }
}
