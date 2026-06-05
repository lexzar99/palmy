import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';

class ReceiptTemplateElement {
  final String key;
  final String label;
  final String? content;
  final bool visible;
  final int size;
  final String weight;
  final String align;
  final bool uppercase;

  ReceiptTemplateElement({
    required this.key,
    required this.label,
    required this.content,
    required this.visible,
    required this.size,
    required this.weight,
    required this.align,
    required this.uppercase,
  });

  factory ReceiptTemplateElement.fromJson(Map<String, dynamic> json) {
    return ReceiptTemplateElement(
      key: json['key']?.toString() ?? '',
      label: json['label']?.toString() ?? '',
      content: json['content']?.toString(),
      visible: json['visible'] == true,
      size: (json['size'] as num?)?.toInt() ?? 10,
      weight: json['weight']?.toString() ?? 'normal',
      align: json['align']?.toString() ?? 'left',
      uppercase: json['uppercase'] == true,
    );
  }

  Map<String, dynamic> toJson() => {
        'key': key,
        'label': label,
        'content': content,
        'visible': visible,
        'size': size,
        'weight': weight,
        'align': align,
        'uppercase': uppercase,
      };
}

class ReceiptTemplateSettings {
  final String paperWidth;
  final String platformName;
  final List<ReceiptTemplateElement> elements;

  ReceiptTemplateSettings({
    required this.paperWidth,
    required this.platformName,
    required this.elements,
  });

  factory ReceiptTemplateSettings.fromJson(Map<String, dynamic> json) {
    final rawElements = json['elements'] as List? ?? const [];
    return ReceiptTemplateSettings(
      paperWidth: json['paperWidth']?.toString() ?? '80mm',
      platformName: json['platformName']?.toString() ?? 'Delivera',
      elements: rawElements
          .whereType<Map>()
          .map((element) => ReceiptTemplateElement.fromJson(
              Map<String, dynamic>.from(element)))
          .toList(),
    );
  }

  Map<String, dynamic> toJson() => {
        'paperWidth': paperWidth,
        'platformName': platformName,
        'elements': elements.map((element) => element.toJson()).toList(),
      };
}

class PrinterProfile {
  final String id;
  final String restaurantId;
  final String? restaurantName;
  final String name;
  final String connectionType;
  final String address;
  final String paperWidth;
  final int copies;
  final bool autoPrint;
  final bool isDefault;
  final bool isActive;
  final String receiptMode;
  final String? notes;
  final String? status;
  final DateTime? lastSeenAt;

  PrinterProfile({
    required this.id,
    required this.restaurantId,
    required this.restaurantName,
    required this.name,
    required this.connectionType,
    required this.address,
    required this.paperWidth,
    required this.copies,
    required this.autoPrint,
    required this.isDefault,
    required this.isActive,
    required this.receiptMode,
    required this.notes,
    required this.status,
    required this.lastSeenAt,
  });

  factory PrinterProfile.fromJson(Map<String, dynamic> json) {
    return PrinterProfile(
      id: json['id']?.toString() ?? '',
      restaurantId: json['restaurantId']?.toString() ?? '',
      restaurantName: json['restaurantName']?.toString(),
      name: json['name']?.toString() ?? 'Skrivare',
      connectionType: json['connectionType']?.toString() ?? 'NETWORK',
      address: json['address']?.toString() ?? '',
      paperWidth: json['paperWidth']?.toString() ?? '80mm',
      copies: (json['copies'] as num?)?.toInt() ?? 1,
      autoPrint: json['autoPrint'] == true,
      isDefault: json['isDefault'] == true,
      isActive: json['isActive'] == true,
      receiptMode: json['receiptMode']?.toString() ?? 'STANDARD',
      notes: json['notes']?.toString(),
      status: json['status']?.toString(),
      lastSeenAt: json['lastSeenAt'] != null
          ? DateTime.tryParse(json['lastSeenAt'].toString())
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'restaurantId': restaurantId,
        'restaurantName': restaurantName,
        'name': name,
        'connectionType': connectionType,
        'address': address,
        'paperWidth': paperWidth,
        'copies': copies,
        'autoPrint': autoPrint,
        'isDefault': isDefault,
        'isActive': isActive,
        'receiptMode': receiptMode,
        'notes': notes,
        'status': status,
        'lastSeenAt': lastSeenAt?.toIso8601String(),
      };
}

class PrintingConfig {
  final ReceiptTemplateSettings template;
  final List<PrinterProfile> printers;
  final PrinterProfile? defaultPrinter;

