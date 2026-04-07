import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/theme.dart';

class PrintSettingsScreen extends StatefulWidget {
  const PrintSettingsScreen({super.key});

  @override
  State<PrintSettingsScreen> createState() => _PrintSettingsScreenState();
}

class _PrintSettingsScreenState extends State<PrintSettingsScreen> {
  bool _autoPrint = false;
  int _copies = 1;
  final _ipController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _autoPrint = prefs.getBool('auto_print') ?? false;
      _copies = prefs.getInt('print_copies') ?? 1;
      _ipController.text = prefs.getString('printer_ip') ?? 'Local Network';
    });
  }

  Future<void> _saveSettings() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('auto_print', _autoPrint);
    await prefs.setInt('print_copies', _copies);
    await prefs.setString('printer_ip', _ipController.text);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('✅ Utskriftsinställningar sparade'), backgroundColor: Colors.green),
      );
      Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppTheme.charcoal,
        elevation: 0,
        title: const Text('UTSKRIFTSINSTÄLLNINGAR',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, letterSpacing: 2)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(25),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildSectionHeader('GRUNDINSTÄLLNINGAR'),
            const SizedBox(height: 25),
            _buildSettingCard(
              title: 'Automatisk utskrift',
              subtitle: 'Skriv ut kvitto direkt vid ny order',
              child: Switch(
                value: _autoPrint,
                onChanged: (v) => setState(() => _autoPrint = v),
                activeColor: AppTheme.gold,
              ),
            ),
            const SizedBox(height: 15),
            _buildSettingCard(
              title: 'Antal kopior',
              subtitle: 'Hur många kvitton per order',
              child: Row(
                children: [
                  IconButton(onPressed: () => setState(() => _copies = (_copies > 1 ? _copies - 1 : 1)), icon: const Icon(Icons.remove_circle_outline, color: Colors.white38)),
                  Text('$_copies', style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900)),
                  IconButton(onPressed: () => setState(() => _copies++), icon: const Icon(Icons.add_circle_outline, color: AppTheme.gold)),
                ],
              ),
            ),
            const SizedBox(height: 35),
            _buildSectionHeader('ENHET & NÄTVERK'),
            const SizedBox(height: 20),
            Container(
              padding: const EdgeInsets.all(25),
              decoration: BoxDecoration(
                color: AppTheme.zinc,
                borderRadius: BorderRadius.circular(22),
                border: Border.all(color: Colors.white.withOpacity(0.04)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('SKRIVARE (IP-ADRESS ELLER NAMN)', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: Colors.white24, letterSpacing: 2)),
                  const SizedBox(height: 15),
                  TextField(
                    controller: _ipController,
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                    decoration: InputDecoration(
                      filled: true,
                      fillColor: Colors.black26,
                      hintText: 'T.ex. 192.168.1.50',
                      hintStyle: const TextStyle(color: Colors.white10),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(15), borderSide: BorderSide.none),
                      prefixIcon: const Icon(Icons.print, color: AppTheme.gold, size: 20),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 60),
            SizedBox(
              width: double.infinity,
              height: 65,
              child: ElevatedButton(
                onPressed: _saveSettings,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.gold,
                  foregroundColor: AppTheme.charcoal,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
                ),
                child: const Text('SPARA INSTÄLLNINGAR', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, letterSpacing: 2)),
              ),
            ),
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

  Widget _buildSettingCard({required String title, required String subtitle, required Widget child}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 20),
      decoration: BoxDecoration(
        color: AppTheme.zinc,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: Colors.white.withOpacity(0.04)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
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
          child,
        ],
      ),
    );
  }
}
