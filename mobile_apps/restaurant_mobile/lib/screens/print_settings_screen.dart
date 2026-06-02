import 'package:flutter/material.dart';

import '../core/bluetooth_printer_service.dart';
import '../core/network_scanner.dart';
import '../core/print_service.dart';
import '../core/printing_config_service.dart';
import '../core/theme.dart';
import '../widgets/app_ui.dart';
import 'printer_help_screen.dart';

class PrintSettingsScreen extends StatefulWidget {
  const PrintSettingsScreen({super.key});

  @override
  State<PrintSettingsScreen> createState() => _PrintSettingsScreenState();
}

class _PrintSettingsScreenState extends State<PrintSettingsScreen> {
  final PrintingConfigService _printingConfigService = PrintingConfigService();
  final _nameController = TextEditingController();
  final _addressController = TextEditingController();

  bool _loading = true;
  bool _saving = false;
  bool _testing = false;
  bool _isScanningNetwork = false;
  bool _isScanningBluetooth = false;
  bool _autoPrint = false;
  int _copies = 1;
  String _paperWidth = '80mm';
  String _selectedPrinterId = '';
  String _connectionType = 'NETWORK';
  String? _syncStatus;
  String? _bluetoothIssue;
  List<PrinterProfile> _configuredPrinters = [];
  List<PrinterProfile> _networkPrinters = [];
  List<PrinterProfile> _bluetoothPrinters = [];

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
        _configuredPrinters = config?.printers ??
            (fallbackPrinter == null ? [] : [fallbackPrinter]);
        _autoPrint = printer?.autoPrint ?? false;
        _copies = printer?.copies ?? 1;
        _paperWidth =
            printer?.paperWidth ?? config?.template.paperWidth ?? '80mm';
        _selectedPrinterId = printer?.id ?? '';
        _connectionType = printer?.connectionType.toUpperCase() ?? 'NETWORK';
        _nameController.text = printer?.name ?? 'Köksskrivare';
        _addressController.text = printer?.address ?? '';
        _syncStatus = printer?.status ?? 'LOCAL';
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _startNetworkScan() async {
    setState(() => _isScanningNetwork = true);
    try {
      final addresses = await NetworkScanner.discoverPrinters();
      if (!mounted) return;
      setState(() {
        _networkPrinters = addresses.map(_networkProfileFromAddress).toList();
      });
    } catch (error) {
      if (!mounted) return;
      _showMessage('Nätverksskanning misslyckades: $error', isError: true);
    } finally {
      if (mounted) setState(() => _isScanningNetwork = false);
    }
  }

