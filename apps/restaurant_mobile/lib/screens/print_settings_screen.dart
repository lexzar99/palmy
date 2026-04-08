import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/theme.dart';
import '../core/network_scanner.dart';

class PrintSettingsScreen extends StatefulWidget {
  const PrintSettingsScreen({super.key});

  @override
  State<PrintSettingsScreen> createState() => _PrintSettingsScreenState();
}

class _PrintSettingsScreenState extends State<PrintSettingsScreen> {
  bool _autoPrint = false;
  int _copies = 1;
  bool _isScanning = false;
  List<Map<String, String>> _foundPrinters = [];
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
      _ipController.text = prefs.getString('printer_ip') ?? '';
      if (_ipController.text.isNotEmpty) {
        _foundPrinters.add({'name': 'Tidigare Skrivare', 'address': _ipController.text, 'status': 'ONLINE'});
      }
    });
  }

  void _startScan() async {
    setState(() {
      _isScanning = true;
      _foundPrinters = [];
    });
    
    try {
      final ips = await NetworkScanner.discoverPrinters();
      if (mounted) {
        setState(() {
          _isScanning = false;
          _foundPrinters = ips.map((ip) => {'name': 'Nätverksskrivare', 'address': ip, 'status': 'ONLINE'}).toList();
          
          if (_ipController.text.isNotEmpty && !ips.contains(_ipController.text)) {
            _foundPrinters.add({'name': 'Sparad Enhet', 'address': _ipController.text, 'status': 'OFFLINE'});
          }
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isScanning = false;
        });
      }
    }
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
        title: const Text('SKRIVARINSTÄLLNINGAR', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, letterSpacing: 2)),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(25),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildSectionHeader('GRUNDINSTÄLLNINGAR'),
            const SizedBox(height: 25),
            _buildSettingCard(
              title: 'Auto-print',
              subtitle: 'Skriv ut direkt vid ny order',
              child: Switch(
                value: _autoPrint,
                onChanged: (v) => setState(() => _autoPrint = v),
                activeColor: AppTheme.gold,
              ),
            ),
            const SizedBox(height: 15),
            _buildSettingCard(
              title: 'Antal kopior',
              subtitle: 'Kvitton per order',
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => setState(() => _copies = (_copies > 1 ? _copies - 1 : 1)),
                    icon: Icon(Icons.remove_circle_outline, color: Theme.of(context).textTheme.bodySmall?.color?.withOpacity(0.6)),
                  ),
                  Text('$_copies', style: TextStyle(color: Theme.of(context).textTheme.bodyLarge?.color, fontSize: 18, fontWeight: FontWeight.w900)),
                  IconButton(onPressed: () => setState(() => _copies++), icon: const Icon(Icons.add_circle_outline, color: AppTheme.gold)),
                ],
              ),
            ),
            const SizedBox(height: 35),
            _buildSectionHeader('SKANNA LOKALT NÄTVERK'),
            const SizedBox(height: 20),
            
            SizedBox(
              width: double.infinity,
              height: 55,
              child: ElevatedButton.icon(
                onPressed: _isScanning ? null : _startScan,
                icon: _isScanning 
                  ? const SizedBox(width: 15, height: 15, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.network_ping),
                label: Text(_isScanning ? 'SÖKER SKRIVARE...' : 'SÖK BROTHER SKRIVARE', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 12, letterSpacing: 1)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.zinc,
                  foregroundColor: AppTheme.gold,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15), side: BorderSide(color: AppTheme.gold.withOpacity(0.2))),
                ),
              ),
            ),

            const SizedBox(height: 20),

            if (_foundPrinters.isNotEmpty) ...[
              ..._foundPrinters.map((p) => _buildPrinterTile(p)),
            ] else if (!_isScanning)
              _buildEmptyState(),

            const SizedBox(height: 20),
            
            _buildSectionHeader('MANUELL ANSLUTNING'),
            const SizedBox(height: 15),
            TextField(
              controller: _ipController,
              style: TextStyle(color: Theme.of(context).textTheme.bodyLarge?.color, fontWeight: FontWeight.bold),
              decoration: InputDecoration(
                filled: true,
                fillColor: AppTheme.zinc,
                hintText: 'Ange skrivarens IP-adress',
                hintStyle: TextStyle(color: Theme.of(context).textTheme.bodySmall?.color?.withOpacity(0.5)),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(18), borderSide: BorderSide.none),
                prefixIcon: const Icon(Icons.print_outlined, color: AppTheme.gold, size: 20),
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

  Widget _buildPrinterTile(Map<String, String> p) {
    final isSelected = _ipController.text == p['address'];
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: isSelected ? AppTheme.gold.withOpacity(0.05) : AppTheme.zinc,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: isSelected ? AppTheme.gold : Theme.of(context).dividerColor.withOpacity(0.6), width: 1.5),
      ),
      child: ListTile(
        onTap: () => setState(() => _ipController.text = p['address']!),
        leading: Container(
          width: 42, height: 42,
          decoration: BoxDecoration(color: Colors.black26, borderRadius: BorderRadius.circular(12)),
          child: Icon(Icons.print, color: AppTheme.gold, size: 22),
        ),
        title: Text(p['name']!, style: TextStyle(color: Theme.of(context).textTheme.bodyLarge?.color, fontWeight: FontWeight.w900, fontSize: 13, letterSpacing: 1)),
        subtitle: Text('IP: ${p['address']}', style: TextStyle(color: Theme.of(context).textTheme.bodySmall?.color?.withOpacity(0.7), fontSize: 10, fontWeight: FontWeight.bold)),
        trailing: isSelected 
          ? const Icon(Icons.check_circle, color: AppTheme.gold) 
          : Text(p['status']!, style: TextStyle(color: p['status'] == 'READY' ? Colors.green : AppTheme.danger, fontSize: 8, fontWeight: FontWeight.w900)),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 40),
        child: Column(
          children: [
            Icon(Icons.print_disabled, size: 40, color: Theme.of(context).textTheme.bodySmall?.color?.withOpacity(0.2)),
            const SizedBox(height: 10),
            Text('INGA SKRIVARE HITTADES I NÄTVERKET', style: TextStyle(color: Theme.of(context).textTheme.bodySmall?.color?.withOpacity(0.6), fontSize: 9, fontWeight: FontWeight.w900, letterSpacing: 1.5)),
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
        border: Border.all(color: Theme.of(context).dividerColor.withOpacity(0.6)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: Theme.of(context).textTheme.bodyLarge?.color)),
                const SizedBox(height: 4),
                Text(subtitle, style: TextStyle(fontSize: 11, color: Theme.of(context).textTheme.bodySmall?.color?.withOpacity(0.7), fontWeight: FontWeight.bold)),
              ],
            ),
          ),
          child,
        ],
      ),
    );
  }
}
