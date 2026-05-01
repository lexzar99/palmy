import 'package:flutter/material.dart';

import '../core/bluetooth_printer_service.dart';
import '../core/network_scanner.dart';
import '../core/print_service.dart';
import '../core/printing_config_service.dart';
import '../core/theme.dart';
import '../widgets/app_ui.dart';

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
  String? _templatePaperWidth;
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
        _templatePaperWidth = config?.template.paperWidth;
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

      final discovered = addresses.map(_networkProfileFromAddress).toList();
      setState(() {
        _networkPrinters = discovered;
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
    if (draft.address.isEmpty) {
      _showMessage('Ange skrivare eller adress innan du sparar.',
          isError: true);
      return;
    }

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
      _showMessage('Utskriftsinställningarna är sparade och synkade.');
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
      _showMessage(
        'Sparade lokalt. Servern kunde inte uppdateras just nu.',
        isError: true,
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _testPrint() async {
    final draft = _buildDraftPrinter();
    if (draft.address.isEmpty && draft.paperWidth != 'A4') {
      _showMessage('Välj eller ange en skrivare för att testa utskrift.',
          isError: true);
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

  @override
  Widget build(BuildContext context) {
    final visibleDiscovered =
        _connectionType == 'BLUETOOTH' ? _bluetoothPrinters : _networkPrinters;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: AppBackdrop(
        child: SafeArea(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                      child: Row(
                        children: [
                          IconButton(
                            onPressed: () => Navigator.pop(context),
                            icon: const Icon(Icons.arrow_back_rounded),
                          ),
                          const SizedBox(width: 4),
                          const Expanded(
                            child: AppSectionHeader(
                              eyebrow: 'Utskrift',
                              title: 'Skrivare och kvitton',
                              subtitle:
                                  'Konfigurera riktig utskrift via Bluetooth eller nätverk och testköra layouten direkt.',
                            ),
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
                        children: [
                          _buildSummaryCard(),
                          const SizedBox(height: 16),
                          Row(
                            children: [
                              Expanded(
                                child: ElevatedButton.icon(
                                  onPressed: _saving ? null : _saveSettings,
                                  icon: _saving
                                      ? const SizedBox(
                                          width: 18,
                                          height: 18,
                                          child: CircularProgressIndicator(
                                              strokeWidth: 2),
                                        )
                                      : const Icon(Icons.save_outlined),
                                  label: Text(_saving
                                      ? 'Sparar...'
                                      : 'Spara och synka'),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: OutlinedButton.icon(
                                  onPressed: _testing ? null : _testPrint,
                                  icon: _testing
                                      ? const SizedBox(
                                          width: 18,
                                          height: 18,
                                          child: CircularProgressIndicator(
                                              strokeWidth: 2),
                                        )
                                      : const Icon(Icons.receipt_long_rounded),
                                  label: Text(
                                      _testing ? 'Skickar...' : 'Testutskrift'),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 20),
                          const AppSectionHeader(
                            eyebrow: 'Anslutning',
                            title: 'Välj anslutning',
                          ),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 10,
                            runSpacing: 10,
                            children: [
                              ChoiceChip(
                                label: const Text('Nätverk'),
                                selected: _connectionType == 'NETWORK',
                                onSelected: (_) {
                                  setState(() => _connectionType = 'NETWORK');
                                },
                              ),
                              ChoiceChip(
                                label: const Text('Bluetooth'),
                                selected: _connectionType == 'BLUETOOTH',
                                onSelected: (_) {
                                  setState(() => _connectionType = 'BLUETOOTH');
                                },
                              ),
                            ],
                          ),
                          const SizedBox(height: 20),
                          _buildSettingsCard(),
                          const SizedBox(height: 20),
                          const AppSectionHeader(
                            eyebrow: 'Sparade',
                            title: 'Sparade skrivare',
                          ),
                          const SizedBox(height: 12),
                          if (_configuredPrinters.isEmpty)
                            const AppEmptyState(
                              icon: Icons.print_disabled_outlined,
                              title: 'Ingen standardskrivare sparad',
                              subtitle:
                                  'Skanna en skrivare eller fyll i adressen manuellt för att spara en profil.',
                            )
                          else
                            ..._configuredPrinters.map(_buildPrinterTile),
                          const SizedBox(height: 20),
                          AppSectionHeader(
                            eyebrow: 'Upptäckt',
                            title: _connectionType == 'BLUETOOTH'
                                ? 'Bluetooth-skrivare'
                                : 'Nätverksskrivare',
                            subtitle: _connectionType == 'BLUETOOTH'
                                ? 'Visa parade eller närliggande Bluetooth-skrivare beroende på plattform.'
                                : 'Skanna lokalt nätverk efter skrivare på port 9100.',
                          ),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Expanded(
                                child: OutlinedButton.icon(
                                  onPressed: _isScanningNetwork
                                      ? null
                                      : _startNetworkScan,
                                  icon: _isScanningNetwork
                                      ? const SizedBox(
                                          width: 18,
                                          height: 18,
                                          child: CircularProgressIndicator(
                                              strokeWidth: 2),
                                        )
                                      : const Icon(Icons.wifi_find_rounded),
                                  label: const Text('Skanna nätverk'),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: OutlinedButton.icon(
                                  onPressed: _isScanningBluetooth
                                      ? null
                                      : _startBluetoothScan,
                                  icon: _isScanningBluetooth
                                      ? const SizedBox(
                                          width: 18,
                                          height: 18,
                                          child: CircularProgressIndicator(
                                              strokeWidth: 2),
                                        )
                                      : const Icon(
                                          Icons.bluetooth_searching_rounded),
                                  label: const Text('Skanna Bluetooth'),
                                ),
                              ),
                            ],
                          ),
                          if (_bluetoothIssue != null) ...[
                            const SizedBox(height: 12),
                            AppPanel(
                              padding: const EdgeInsets.all(16),
                              tint: Colors.orange,
                              color: Colors.orange.withOpacity(0.10),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Icon(Icons.info_outline_rounded,
                                      color: Colors.orange),
                                  const SizedBox(width: 10),
                                  Expanded(child: Text(_bluetoothIssue!)),
                                ],
                              ),
                            ),
                          ],
                          const SizedBox(height: 12),
                          if (visibleDiscovered.isEmpty)
                            const AppEmptyState(
                              icon: Icons.search_off_rounded,
                              title: 'Ingen skrivare hittades än',
                              subtitle:
                                  'Försök igen efter att skrivaren är på, parad eller ansluten till samma nätverk.',
                            )
                          else
                            ...visibleDiscovered.map(_buildPrinterTile),
                          const SizedBox(height: 20),
                          const AppSectionHeader(
                            eyebrow: 'Manuell',
                            title: 'Manuell profil',
                            subtitle:
                                'Bra när du redan vet IP-adressen eller vill lägga in en Bluetooth-adress direkt.',
                          ),
                          const SizedBox(height: 12),
                          AppPanel(
                            child: Column(
                              children: [
                                TextField(
                                  controller: _nameController,
                                  decoration: const InputDecoration(
                                    labelText: 'Namn på skrivaren',
                                    prefixIcon:
                                        Icon(Icons.label_outline_rounded),
                                  ),
                                ),
                                const SizedBox(height: 12),
                                TextField(
                                  controller: _addressController,
                                  decoration: InputDecoration(
                                    labelText: _connectionType == 'BLUETOOTH'
                                        ? 'Bluetooth-adress'
                                        : 'IP-adress eller host:port',
                                    prefixIcon: Icon(
                                      _connectionType == 'BLUETOOTH'
                                          ? Icons.bluetooth_rounded
                                          : Icons.print_outlined,
                                    ),
                                  ),
                                ),
                              ],
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

  Widget _buildSummaryCard() {
    final selected = _buildDraftPrinter();

    return AppPanel(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Aktiv profil',
                        style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 8),
                    Text(
                      selected.name,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      selected.address.isEmpty
                          ? 'Ingen adress vald än.'
                          : selected.address,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              AppPill(
                label: (_syncStatus ?? 'LOCAL').toUpperCase(),
                color: (_syncStatus ?? 'LOCAL') == 'ONLINE'
                    ? Colors.green
                    : Colors.orange,
              ),
            ],
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              AppPill(
                label: selected.connectionType == 'BLUETOOTH'
                    ? 'Bluetooth'
                    : 'Nätverk',
                color: selected.connectionType == 'BLUETOOTH'
                    ? Colors.blueAccent
                    : Colors.deepPurple,
              ),
              AppPill(
                label: 'Papper ${selected.paperWidth}',
                color: Colors.amber,
              ),
              AppPill(
                label:
                    selected.autoPrint ? 'Autoutskrift på' : 'Autoutskrift av',
                color: selected.autoPrint ? Colors.green : Colors.grey,
              ),
            ],
          ),
          if (_templatePaperWidth != null) ...[
            const SizedBox(height: 14),
            Text(
              'Adminmallen använder ${_templatePaperWidth!} som grund. Du kan överstyra pappersbredden här om den lokala skrivaren behöver det.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildSettingsCard() {
    return AppPanel(
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Autoutskrift',
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 4),
                    Text(
                      'Skriv ut direkt när en ny order kommer in.',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ],
                ),
              ),
              Switch(
                value: _autoPrint,
                onChanged: (value) => setState(() => _autoPrint = value),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Antal kopior',
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 4),
                    Text(
                      'Hur många kvitton per order som skickas.',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: () =>
                    setState(() => _copies = _copies > 1 ? _copies - 1 : 1),
                icon: const Icon(Icons.remove_circle_outline_rounded),
              ),
              Text('$_copies', style: Theme.of(context).textTheme.titleLarge),
              IconButton(
                onPressed: () =>
                    setState(() => _copies = _copies < 5 ? _copies + 1 : 5),
                icon: const Icon(Icons.add_circle_outline_rounded),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Align(
            alignment: Alignment.centerLeft,
            child: Text('Pappersbredd',
                style: Theme.of(context).textTheme.titleMedium),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: ['58mm', '80mm', 'A4']
                .map(
                  (value) => ChoiceChip(
                    label: Text(value),
                    selected: _paperWidth == value,
                    onSelected: (_) => setState(() => _paperWidth = value),
                  ),
                )
                .toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildPrinterTile(PrinterProfile printer) {
    final isSelected =
        _connectionType == printer.connectionType.toUpperCase() &&
            _addressController.text.trim() == printer.address;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AppPanel(
        onTap: () => _applyPrinter(printer),
        tint: isSelected ? Colors.green : null,
        color: isSelected
            ? Colors.green.withOpacity(0.10)
            : AppTheme.panelColor(context),
        child: Row(
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                color: (printer.connectionType.toUpperCase() == 'BLUETOOTH'
                        ? Colors.blueAccent
                        : Colors.deepPurple)
                    .withOpacity(0.14),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Icon(
                printer.connectionType.toUpperCase() == 'BLUETOOTH'
                    ? Icons.bluetooth_rounded
                    : Icons.print_rounded,
                color: printer.connectionType.toUpperCase() == 'BLUETOOTH'
                    ? Colors.blueAccent
                    : Colors.deepPurple,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(printer.name,
                      style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 4),
                  Text(printer.address,
                      style: Theme.of(context).textTheme.bodyMedium),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      AppPill(
                        label: printer.connectionType.toUpperCase(),
                        color:
                            printer.connectionType.toUpperCase() == 'BLUETOOTH'
                                ? Colors.blueAccent
                                : Colors.deepPurple,
                      ),
                      AppPill(
                        label: printer.status ?? 'UNKNOWN',
                        color: printer.isDefault ? Colors.green : Colors.orange,
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Icon(
              isSelected
                  ? Icons.check_circle_rounded
                  : Icons.chevron_right_rounded,
              color: isSelected ? Colors.green : null,
            ),
          ],
        ),
      ),
    );
  }
}