  Future<void> _startBluetoothScan() async {
    setState(() {
      _isScanningBluetooth = true;
      _bluetoothIssue = null;
    });
    try {
      final issue = await BluetoothPrinterService.availabilityIssue();
      if (issue != null) {
        if (!mounted) return;
        setState(() => _bluetoothIssue = issue);
        _showMessage(issue, isError: true);
        return;
      }

      final devices = await BluetoothPrinterService.discoverPrinters();
      if (!mounted) return;

      setState(() {
        _bluetoothPrinters = devices
            .map(
              (device) => PrinterProfile(
                id: '',
                restaurantId: '',
                restaurantName: null,
                name: device.name.trim().isEmpty
                    ? 'Bluetooth-skrivare'
                    : device.name,
                connectionType: 'BLUETOOTH',
                address: device.address,
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
            )
            .toList();
      });
    } catch (error) {
      if (!mounted) return;
      _showMessage('Bluetooth-skanning misslyckades: $error', isError: true);
    } finally {
      if (mounted) setState(() => _isScanningBluetooth = false);
    }
  }

  Future<void> _saveSettings() async {
    final draft = _buildDraftPrinter();
    if (draft.address.isEmpty) return;

    setState(() => _saving = true);
    try {
      final printer = await _printingConfigService.saveOrUpdateDefaultPrinter(
        existingPrinterId:
            _selectedPrinterId.isEmpty ? null : _selectedPrinterId,
        name: draft.name,
        address: draft.address,
        autoPrint: draft.autoPrint,
        copies: draft.copies,
        paperWidth: draft.paperWidth,
        connectionType: draft.connectionType,
      );

      await _printingConfigService.heartbeat(
        printerId: printer?.id,
        address: draft.address,
      );
      if (!mounted) return;

      setState(() {
        _selectedPrinterId = printer?.id ?? '';
        _syncStatus = printer?.status ?? 'ONLINE';
      });

      await _loadSettings();
      if (!mounted) return;
      _showMessage('Skrivare sparad och synkad.');
    } catch (_) {
      await _printingConfigService.saveLocalFallback(
        name: draft.name,
        address: draft.address,
        autoPrint: draft.autoPrint,
        copies: draft.copies,
        paperWidth: draft.paperWidth,
        printerId: _selectedPrinterId,
        connectionType: draft.connectionType,
      );
      if (!mounted) return;
      _showMessage('Sparade lokalt. Servern nåddes inte.', isError: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _testPrint() async {
    final draft = _buildDraftPrinter();
    if (draft.address.isEmpty && draft.paperWidth != 'A4') {
      _showMessage('Välj en skrivare innan du testar.', isError: true);
      return;
    }

    setState(() => _testing = true);
    try {
      final issue = await PrintService.printTestTicket(printer: draft);
      if (!mounted) return;
      if (issue == null) {
        _showMessage('Testutskrift skickad.');
      } else {
        _showMessage(issue, isError: true);
      }
    } finally {
      if (mounted) setState(() => _testing = false);
    }
  }

  void _applyPrinter(PrinterProfile printer) {
    setState(() {
      _selectedPrinterId = printer.id;
      _connectionType = printer.connectionType.toUpperCase();
      _nameController.text = printer.name;
      _addressController.text = printer.address;
      _paperWidth = printer.paperWidth;
      _copies = printer.copies;
      _autoPrint = printer.autoPrint;
      _syncStatus = printer.status;
    });
  }

  PrinterProfile _buildDraftPrinter() {
    return PrinterProfile(
      id: _selectedPrinterId,
      restaurantId: '',
      restaurantName: null,
      name: _nameController.text.trim().isEmpty
          ? (_connectionType == 'BLUETOOTH'
              ? 'Bluetooth-skrivare'
              : 'Nätverksskrivare')
          : _nameController.text.trim(),
      connectionType: _connectionType,
      address: _addressController.text.trim(),
      paperWidth: _paperWidth,
      copies: _copies,
      autoPrint: _autoPrint,
      isDefault: true,
      isActive: true,
      receiptMode: 'STANDARD',
      notes: null,
      status: _syncStatus,
      lastSeenAt: null,
    );
  }

  PrinterProfile _networkProfileFromAddress(String address) {
    return PrinterProfile(
      id: '',
      restaurantId: '',
      restaurantName: null,
      name: 'Nätverksskrivare',
      connectionType: 'NETWORK',
      address: address,
      paperWidth: _paperWidth,
      copies: _copies,
      autoPrint: _autoPrint,
      isDefault: false,
      isActive: true,
      receiptMode: 'STANDARD',
      notes: null,
      status: 'DISCOVERED',
      lastSeenAt: null,
    );
  }

  void _showMessage(String message, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.orange : Colors.green,
      ),
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _addressController.dispose();
    super.dispose();
  }

  void _showManualAddressModal() {
    final isDark = AppTheme.isDark(context);
    final ipController = TextEditingController(text: _addressController.text);
    final nameCtrl = TextEditingController(
      text: _nameController.text == 'Köksskrivare' ? '' : _nameController.text,
    );

    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, _) => Padding(
          padding: EdgeInsets.only(
            left: 12,
            right: 12,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
          ),
          child: Container(
            decoration: BoxDecoration(
              color: AppTheme.panelColor(context),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: isDark
                    ? Colors.white.withOpacity(0.08)
                    : Colors.black.withOpacity(0.06),
              ),
            ),
            padding: const EdgeInsets.fromLTRB(24, 24, 24, 8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: AppTheme.faintColor(context),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(Icons.edit_rounded,
                          color: isDark ? Colors.white : AppTheme.ink, size: 20),
                    ),
                    const SizedBox(width: 12),
                    Text(
                      'Manuell IP-adress',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w600,
                        color: isDark ? Colors.white : AppTheme.ink,
                      ),
                    ),
                    const Spacer(),
                    IconButton(
                      onPressed: () => Navigator.pop(ctx),
                      icon: Icon(Icons.close_rounded,
                          color: AppTheme.mutedColor(context)),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                TextField(
                  controller: nameCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Namn (valfritt)',
                    prefixIcon: Icon(Icons.label_outline_rounded),
                  ),
                  textInputAction: TextInputAction.next,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: ipController,
                  autofocus: true,
                  keyboardType: TextInputType.url,
                  decoration: const InputDecoration(
                    labelText: 'IP-adress eller host:port',
                    prefixIcon: Icon(Icons.print_outlined),
                    hintText: '192.168.1.100 eller 192.168.1.100:9100',
                  ),
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) =>
                      _applyManualAndSave(ctx, ipController.text, nameCtrl.text),
                ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () =>
                        _applyManualAndSave(ctx, ipController.text, nameCtrl.text),
                    child: const Text('Anslut och spara'),
                  ),
                ),
                const SizedBox(height: 8),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _applyManualAndSave(BuildContext ctx, String address, String name) {
    final trimAddr = address.trim();
    if (trimAddr.isEmpty) return;
    Navigator.pop(ctx);
    setState(() {
      _connectionType = 'NETWORK';
      _addressController.text = trimAddr;
      if (name.trim().isNotEmpty) _nameController.text = name.trim();
    });
    _saveSettings();
  }

  Future<void> _scanNetworkAndShowModal() async {
    await _startNetworkScan();
    if (!mounted) return;
    _showPrinterModal(isBluetoothMode: false);
  }

  Future<void> _scanBluetoothAndShowModal() async {
    await _startBluetoothScan();
    if (!mounted) return;
    _showPrinterModal(isBluetoothMode: true);
  }

  void _showPrinterModal({required bool isBluetoothMode}) {
    final printers = isBluetoothMode ? _bluetoothPrinters : _networkPrinters;
    final isDark = AppTheme.isDark(context);
    final accentColor = isDark ? Colors.white : AppTheme.ink;

    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 28),
        child: Container(
          decoration: BoxDecoration(
            color: AppTheme.panelColor(context),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: isDark
                  ? Colors.white.withOpacity(0.08)
                  : Colors.black.withOpacity(0.06),
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 20, 8, 0),
                child: Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: accentColor.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(
                        isBluetoothMode
                            ? Icons.bluetooth_rounded
                            : Icons.wifi_find_rounded,
                        color: accentColor,
                        size: 20,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Text(
                      isBluetoothMode
                          ? 'Bluetooth-skrivare'
                          : 'Nätverksskrivare',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w600,
                        color: isDark ? Colors.white : AppTheme.ink,
                      ),
                    ),
                    const Spacer(),
                    IconButton(
                      onPressed: () => Navigator.pop(ctx),
                      icon: Icon(
                        Icons.close_rounded,
                        color: AppTheme.mutedColor(context),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              if (printers.isEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
                  child: Text(
                    'Ingen skrivare hittades. Kontrollera att skrivaren är påslagen och ansluten.',
                    style: TextStyle(
                      fontSize: 15,
                      color: AppTheme.mutedColor(context),
                    ),
                  ),
                )
              else
                ...printers.map(
                  (p) => InkWell(
                    onTap: () {
                      Navigator.pop(ctx);
                      setState(() => _connectionType =
                          isBluetoothMode ? 'BLUETOOTH' : 'NETWORK');
                      _applyPrinter(p);
                      _saveSettings();
                    },
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 20, vertical: 16),
                      child: Row(
                        children: [
                          Container(
                            width: 46,
                            height: 46,
                            decoration: BoxDecoration(
                              color: accentColor.withOpacity(0.12),
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: Icon(
                              isBluetoothMode
                                  ? Icons.bluetooth_rounded
                                  : Icons.print_rounded,
                              color: accentColor,
                              size: 22,
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  p.name,
                                  style: TextStyle(
                                    fontSize: 17,
                                    fontWeight: FontWeight.w600,
                                    color:
                                        isDark ? Colors.white : AppTheme.ink,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  p.address,
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w500,
                                    color: AppTheme.mutedColor(context),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: AppTheme.success.withOpacity(0.12),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(
                              'Välj',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: AppTheme.success,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildActionTile({
    required IconData icon,
    required String title,
    required String subtitle,
    required Color color,
    required bool loading,
    required VoidCallback onTap,
  }) {
    final isDark = AppTheme.isDark(context);
    final ink = isDark ? Colors.white : AppTheme.ink;
    return GestureDetector(
      onTap: loading ? null : onTap,
      child: AnimatedOpacity(
        opacity: loading ? 0.7 : 1.0,
        duration: const Duration(milliseconds: 150),
        child: Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: AppTheme.panelColor(context),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isDark
                  ? Colors.white.withOpacity(0.07)
                  : Colors.black.withOpacity(0.06),
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  color: AppTheme.faintColor(context),
                  borderRadius: BorderRadius.circular(17),
                ),
                child: loading
                    ? Padding(
                        padding: const EdgeInsets.all(15),
                        child: CircularProgressIndicator(
                          strokeWidth: 2.5,
                          color: ink,
                        ),
                      )
                    : Icon(icon, color: ink, size: 28),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                        color: isDark ? Colors.white : AppTheme.ink,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      subtitle,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: AppTheme.mutedColor(context),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(
                Icons.chevron_right_rounded,
                color: AppTheme.mutedColor(context),
                size: 24,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildActivePrinterIndicator() {
    final isDark = AppTheme.isDark(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
      decoration: BoxDecoration(
        color: AppTheme.faintColor(context),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.borderColor(context)),
      ),
      child: Row(
        children: [
          Icon(
            _connectionType == 'BLUETOOTH'
                ? Icons.bluetooth_rounded
                : Icons.print_rounded,
            color: isDark ? Colors.white : AppTheme.ink,
            size: 22,
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _nameController.text.isEmpty
                      ? 'Aktiv skrivare'
                      : _nameController.text,
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 16,
                    color: isDark ? Colors.white : AppTheme.ink,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  _addressController.text,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.mutedColor(context),
                  ),
                ),
              ],
            ),
          ),
          if (_saving)
            SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: AppTheme.mutedColor(context),
              ),
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final hasActivePrinter = _addressController.text.isNotEmpty;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: AppBackdrop(
        child: SafeArea(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(8, 12, 16, 0),
                      child: Row(
                        children: [
                          IconButton(
                            onPressed: () => Navigator.pop(context),
                            icon: const Icon(Icons.arrow_back_rounded),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            'Skrivare',
                            style: TextStyle(
                              fontSize: 26,
                              fontWeight: FontWeight.w600,
                              letterSpacing: -0.6,
                              color: isDark ? Colors.white : AppTheme.ink,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(20, 24, 20, 40),
                        children: [
                          if (hasActivePrinter) ...[
                            _buildActivePrinterIndicator(),
                            const SizedBox(height: 28),
                          ],
                          _buildActionTile(
                            icon: Icons.wifi_find_rounded,
                            title: 'Skanna nätverk',
                            subtitle: 'Hitta skrivare på lokalt nätverk',
                            color: Colors.deepPurple,
                            loading: _isScanningNetwork,
                            onTap: _scanNetworkAndShowModal,
                          ),
                          const SizedBox(height: 14),
                          _buildActionTile(
                            icon: Icons.bluetooth_searching_rounded,
                            title: 'Skanna Bluetooth',
                            subtitle: 'Hitta parade Bluetooth-skrivare',
                            color: Colors.blueAccent,
                            loading: _isScanningBluetooth,
                            onTap: _scanBluetoothAndShowModal,
                          ),
                          const SizedBox(height: 14),
                          _buildActionTile(
                            icon: Icons.receipt_long_rounded,
                            title: 'Testutskrift',
                            subtitle: 'Skicka ett testkvitto till aktiv skrivare',
                            color: AppTheme.brandGold,
                            loading: _testing,
                            onTap: _testPrint,
                          ),
                          const SizedBox(height: 14),
                          _buildActionTile(
                            icon: Icons.edit_rounded,
                            title: 'Manuell IP-adress',
                            subtitle: 'Ange IP-adress direkt för nätverksskrivare',
                            color: Colors.teal,
                            loading: false,
                            onTap: _showManualAddressModal,
                          ),
                          const SizedBox(height: 14),
                          _buildActionTile(
                            icon: Icons.help_outline_rounded,
                            title: 'Hjälp och felsökning',
                            subtitle:
                                'Steg-för-steg-guide för Bluetooth- och nätverksskrivare',
                            color: Colors.indigo,
                            loading: false,
                            onTap: () => Navigator.push(
                              context,
                              MaterialPageRoute(
                                  builder: (_) => const PrinterHelpScreen()),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}