  PrintingConfig({
    required this.template,
    required this.printers,
    required this.defaultPrinter,
  });

  factory PrintingConfig.fromJson(Map<String, dynamic> json) {
    final rawPrinters = json['printers'] as List? ?? const [];
    final printers = rawPrinters
        .whereType<Map>()
        .map((printer) =>
            PrinterProfile.fromJson(Map<String, dynamic>.from(printer)))
        .toList();

    PrinterProfile? defaultPrinter;
    if (json['defaultPrinter'] is Map) {
      defaultPrinter = PrinterProfile.fromJson(
          Map<String, dynamic>.from(json['defaultPrinter'] as Map));
    } else {
      for (final printer in printers) {
        if (printer.isDefault) {
          defaultPrinter = printer;
          break;
        }
      }
    }

    return PrintingConfig(
      template: ReceiptTemplateSettings.fromJson(
          Map<String, dynamic>.from(json['template'] as Map? ?? const {})),
      printers: printers,
      defaultPrinter: defaultPrinter,
    );
  }
}

class PrintingConfigService {
  static const String _printerIdKey = 'printer_id';
  static const String _printerNameKey = 'printer_name';
  static const String _printerIpKey = 'printer_ip';
  static const String _printerPaperWidthKey = 'printer_paper_width';
  static const String _printerTypeKey = 'printer_connection_type';
  static const String _autoPrintKey = 'auto_print';
  static const String _copiesKey = 'print_copies';
  static const String _templateCacheKey = 'receipt_template_cache';
  // Inbyggd skrivare: när true skickas kvitton till enhetens egen/system-
  // skrivare (Android-utskriftsramverket) istället för nätverks-/Bluetooth-
  // skrivare. Default PÅ så terminaler med inbyggd skrivare funkar direkt.
  static const String _useBuiltInPrinterKey = 'use_builtin_printer';

  final ApiClient _api = ApiClient();

