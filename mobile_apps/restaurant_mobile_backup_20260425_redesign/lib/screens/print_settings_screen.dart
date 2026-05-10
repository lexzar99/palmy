import 'package:flutter/material.dart';

import '../core/network_scanner.dart';
import '../core/printing_config_service.dart';
import '../core/theme.dart';

class PrintSettingsScreen extends StatefulWidget {
  const PrintSettingsScreen({super.key});

  @override
  State<PrintSettingsScreen> createState() => _PrintSettingsScreenState();
}

class _PrintSettingsScreenState extends State<PrintSettingsScreen> {
  final PrintingConfigService _printingConfigService = PrintingConfigService();
  final _nameController = TextEditingController();
  final _ipController = TextEditingController();

  bool _loading = true;
  bool _saving = false;
  bool _isScanning = false;
  bool _autoPrint = false;
  int _copies = 1;
  String _paperWidth = '80mm';
  String _selectedPrinterId = '';
  String? _templatePaperWidth;
  String? _syncStatus;
  List<PrinterProfile> _configuredPrinters = [];

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    setState(() => _loading = true);
    try {
      final config = await _printingConfigService.fetchConfig();
      final fallbackPrinter = await _printingConfigService.loadLocalPrinter();
      final printer = config?.defaultPrinter ?? fallbackPrinter;

      if (!mounted) return;
      setState(() {
        _configuredPrinters = config?.printers ?? (fallbackPrinter == null ? [] : [fallbackPrinter]);
        _autoPrint = printer?.autoPrint ?? false;
        _copies = printer?.copies ?? 1;
        _paperWidth = printer?.paperWidth ?? config?.template.paperWidth ?? '80mm';
        _templatePaperWidth = config?.template.paperWidth;
        _selectedPrinterId = printer?.id ?? '';
        _nameController.text = printer?.name ?? 'Nätverksskrivare';
        _ipController.text = printer?.address ?? '';
        _syncStatus = printer?.status ?? 'LOCAL';
      });
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _startScan() async {
    setState(() => _isScanning = true);
    try {
      final ips = await NetworkScanner.discoverPrinters();
      if (!mounted) return;

      final merged = <PrinterProfile>[];
      merged.addAll(_configuredPrinters);

      for (final ip in ips) {
        if (merged.any((printer) => printer.address == ip)) continue;
        merged.add(
          PrinterProfile(
            id: '',
            restaurantId: '',
            restaurantName: null,
            name: 'Upptäckt nätverksskrivare',
            connectionType: 'NETWORK',
            address: ip,
            paperWidth: _paperWidth,
            copies: _copies,
            autoPrint: _autoPrint,
            isDefault: false,
            isActive: true,
            receiptMode: 'STANDARD',
            notes: null,
            status: 'DISCOVERED',
            lastSeenAt: null,
          ),
        );
      }

      setState(() {
        _configuredPrinters = merged;
      });
    } finally {
      if (mounted) {
        setState(() => _isScanning = false);
      }
    }
  }

  Future<void> _saveSettings() async {
    final printerName = _nameController.text.trim().isEmpty ? 'Nätverksskrivare' : _nameController.text.trim();
    final printerAddress = _ipController.text.trim();

    if (printerAddress.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('❌ Ange skrivare eller IP-adress först')),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      final printer = await _printingConfigService.saveOrUpdateDefaultPrinter(
        existingPrinterId: _selectedPrinterId.isEmpty ? null : _selectedPrinterId,
        name: printerName,
        address: printerAddress,
        autoPrint: _autoPrint,
        copies: _copies,
        paperWidth: _paperWidth,
      );

      await _printingConfigService.heartbeat(printerId: printer?.id, address: printerAddress);
      if (!mounted) return;

      setState(() {
        _selectedPrinterId = printer?.id ?? '';
        _syncStatus = printer?.status ?? 'ONLINE';
      });

      await _loadSettings();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('✅ Utskriftsinställningar sparade och synkade'), backgroundColor: Colors.green),
      );
      Navigator.pop(context);
    } catch (_) {
      await _printingConfigService.saveLocalFallback(
        name: printerName,
        address: printerAddress,
        autoPrint: _autoPrint,
        copies: _copies,
        paperWidth: _paperWidth,
        printerId: _selectedPrinterId,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('⚠️ Sparade lokalt. Servern kunde inte uppdateras just nu.'), backgroundColor: Colors.orange),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _ipController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppTheme.charcoal,
        elevation: 0,
        title: const Text('SKRIVARINSTÄLLNINGAR', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, letterSpacing: 2)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppTheme.gold))
          : ListView(
              padding: const EdgeInsets.all(25),
              children: [
                _buildSectionHeader('AKTIV KONFIGURATION'),
                const SizedBox(height: 15),
                _buildInfoCard(
                  title: _nameController.text.isEmpty ? 'Ingen standardskrivare vald' : _nameController.text,
                  subtitle: _ipController.text.isEmpty ? 'Lägg till en skrivare nedan' : 'Adress: ${_ipController.text}',
                  trailing: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(color: AppTheme.gold.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
                    child: Text((_syncStatus ?? 'LOCAL').toUpperCase(), style: const TextStyle(color: AppTheme.gold, fontSize: 8, fontWeight: FontWeight.w900)),
                  ),
                ),
                const SizedBox(height: 15),
                _buildInfoCard(
                  title: 'Kvittobas från admin',
                  subtitle: 'Pappersbredd i mallen: ${_templatePaperWidth ?? '80mm'}',
                  trailing: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(color: AppTheme.gold.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
                    child: const Text('SYNC', style: TextStyle(color: AppTheme.gold, fontSize: 8, fontWeight: FontWeight.w900)),
                  ),
                ),
                const SizedBox(height: 35),

                _buildSectionHeader('GRUNDINSTÄLLNINGAR'),
                const SizedBox(height: 20),
                _buildSettingCard(
                  title: 'Auto-print',
                  subtitle: 'Skriv ut direkt när ny order kommer in',
                  child: Switch(
                    value: _autoPrint,
                    onChanged: (value) => setState(() => _autoPrint = value),
                    activeColor: AppTheme.gold,
                  ),
                ),
                const SizedBox(height: 15),
                _buildSettingCard(
                  title: 'Antal kopior',
                  subtitle: 'Hur många kvitton per order som skrivs ut',
                  child: Row(
                    children: [
                      IconButton(
                        onPressed: () => setState(() => _copies = (_copies > 1 ? _copies - 1 : 1)),
                        icon: Icon(Icons.remove_circle_outline, color: Theme.of(context).textTheme.bodySmall?.color?.withOpacity(0.6)),
                      ),
                      Text('$_copies', style: TextStyle(color: Theme.of(context).textTheme.bodyLarge?.color, fontSize: 18, fontWeight: FontWeight.w900)),
                      IconButton(
                        onPressed: () => setState(() => _copies = (_copies < 5 ? _copies + 1 : 5)),
                        icon: const Icon(Icons.add_circle_outline, color: AppTheme.gold),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 15),
                _buildSettingCard(
                  title: 'Pappersbredd',
                  subtitle: 'Påverkar både PDF-fallback och ESC/POS-utskrift',
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: _paperWidth,
                      dropdownColor: AppTheme.zinc,
                      onChanged: (value) {
                        if (value != null) setState(() => _paperWidth = value);
                      },
                      items: const [
                        DropdownMenuItem(value: '58mm', child: Text('58mm')),
                        DropdownMenuItem(value: '80mm', child: Text('80mm')),
                        DropdownMenuItem(value: 'A4', child: Text('A4/PDF')),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 35),

                _buildSectionHeader('UPPTÄCKT & LAGRADE SKRIVARE'),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  height: 55,
                  child: ElevatedButton.icon(
                    onPressed: _isScanning ? null : _startScan,
                    icon: _isScanning
                        ? const SizedBox(width: 15, height: 15, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Icon(Icons.network_ping),
                    label: Text(_isScanning ? 'SÖKER SKRIVARE...' : 'SKANNA LOKALT NÄTVERK', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 12, letterSpacing: 1)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.zinc,
                      foregroundColor: AppTheme.gold,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15), side: BorderSide(color: AppTheme.gold.withOpacity(0.2))),
                    ),
                  ),
                ),
                const SizedBox(height: 18),
                if (_configuredPrinters.isEmpty)
                  _buildEmptyState()
                else
                  ..._configuredPrinters.map(_buildPrinterTile),
                const SizedBox(height: 24),

                _buildSectionHeader('MANUELL STANDARDPRINTER'),
                const SizedBox(height: 15),
                TextField(
                  controller: _nameController,
                  style: TextStyle(color: Theme.of(context).textTheme.bodyLarge?.color, fontWeight: FontWeight.bold),
                  decoration: InputDecoration(
                    filled: true,
                    fillColor: AppTheme.zinc,
                    hintText: 'Namn på skrivaren',
                    hintStyle: TextStyle(color: Theme.of(context).textTheme.bodySmall?.color?.withOpacity(0.5)),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(18), borderSide: BorderSide.none),
                    prefixIcon: const Icon(Icons.label_outline, color: AppTheme.gold, size: 20),
                  ),
                ),
                const SizedBox(height: 12),
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
                const SizedBox(height: 20),
                Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: AppTheme.gold.withOpacity(0.06),
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: AppTheme.gold.withOpacity(0.15)),
                  ),
                  child: const Text(
                    'Desktop-adminen lagrar och synkar nu riktiga printerprofiler. Själva nätverkstestet måste fortfarande ske från restaurangens egen enhet, eftersom skrivaren ligger på deras lokala nätverk.',
                    style: TextStyle(color: Colors.white70, height: 1.6, fontSize: 12, fontWeight: FontWeight.bold),
                  ),
                ),
                const SizedBox(height: 40),
                SizedBox(
                  width: double.infinity,
                  height: 65,
                  child: ElevatedButton(
                    onPressed: _saving ? null : _saveSettings,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.gold,
                      foregroundColor: AppTheme.charcoal,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
                    ),
                    child: _saving
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.charcoal))
                        : const Text('SPARA OCH SYNKA', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, letterSpacing: 2)),
                  ),
                ),
                const SizedBox(height: 24),
              ],
            ),
    );
  }

  Widget _buildPrinterTile(PrinterProfile printer) {
    final isSelected = _ipController.text == printer.address;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: isSelected ? AppTheme.gold.withOpacity(0.05) : AppTheme.zinc,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: isSelected ? AppTheme.gold : Theme.of(context).dividerColor.withOpacity(0.6), width: 1.5),
      ),
      child: ListTile(
        onTap: () => setState(() {
          _selectedPrinterId = printer.id;
          _nameController.text = printer.name;
          _ipController.text = printer.address;
          _paperWidth = printer.paperWidth;
          _copies = printer.copies;
          _autoPrint = printer.autoPrint;
          _syncStatus = printer.status;
        }),
        leading: Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(color: Colors.black26, borderRadius: BorderRadius.circular(12)),
          child: Icon(printer.connectionType == 'NETWORK' ? Icons.print : Icons.bluetooth, color: AppTheme.gold, size: 22),
        ),
        title: Text(printer.name, style: TextStyle(color: Theme.of(context).textTheme.bodyLarge?.color, fontWeight: FontWeight.w900, fontSize: 13, letterSpacing: 1)),
        subtitle: Text('${printer.address} · ${printer.status ?? 'UNKNOWN'}', style: TextStyle(color: Theme.of(context).textTheme.bodySmall?.color?.withOpacity(0.7), fontSize: 10, fontWeight: FontWeight.bold)),
        trailing: isSelected
            ? const Icon(Icons.check_circle, color: AppTheme.gold)
            : printer.isDefault
                ? const Text('STANDARD', style: TextStyle(color: AppTheme.gold, fontSize: 8, fontWeight: FontWeight.w900))
                : null,
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
            Text('INGA SKRIVARE KONFIGURERADE ÄN', style: TextStyle(color: Theme.of(context).textTheme.bodySmall?.color?.withOpacity(0.6), fontSize: 9, fontWeight: FontWeight.w900, letterSpacing: 1.5)),
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

  Widget _buildInfoCard({required String title, required String subtitle, Widget? trailing}) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppTheme.zinc,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Theme.of(context).dividerColor.withOpacity(0.5)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TextStyle(color: Theme.of(context).textTheme.bodyLarge?.color, fontWeight: FontWeight.w900, fontSize: 14)),
                const SizedBox(height: 4),
                Text(subtitle, style: TextStyle(color: Theme.of(context).textTheme.bodySmall?.color?.withOpacity(0.7), fontSize: 11, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
          if (trailing != null) trailing,
        ],
      ),
    );
  }
}