  /// Läser om enhetens inbyggda skrivare ska användas. Default true (på).
  Future<bool> getUseBuiltInPrinter() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_useBuiltInPrinterKey) ?? true;
  }

  /// Sparar valet för inbyggd skrivare.
  Future<void> setUseBuiltInPrinter(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_useBuiltInPrinterKey, value);
  }

  Future<PrintingConfig?> fetchConfig() async {
    try {
      final response = await _api.get('/api/admin/printing/config');
      if (response.statusCode == 200 && response.data is Map) {
        final config =
            PrintingConfig.fromJson(Map<String, dynamic>.from(response.data));
        await _cacheRemoteConfig(config);
        return config;
      }
    } on DioException {
      // fall back to local cache
    } catch (_) {}

    return loadCachedConfig();
  }

  Future<ReceiptTemplateSettings> fetchTemplate() async {
    final config = await fetchConfig();
    return config?.template ??
        (await loadCachedConfig())?.template ??
        _defaultTemplate();
  }

  Future<PrinterProfile?> saveOrUpdateDefaultPrinter({
    String? existingPrinterId,
    required String name,
    required String address,
    required bool autoPrint,
    required int copies,
    required String paperWidth,
    String connectionType = 'NETWORK',
  }) async {
    final payload = {
      'name': name,
      'address': address,
      'connectionType': connectionType,
      'paperWidth': paperWidth,
      'copies': copies,
      'autoPrint': autoPrint,
      'isDefault': true,
      'isActive': true,
      'markSeen': true,
    };

    final Response response =
        existingPrinterId != null && existingPrinterId.isNotEmpty
            ? await _api.patch(
                '/api/admin/printing/printers/$existingPrinterId', payload)
            : await _api.post('/api/admin/printing/printers', payload);

    final printer =
        PrinterProfile.fromJson(Map<String, dynamic>.from(response.data));
    await _saveLocalPrinter(printer);
    return printer;
  }

  Future<void> heartbeat({String? printerId, String? address}) async {
    try {
      await _api.post('/api/admin/printing/heartbeat', {
        if (printerId != null && printerId.isNotEmpty) 'printerId': printerId,
        if (address != null && address.isNotEmpty) 'address': address,
      });
    } catch (_) {}
  }

  Future<PrintingConfig?> loadCachedConfig() async {
    final prefs = await SharedPreferences.getInstance();
    final rawTemplate = prefs.getString(_templateCacheKey);
    if (rawTemplate == null) {
      final printer = await loadLocalPrinter();
      if (printer == null) return null;
      return PrintingConfig(
        template: _defaultTemplate(),
        printers: [printer],
        defaultPrinter: printer,
      );
    }

    try {
      final template = ReceiptTemplateSettings.fromJson(
          Map<String, dynamic>.from(jsonDecode(rawTemplate)));
      final printer = await loadLocalPrinter();
      return PrintingConfig(
        template: template,
        printers: printer == null ? [] : [printer],
        defaultPrinter: printer,
      );
    } catch (_) {
      return null;
    }
  }

  Future<PrinterProfile?> loadLocalPrinter() async {
    final prefs = await SharedPreferences.getInstance();
    final address = prefs.getString(_printerIpKey) ?? '';
    if (address.isEmpty) return null;

    return PrinterProfile(
      id: prefs.getString(_printerIdKey) ?? '',
      restaurantId: '',
      restaurantName: null,
      name: prefs.getString(_printerNameKey) ?? 'Sparad skrivare',
      connectionType: prefs.getString(_printerTypeKey) ?? 'NETWORK',
      address: address,
      paperWidth: prefs.getString(_printerPaperWidthKey) ?? '80mm',
      copies: prefs.getInt(_copiesKey) ?? 1,
      autoPrint: prefs.getBool(_autoPrintKey) ?? false,
      isDefault: true,
      isActive: true,
      receiptMode: 'STANDARD',
      notes: null,
      status: 'LOCAL',
      lastSeenAt: null,
    );
  }

  Future<void> saveLocalFallback({
    required String name,
    required String address,
    required bool autoPrint,
    required int copies,
    required String paperWidth,
    String printerId = '',
    String connectionType = 'NETWORK',
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_autoPrintKey, autoPrint);
    await prefs.setInt(_copiesKey, copies);
    await prefs.setString(_printerIpKey, address);
    await prefs.setString(_printerNameKey, name);
    await prefs.setString(_printerIdKey, printerId);
    await prefs.setString(_printerPaperWidthKey, paperWidth);
    await prefs.setString(_printerTypeKey, connectionType);
  }

  Future<void> _cacheRemoteConfig(PrintingConfig config) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
        _templateCacheKey, jsonEncode(config.template.toJson()));
    final printer = config.defaultPrinter;
    if (printer != null) {
      await _saveLocalPrinter(printer);
    }
  }

  Future<void> _saveLocalPrinter(PrinterProfile printer) async {
    await saveLocalFallback(
      name: printer.name,
      address: printer.address,
      autoPrint: printer.autoPrint,
      copies: printer.copies,
      paperWidth: printer.paperWidth,
      printerId: printer.id,
      connectionType: printer.connectionType,
    );
  }

  ReceiptTemplateSettings _defaultTemplate() => ReceiptTemplateSettings(
        paperWidth: '80mm',
        platformName: 'Delivera',
        elements: [
          ReceiptTemplateElement(
              key: 'restaurantName',
              label: 'Restaurangnamn',
              content: null,
              visible: true,
              size: 14,
              weight: 'black',
              align: 'center',
              uppercase: true),
          ReceiptTemplateElement(
              key: 'platformName',
              label: 'Plattformsnamn (Delivera)',
              content: null,
              visible: true,
              size: 8,
              weight: 'normal',
              align: 'center',
              uppercase: true),
          ReceiptTemplateElement(
              key: 'address',
              label: 'Adress',
              content: null,
              visible: true,
              size: 8,
              weight: 'normal',
              align: 'center',
              uppercase: false),
          ReceiptTemplateElement(
              key: 'phone',
              label: 'Telefon',
              content: null,
              visible: true,
              size: 8,
              weight: 'normal',
              align: 'center',
              uppercase: false),
          ReceiptTemplateElement(
              key: 'divider1',
              label: 'Avdelare (efter info)',
              content: null,
              visible: true,
              size: 8,
              weight: 'normal',
              align: 'center',
              uppercase: false),
          ReceiptTemplateElement(
              key: 'headerMsg',
              label: 'Sidhuvud',
              content: '',
              visible: true,
              size: 9,
              weight: 'bold',
              align: 'center',
              uppercase: false),
          ReceiptTemplateElement(
              key: 'divider2',
              label: 'Avdelare (efter sidhuvud)',
              content: null,
              visible: true,
              size: 8,
              weight: 'normal',
              align: 'center',
              uppercase: false),
          ReceiptTemplateElement(
              key: 'orderNumber',
              label: 'Ordernummer',
              content: null,
              visible: true,
              size: 10,
              weight: 'bold',
              align: 'left',
              uppercase: false),
          ReceiptTemplateElement(
              key: 'timestamp',
              label: 'Datum & tid',
              content: null,
              visible: true,
              size: 8,
              weight: 'normal',
              align: 'left',
              uppercase: false),
          ReceiptTemplateElement(
              key: 'orderType',
              label: 'Typ (Leverans/Avhämtning)',
              content: null,
              visible: true,
              size: 9,
              weight: 'bold',
              align: 'left',
              uppercase: false),
          ReceiptTemplateElement(
              key: 'scheduledFor',
              label: 'Förbeställd tid',
              content: null,
              visible: true,
              size: 9,
              weight: 'bold',
              align: 'left',
              uppercase: false),
          ReceiptTemplateElement(
              key: 'customerName',
              label: 'Kundnamn',
              content: null,
              visible: true,
              size: 9,
              weight: 'bold',
              align: 'left',
              uppercase: false),
          ReceiptTemplateElement(
              key: 'customerPhone',
              label: 'Kundtelefon',
              content: null,
              visible: true,
              size: 8,
              weight: 'normal',
              align: 'left',
              uppercase: false),
          ReceiptTemplateElement(
              key: 'customerAddress',
              label: 'Leveransadress',
              content: null,
              visible: true,
              size: 8,
              weight: 'normal',
              align: 'left',
              uppercase: false),
          ReceiptTemplateElement(
              key: 'deliveryInstructions',
              label: 'Leveransinstruktioner',
              content: null,
              visible: true,
              size: 8,
              weight: 'bold',
              align: 'left',
              uppercase: false),
          ReceiptTemplateElement(
              key: 'note',
              label: 'Ordernotering',
              content: null,
              visible: true,
              size: 8,
              weight: 'bold',
              align: 'left',
              uppercase: false),
          ReceiptTemplateElement(
              key: 'allergens',
              label: 'Allergener',
              content: null,
              visible: true,
              size: 8,
              weight: 'bold',
              align: 'left',
              uppercase: false),
          ReceiptTemplateElement(
              key: 'divider3',
              label: 'Avdelare (före produkter)',
              content: null,
              visible: true,
              size: 8,
              weight: 'normal',
              align: 'center',
              uppercase: false),
          ReceiptTemplateElement(
              key: 'items',
              label: 'Produktrader',
              content: null,
              visible: true,
              size: 10,
              weight: 'bold',
              align: 'left',
              uppercase: false),
          ReceiptTemplateElement(
              key: 'extras',
              label: 'Tillbehör',
              content: null,
              visible: true,
              size: 8,
              weight: 'normal',
              align: 'left',
              uppercase: false),
          ReceiptTemplateElement(
              key: 'divider4',
              label: 'Avdelare (före summa)',
              content: null,
              visible: true,
              size: 8,
              weight: 'normal',
              align: 'center',
              uppercase: false),
          ReceiptTemplateElement(
              key: 'deliveryFee',
              label: 'Leveransavgift',
              content: null,
              visible: true,
              size: 9,
              weight: 'normal',
              align: 'left',
              uppercase: false),
          ReceiptTemplateElement(
              key: 'discount',
              label: 'Rabatt/Kod',
              content: null,
              visible: true,
              size: 9,
              weight: 'normal',
              align: 'left',
              uppercase: false),
          ReceiptTemplateElement(
              key: 'total',
              label: 'Totalt',
              content: null,
              visible: true,
              size: 12,
              weight: 'black',
              align: 'left',
              uppercase: false),
          ReceiptTemplateElement(
              key: 'paymentMethod',
              label: 'Betalmetod',
              content: null,
              visible: true,
              size: 8,
              weight: 'normal',
              align: 'left',
              uppercase: false),
          ReceiptTemplateElement(
              key: 'divider5',
              label: 'Avdelare (efter summa)',
              content: null,
              visible: true,
              size: 8,
              weight: 'normal',
              align: 'center',
              uppercase: false),
          ReceiptTemplateElement(
              key: 'thankYou',
              label: 'Tack-meddelande',
              content: 'Tack för din beställning!',
              visible: true,
              size: 9,
              weight: 'bold',
              align: 'center',
              uppercase: false),
          ReceiptTemplateElement(
              key: 'footerMsg',
              label: 'Sidfot',
              content: 'Välkommen åter!',
              visible: true,
              size: 8,
              weight: 'normal',
              align: 'center',
              uppercase: false),
        ],
      );
}
