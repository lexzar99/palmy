import 'dart:async';
import 'dart:io' show SocketException;
import 'dart:math' show max;
import 'dart:ui' as ui;
import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';
import 'package:image/image.dart' as img;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:esc_pos_utils_plus/esc_pos_utils_plus.dart';

import '../models/order_model.dart';
import 'api_client.dart';
import 'bluetooth_printer_service.dart';
import 'imin_printer_service.dart';
import 'log_service.dart';
import 'network_print_client.dart';
import 'printing_config_service.dart';

// ── Bitmap receipt painter ────────────────────────────────────────────────────
// Renders the receipt to a dart:ui Canvas. Pass canvas=null for a measure-only
// pass (to determine total height before allocating the picture recorder).
class _RP {
  final ui.Canvas? _c;
  final double width;
  final double margin;
  double y;

  _RP({ui.Canvas? canvas, required this.width, required this.margin, this.y = 20.0})
      : _c = canvas;

  double get cw => width - margin * 2;

  void space(double px) => y += px;

  void text(
    String t, {
    required double size,
    FontWeight w = FontWeight.normal,
    TextAlign align = TextAlign.left,
    Color color = const Color(0xFF000000),
  }) {
    if (t.isEmpty) return;
    final tp = TextPainter(
      text: TextSpan(
          text: t, style: TextStyle(fontSize: size, fontWeight: w, color: color, height: 1.3)),
      textDirection: TextDirection.ltr,
      textAlign: align,
    )..layout(maxWidth: cw);
    if (_c != null) {
      double x = margin;
      if (align == TextAlign.center) x = (width - tp.width) / 2;
      else if (align == TextAlign.right) x = width - margin - tp.width;
      tp.paint(_c!, Offset(x, y));
    }
    y += tp.height + 4;
  }

  void hr({double thickness = 2, double vPad = 12}) {
    y += vPad;
    if (_c != null) {
      _c!.drawLine(
        Offset(margin, y), Offset(width - margin, y),
        Paint()..color = const Color(0xFF000000)..strokeWidth = thickness,
      );
    }
    y += thickness + vPad;
  }

  void badge(String t) {
    if (t.isEmpty) return;
    const hPad = 24.0;
    const vPad = 10.0;
    const fs = 28.0;
    final tp = TextPainter(
      text: TextSpan(
          text: t, style: const TextStyle(fontSize: fs, fontWeight: FontWeight.w900, color: Color(0xFF000000), height: 1.3)),
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: cw - hPad * 2);
    final bw = tp.width + hPad * 2;
    final bh = tp.height + vPad * 2;
    final bx = (width - bw) / 2;
    if (_c != null) {
      _c!.drawRect(
        Rect.fromLTWH(bx, y, bw, bh),
        Paint()..color = const Color(0xFF000000)..style = PaintingStyle.stroke..strokeWidth = 3,
      );
      tp.paint(_c!, Offset(bx + hPad, y + vPad));
    }
    y += bh + 10;
  }

  void row(
    String left,
    String right, {
    required double size,
    FontWeight w = FontWeight.bold,
  }) {
    final ltp = TextPainter(
      text: TextSpan(text: left, style: TextStyle(fontSize: size, fontWeight: w, color: const Color(0xFF000000), height: 1.3)),
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: cw * 0.65);
    final rtp = TextPainter(
      text: TextSpan(text: right, style: TextStyle(fontSize: size, fontWeight: w, color: const Color(0xFF000000), height: 1.3)),
      textDirection: TextDirection.ltr,
    )..layout(maxWidth: cw * 0.35);
    if (_c != null) {
      ltp.paint(_c!, Offset(margin, y));
      rtp.paint(_c!, Offset(width - margin - rtp.width, y));
    }
    y += max(ltp.height, rtp.height) + 4;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/// Kategori av printer-fel — styr vilken hjälp-sektion vi öppnar och
/// vilka åtgärdssteg vi visar för personal. Spara koden enkel: BT, NETWORK
/// eller CONFIG/UNKNOWN för restkategorier.
enum PrinterFailureCategory { bluetooth, network, config, unknown }

/// Event som publiceras när ett auto-print misslyckas. UI:t (DashboardScreen)
/// lyssnar på [PrintService.errors] och visar en SnackBar med "HJÄLP"-action
/// som leder direkt till relevant sektion i PrinterHelpScreen.
class PrintFailure {
  final String orderNumber;
  final String reason;
  final PrinterFailureCategory category;
  final List<String> troubleshootingSteps;
  PrintFailure({
    required this.orderNumber,
    required this.reason,
    this.category = PrinterFailureCategory.unknown,
    this.troubleshootingSteps = const [],
  });
}

// Kort steg-för-steg-instruktion per kategori. Visas i SnackBar-toast som
// fallback om personal trycker på "DETALJER" innan de hinner till hjälp-
// skärmen. Behåll listorna korta — 3-4 punkter — så de får plats i UI.
const Map<PrinterFailureCategory, List<String>> _quickTroubleshooting = {
  PrinterFailureCategory.bluetooth: [
    'Kontrollera att skrivaren är på och inte i strömsparläge',
    'Öppna Android Bluetooth-inställningar och verifiera att skrivaren är parad',
    'Slå av/på Bluetooth på telefonen och försök igen',
    'Om felet kvarstår: starta om skrivaren (5 sek nedtryckt power)',
  ],
  PrinterFailureCategory.network: [
    'Kontrollera att skrivaren är ansluten till samma Wi-Fi som telefonen',
    'Verifiera IP-adressen under Inställningar → Skrivare',
    'Pinga IP:n från en dator för att bekräfta att den svarar',
    'Starta om skrivaren och routern om felet kvarstår',
  ],
  PrinterFailureCategory.config: [
    'Öppna Inställningar → Skrivare',
    'Välj "Skanna nätverk" eller "Skanna Bluetooth"',
    'Spara skrivaren och kör ett testkvitto',
  ],
  PrinterFailureCategory.unknown: [
    'Försök igen — det kan vara ett tillfälligt fel',
    'Om felet kvarstår: öppna Inställningar → Skrivare → Skriv ut test',
    'Behåll skrivarens skärm framme så vi kan se ev. felkod',
  ],
};

PrinterFailureCategory _categorizeFailure(String reason, {required bool hasPrinter}) {
  if (!hasPrinter) return PrinterFailureCategory.config;
  final lower = reason.toLowerCase();
  if (lower.contains('bluetooth') || lower.contains('bt-')) {
    return PrinterFailureCategory.bluetooth;
  }
  if (lower.contains('nätverk') ||
      lower.contains('network') ||
      lower.contains('socket') ||
      lower.contains('ip') ||
      RegExp(r'\d+\.\d+\.\d+\.\d+').hasMatch(reason)) {
    return PrinterFailureCategory.network;
  }
  return PrinterFailureCategory.unknown;
}

class PrintService {
  static final ApiClient _api = ApiClient();
  static final PrintingConfigService _printingConfigService =
      PrintingConfigService();

  /// Broadcast-stream som UI lyssnar på för att visa toast vid auto-print fail.
  static final StreamController<PrintFailure> _errorController =
      StreamController<PrintFailure>.broadcast();
  static Stream<PrintFailure> get errors => _errorController.stream;

  static String _twoDigits(int value) => value.toString().padLeft(2, '0');

  static String _scheduledTime(DateTime scheduledFor) =>
      '${_twoDigits(scheduledFor.hour)}:${_twoDigits(scheduledFor.minute)}';

  static String _scheduledDate(DateTime scheduledFor) =>
      '${_twoDigits(scheduledFor.day)}/${_twoDigits(scheduledFor.month)}/${scheduledFor.year}';

  static String _safeValue(dynamic value) => value?.toString() ?? '';

  static String _translateInstruction(String value) {
    switch (value.toUpperCase().trim()) {
      case 'RING_DOORBELL':
        return 'Ring på dörren';
      case 'LEAVE_AT_DOOR':
        return 'Lämna vid dörren';
      case 'MEET_OUTSIDE':
        return 'Möt mig utanför';
      case 'MEET_AT_DOOR':
        return 'Möt vid dörren';
      case 'NO_CONTACT':
        return 'Kontaktfri leverans';
      case 'CALL_ON_ARRIVAL':
        return 'Ring vid ankomst';
      default:
        return value;
    }
  }

  /// Replaces Swedish-specific characters with ASCII equivalents for ESC/POS
  /// printers that only support basic Latin (CP437 / US-ASCII).
  static String _latinize(String s) => s
      .replaceAll('å', 'a').replaceAll('Å', 'A')
      .replaceAll('ä', 'a').replaceAll('Ä', 'A')
      .replaceAll('ö', 'o').replaceAll('Ö', 'O');

  static String _normalizeText(String value, {required bool uppercase}) {
    final normalized = value.trim();
    return uppercase ? normalized.toUpperCase() : normalized;
  }

  /// Returnerar null vid succé eller skip, annars en kort felbeskrivning.
  /// Vid auto-print skickas dessutom felet till [errors]-streamen så UI:t
  /// kan visa toast.
  static Future<String?> printReceipt(OrderModel order,
      {bool respectAutoPrint = false, bool forceToPrinter = false}) async {
    PrintingConfig? config;
    try {
      config = await _printingConfigService.fetchConfig();
    } catch (e) {
      logger.log('PRINT: kunde inte hämta config: $e');
    }
    final printer = config?.defaultPrinter ??
        await _printingConfigService.loadLocalPrinter();

    final isAuto = respectAutoPrint || forceToPrinter;

    // Inbyggd skrivare (default PÅ): skicka kvittot till enhetens egen/system-
    // skrivare via Android-utskriftsramverket. Kräver ingen nätverks-/Bluetooth-
    // konfiguration och hoppar därför över printer==null-kontrollen nedan.
    if (await _printingConfigService.getUseBuiltInPrinter()) {
      try {
        return await _printViaBuiltInPrinter(
          order: order,
          printer: printer,
          printJobName: 'Order_${order.orderNumber}',
        );
      } catch (e) {
        final reason = _humanizeError(e);
        logger.log('PRINT (inbyggd) #${order.orderNumber}: $e');
        _emitFailure(order, reason, isAuto: isAuto, hasPrinter: true);
        return reason;
      }
    }

    // forceToPrinter (auto-print direkt efter att ordern godkänts): skriv ALLTID
    // till den konfigurerade skrivaren, oavsett auto-print-toggeln, utan PDF-popup.
    if (!forceToPrinter && respectAutoPrint && !(printer?.autoPrint ?? false)) {
      return null; // auto-print avstängd → tyst skip
    }

    if (printer == null) {
      // Auto-print utan skrivare → tyst skip (ingen PDF-dialog ska poppa upp).
      if (forceToPrinter) return null;
      const reason = 'Ingen skrivare konfigurerad';
      _emitFailure(order, reason, isAuto: isAuto, hasPrinter: false);
      return reason;
    }

    try {
      final receiptData = await _fetchReceiptData(order.id);
      final template = receiptData != null &&
              receiptData['template'] is Map<String, dynamic>
          ? ReceiptTemplateSettings.fromJson(receiptData['template'])
          : await _printingConfigService.fetchTemplate();
      final issue = await _dispatchPrint(
        order: order,
        receiptData: receiptData,
        template: template,
        printer: printer,
        allowPdfFallback: !respectAutoPrint && !forceToPrinter,
        printJobName: 'Order_${order.orderNumber}',
      );

      if (issue != null) {
        logger.log('PRINT FAIL #${order.orderNumber}: $issue');
        _emitFailure(order, issue, isAuto: isAuto, hasPrinter: true);
        return issue;
      }
      return null;
    } catch (e) {
      final reason = _humanizeError(e);
      logger.log('PRINT EXCEPTION #${order.orderNumber}: $e');
      _emitFailure(order, reason, isAuto: isAuto, hasPrinter: printer != null);
      return reason;
    }
  }

  static void _emitFailure(OrderModel order, String reason,
      {required bool isAuto, required bool hasPrinter}) {
    if (!isAuto) return; // manuella prints har redan UI-feedback via knapp
    if (_errorController.isClosed) return;
    final category = _categorizeFailure(reason, hasPrinter: hasPrinter);
    _errorController.add(
      PrintFailure(
        orderNumber: order.orderNumber,
        reason: reason,
        category: category,
        troubleshootingSteps:
            _quickTroubleshooting[category] ??
                _quickTroubleshooting[PrinterFailureCategory.unknown]!,
      ),
    );
  }

  static String _humanizeError(Object e) {
    final msg = e.toString().toLowerCase();
    if (msg.contains('socket') ||
        msg.contains('network') ||
        msg.contains('connection refused') ||
        msg.contains('timed out')) {
      return 'Skrivare ej nåbar (nätverk/Bluetooth)';
    }
    if (msg.contains('bluetooth') || msg.contains('not paired')) {
      return 'Bluetooth-skrivare ej parad eller avstängd';
    }
    return 'Kunde inte skriva ut kvitto';
  }

  static Future<String?> printTestTicket({PrinterProfile? printer}) async {
    final config = await _printingConfigService.fetchConfig();
    final effectivePrinter = printer ??
        config?.defaultPrinter ??
        await _printingConfigService.loadLocalPrinter();
    final template =
        config?.template ?? await _printingConfigService.fetchTemplate();
    final sampleOrder = _buildTestOrder();

    // Inbyggd skrivare på → testa via enhetens egen skrivare istället för
    // nätverks-/Bluetooth-skrivaren.
    if (await _printingConfigService.getUseBuiltInPrinter()) {
      return _printViaBuiltInPrinter(
        order: sampleOrder,
        printer: effectivePrinter,
        printJobName: 'Delivera_Testkvitto',
        receiptData: _fallbackReceiptData(sampleOrder, template),
        template: template,
      );
    }

    return _dispatchPrint(
      order: sampleOrder,
      receiptData: _fallbackReceiptData(sampleOrder, template),
      template: template,
      printer: effectivePrinter,
      allowPdfFallback:
          effectivePrinter == null || effectivePrinter.paperWidth == 'A4',
      printJobName: 'Delivera_Testkvitto',
    );
  }

  /// Skriver kvittot via enhetens inbyggda/system-skrivare (Android-
  /// utskriftsramverket → PDF-baserad utskrift). Returnerar null vid succé;
  /// exceptions bubblar upp till anroparen som loggar + emit:ar fel.
  static Future<String?> _printViaBuiltInPrinter({
    required OrderModel order,
    required PrinterProfile? printer,
    required String printJobName,
    Map<String, dynamic>? receiptData,
    ReceiptTemplateSettings? template,
  }) async {
    final data = receiptData ?? await _fetchReceiptData(order.id);
    final tmpl = template ??
        (data != null && data['template'] is Map<String, dynamic>
            ? ReceiptTemplateSettings.fromJson(data['template'])
            : await _printingConfigService.fetchTemplate());

    // iMin-enheter (Swift 2 Pro m.fl.): TYST direktutskrift på den inbyggda
    // termoskrivaren via iMin-SDK:t — ingen Android-utskriftsdialog.
    if (await IminPrinterService.isAvailable()) {
      // Inbyggd skrivare har egen pappersbredd (Swift 2 Pro = 58mm). A4 är inte
      // relevant för termoskrivare → tolka som 80mm.
      var builtInWidth = await _printingConfigService.getBuiltInPaperWidth();
      if (builtInWidth == 'A4') builtInWidth = '80mm';
      final pngBytes = await _buildReceiptPng(data, tmpl, builtInWidth);
      final issue = await IminPrinterService.printReceiptImage(pngBytes);
      if (issue == null) return null;
      // iMin-utskrift misslyckades → falla tillbaka på Android-print nedan.
      logger.log('PRINT iMin misslyckades, fallback Android-print: $issue');
    }

    // Fallback (icke-iMin-enhet eller iMin-fel): enhetens system-skrivare via
    // Android-utskriftsramverket. Kan visa systemets utskrifts-ark.
    final paperWidth = printer?.paperWidth ?? tmpl.paperWidth;
    final pdfBytes = await _buildPdfReceipt(
      receiptData: data,
      template: tmpl,
      paperWidth: paperWidth,
      order: order,
    );
    await Printing.layoutPdf(
      onLayout: (_) async => Uint8List.fromList(pdfBytes),
      name: printJobName,
    );
    return null;
  }

  static Future<String?> _dispatchPrint({
    required OrderModel order,
    required Map<String, dynamic>? receiptData,
    required ReceiptTemplateSettings template,
    required PrinterProfile? printer,
    required bool allowPdfFallback,
    required String printJobName,
  }) async {
    final paperWidth = printer?.paperWidth ?? template.paperWidth;
    final copies = printer?.copies ?? 1;
    final address = (printer?.address ?? '').trim();

    String? lastError;

    if (printer != null && paperWidth != 'A4' && address.isNotEmpty) {
      // Retry-policy: två försök med 1500 ms paus emellan. Bluetooth-skrivare
      // tappar ofta connection kort när Android väcker dem från strömsparläge,
      // och nätverk kan ha tillfälliga timeouts. Ett retry är ofta nog för att
      // återansluta utan att personalen märker något. Vi disconnectar Bluetooth
      // explicit mellan försöken så nästa attempt får ren state.
      const maxAttempts = 2;
      const retryDelay = Duration(milliseconds: 1500);

      if (_isBluetoothPrinter(printer)) {
        for (var attempt = 1; attempt <= maxAttempts; attempt++) {
          lastError = await _tryBluetoothPrint(
            address: address,
            paperWidth: paperWidth,
            copies: copies,
            receiptData: receiptData,
            template: template,
          );
          if (lastError == null) {
            await _printingConfigService.heartbeat(
              printerId: printer.id,
              address: address,
            );
            return null;
          }
          if (attempt < maxAttempts) {
            logger.log(
                'PRINT BT försök $attempt misslyckades: $lastError — retry om ${retryDelay.inMilliseconds}ms');
            try {
              await BluetoothPrinterService.disconnect();
            } catch (_) {
              // disconnect kan kasta om skrivaren aldrig anslöts; det är OK
            }
            await Future.delayed(retryDelay);
          }
        }
      } else if (_looksLikeNetworkPrinter(address)) {
        for (var attempt = 1; attempt <= maxAttempts; attempt++) {
          lastError = await _tryNetworkPrint(
            address: address,
            paperWidth: paperWidth,
            copies: copies,
            receiptData: receiptData,
            template: template,
          );
          if (lastError == null) {
            await _printingConfigService.heartbeat(
              printerId: printer.id,
              address: address,
            );
            return null;
          }
          if (attempt < maxAttempts) {
            logger.log(
                'PRINT NET försök $attempt misslyckades: $lastError — retry om ${retryDelay.inMilliseconds}ms');
            await Future.delayed(retryDelay);
          }
        }
      }
    }

    if (!allowPdfFallback) {
      if (printer == null || address.isEmpty) {
        return 'Ingen fysisk skrivare är vald för testutskrift.';
      }
      // Returnera det specifika felet om vi har ett, annars generiskt.
      return lastError ??
          (_isBluetoothPrinter(printer!)
              ? 'Bluetooth-skrivaren svarade inte. Kontrollera parkoppling och behörighet.'
              : 'Nätverksskrivaren kunde inte nås. Kontrollera IP-adress och att skrivaren är online.');
    }

    final pdfBytes = await _buildPdfReceipt(
      receiptData: receiptData,
      template: template,
      paperWidth: paperWidth,
      order: order,
    );

    await Printing.layoutPdf(
      onLayout: (_) async => Uint8List.fromList(pdfBytes),
      name: printJobName,
    );

    return null;
  }

  static Future<Map<String, dynamic>?> _fetchReceiptData(String orderId) async {
    try {
      final response =
          await _api.get('/api/admin/orders/$orderId/receipt-data');
      if (response.statusCode == 200 && response.data is Map) {
        return Map<String, dynamic>.from(response.data);
      }
    } catch (error) {
      debugPrint('Receipt data fetch failed: $error');
    }

    return null;
  }

  /// Returnerar null vid succé, annars ett specifikt felmeddelande.
  static Future<String?> _tryNetworkPrint({
    required String address,
    required String paperWidth,
    required int copies,
    required Map<String, dynamic>? receiptData,
    required ReceiptTemplateSettings template,
  }) async {
    final host = _networkHost(address);
    final port = _networkPort(address);
    try {
      final profile = await CapabilityProfile.load();
      final generator = Generator(
        paperWidth == '58mm' ? PaperSize.mm58 : PaperSize.mm80,
        profile,
      );
      List<int> oneCopy;
      try {
        oneCopy = await _buildBitmapBytes(generator, receiptData, template, paperWidth);
      } catch (bitmapErr) {
        debugPrint('Bitmap render failed, using ESC/POS text fallback: $bitmapErr');
        oneCopy = _buildEscPosBytes(generator, receiptData, template);
      }
      await NetworkPrintClient.sendBytes(
        host: host,
        port: port,
        bytes: <int>[for (var i = 0; i < copies; i++) ...oneCopy],
        copies: 1,
      );
      return null;
    } on SocketException catch (e) {
      debugPrint('Network print SocketException ($host:$port): $e');
      return 'Skrivare $host:$port – ${e.message}';
    } catch (error) {
      debugPrint('Network print failed ($host:$port): $error');
      return 'Nätverksskrivare-fel: $error';
    }
  }

  /// Returnerar null vid succé, annars ett specifikt felmeddelande.
  static Future<String?> _tryBluetoothPrint({
    required String address,
    required String paperWidth,
    required int copies,
    required Map<String, dynamic>? receiptData,
    required ReceiptTemplateSettings template,
  }) async {
    // Kolla behörighet/BT-status INNAN vi försöker ansluta.
    final issue = await BluetoothPrinterService.availabilityIssue();
    if (issue != null) return issue;

    try {
      final profile = await CapabilityProfile.load();
      final generator = Generator(
        paperWidth == '58mm' ? PaperSize.mm58 : PaperSize.mm80,
        profile,
      );
      List<int> oneCopy;
      try {
        oneCopy = await _buildBitmapBytes(generator, receiptData, template, paperWidth);
      } catch (bitmapErr) {
        debugPrint('Bitmap render failed, using ESC/POS text fallback: $bitmapErr');
        oneCopy = _buildEscPosBytes(generator, receiptData, template);
      }
      // Skicka kopia för kopia (inte en konkatenerad buffer) så vi kan
      // rapportera exakt antal lyckade kopior — B5-fix från A9 Ivar:
      // tidigare returnerades false när socket dog efter kopia 1 av 2,
      // personal tryckte igen → dubbel-utskrift av kopia 1.
      final result = await BluetoothPrinterService.printBytes(
        address: address,
        bytes: oneCopy,
        copies: copies,
      );
      if (result.isFullSuccess) return null;
      if (result.isPartial) {
        // Kritiskt UX: säg åt personalen att INTE trycka igen — vi har redan
        // tryckt det mesta. Bara så många kopior som saknas behövs handprintas.
        final missing = result.totalCopies - result.successCopies;
        final remainsTxt = missing == 1 ? '1 kopia saknas' : '$missing kopior saknas';
        return 'Bluetooth: ${result.successCopies}/${result.totalCopies} kopior klara — $remainsTxt. '
            'Tryck INTE skriv-ut igen, dela hand-skrivna kopior istället. (${result.error ?? "okänt fel"})';
      }
      return result.error ?? 'Bluetooth-skrivaren ($address) svarade inte. '
          'Kontrollera att skrivaren är påslagen och parad i Android Bluetooth-inställningarna.';
    } catch (error) {
      debugPrint('Bluetooth print failed: $error');
      return 'Bluetooth-fel: $error';
    }
  }

  static bool _isBluetoothPrinter(PrinterProfile printer) {
    return printer.connectionType.toUpperCase() == 'BLUETOOTH';
  }

  static bool _looksLikeNetworkPrinter(String address) {
    return address.contains('.') || RegExp(r'^.+:\d+$').hasMatch(address);
  }

  static String _networkHost(String address) {
    final trimmed = address.trim();
    final lastColon = trimmed.lastIndexOf(':');
    if (lastColon > 0 && trimmed.substring(0, lastColon).contains('.')) {
      return trimmed.substring(0, lastColon);
    }
    return trimmed;
  }

  static int _networkPort(String address) {
    final trimmed = address.trim();
    final lastColon = trimmed.lastIndexOf(':');
    if (lastColon > 0 && trimmed.substring(0, lastColon).contains('.')) {
      return int.tryParse(trimmed.substring(lastColon + 1)) ?? 9100;
    }
    return 9100;
  }

  static Future<List<int>> _buildPdfReceipt({
    required Map<String, dynamic>? receiptData,
    required ReceiptTemplateSettings template,
    required String paperWidth,
    required OrderModel order,
  }) async {
    final doc = pw.Document();
    final boldFont = await PdfGoogleFonts.robotoMonoBold();
    final regularFont = await PdfGoogleFonts.robotoMonoRegular();
    final payload = receiptData ?? _fallbackReceiptData(order, template);

    final pageFormat = paperWidth == '58mm'
        ? const PdfPageFormat(58 * PdfPageFormat.mm, double.infinity,
            marginAll: 4 * PdfPageFormat.mm)
        : paperWidth == 'A4'
            ? PdfPageFormat.a4.copyWith(
                marginBottom: 24,
                marginTop: 24,
                marginLeft: 24,
                marginRight: 24)
            : const PdfPageFormat(80 * PdfPageFormat.mm, double.infinity,
                marginAll: 5 * PdfPageFormat.mm);

    doc.addPage(
      pw.Page(
        pageFormat: pageFormat,
        build: (_) => pw.Column(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: _buildPdfWidgets(
            payload: payload,
            template: template,
            boldFont: boldFont,
            regularFont: regularFont,
          ),
        ),
      ),
    );

    return doc.save();
  }

  static List<pw.Widget> _buildPdfWidgets({
    required Map<String, dynamic> payload,
    required ReceiptTemplateSettings template,
    required pw.Font boldFont,
    required pw.Font regularFont,
  }) {
    final widgets = <pw.Widget>[];
    final header =
        Map<String, dynamic>.from(payload['header'] as Map? ?? const {});
    final orderInfo =
        Map<String, dynamic>.from(payload['orderInfo'] as Map? ?? const {});
    final customer =
        Map<String, dynamic>.from(payload['customer'] as Map? ?? const {});
    final totals =
        Map<String, dynamic>.from(payload['totals'] as Map? ?? const {});
    final items = (payload['items'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
    final visibleKeys = {
      for (final element
          in template.elements.where((element) => element.visible))
        element.key: element
    };
    final extrasVisible = visibleKeys.containsKey('extras');
    final noteVisible = visibleKeys.containsKey('note');

    for (final element
        in template.elements.where((element) => element.visible)) {
      if (element.key.startsWith('divider')) {
        widgets.add(pw.Padding(
            padding: const pw.EdgeInsets.symmetric(vertical: 6),
            child: pw.Divider()));
        continue;
      }

      pw.Widget? widget;
      final style = pw.TextStyle(
        font: element.weight == 'normal' ? regularFont : boldFont,
        fontSize: element.size.toDouble(),
      );
      final align = _pdfAlign(element.align);

      switch (element.key) {
        case 'restaurantName':
          widget = _pdfText(_safeValue(header['restaurantName']), style, align,
              element.uppercase);
          break;
        case 'platformName':
          widget = _pdfText(
              template.platformName,
              style.copyWith(color: PdfColors.grey700),
              align,
              element.uppercase);
          break;
        case 'address':
          final address = [
            header['address'],
            [header['zip'], header['city']]
                .where((value) => _safeValue(value).isNotEmpty)
                .join(' ')
          ].where((value) => _safeValue(value).isNotEmpty).join(', ');
          if (address.isNotEmpty)
            widget = _pdfText(address, style.copyWith(color: PdfColors.grey700),
                align, element.uppercase);
          break;
        case 'phone':
          if (_safeValue(header['phone']).isNotEmpty)
            widget = _pdfText(
                'Tel: ${_safeValue(header['phone'])}',
                style.copyWith(color: PdfColors.grey700),
                align,
                element.uppercase);
          break;
        case 'headerMsg':
          if ((element.content ?? '').trim().isNotEmpty)
            widget =
                _pdfText(element.content!, style, align, element.uppercase);
          break;
        case 'orderNumber':
          widget = _pdfText('Order #${_safeValue(orderInfo['number'])}', style,
              align, element.uppercase);
          break;
        case 'timestamp':
          widget = _pdfText(
              '${_safeValue(orderInfo['date'])} ${_safeValue(orderInfo['time'])}'
                  .trim(),
              style,
              align,
              element.uppercase);
          break;
        case 'orderType':
          widget = _pdfText(
              _safeValue(orderInfo['type']) == 'DELIVERY'
                  ? 'Utkörning'
                  : 'Avhämtning',
              style,
              align,
              element.uppercase);
          break;
        case 'scheduledFor':
          if (orderInfo['isPreorder'] == true) {
            widget = _pdfText(
                'Förbeställd ${_safeValue(orderInfo['scheduledDate'])} ${_safeValue(orderInfo['scheduledTime'])}'
                    .trim(),
                style,
                align,
                element.uppercase);
          }
          break;
        case 'estimatedTime':
          // Utlovad tid = klar-klockslag (accept-tid + utlovad tid), kommer som
          // readyTime från backend. Fallback: minuter. Visas inte för
          // förbeställningar — de har scheduledFor som tydlig tid.
          if (orderInfo['isPreorder'] != true &&
              orderInfo['estimatedTime'] != null) {
            final ready = _safeValue(orderInfo['readyTime']);
            widget = _pdfText(
                ready.isNotEmpty
                    ? 'Utlovad tid: Klar $ready'
                    : 'Utlovad tid: ${orderInfo['estimatedTime']} min',
                style,
                align,
                element.uppercase);
          }
          break;
        case 'customerName':
          if (_safeValue(customer['name']).isNotEmpty)
            widget = _pdfText('Kund: ${_safeValue(customer['name'])}', style,
                align, element.uppercase);
          break;
        case 'customerPhone':
          if (_safeValue(customer['phone']).isNotEmpty)
            widget = _pdfText('Telefon: ${_safeValue(customer['phone'])}',
                style, align, element.uppercase);
          break;
        case 'customerAddress':
          final customerAddress = [
            _safeValue(customer['street']),
            [customer['zip'], customer['city']]
                .where((value) => _safeValue(value).isNotEmpty)
                .join(' ')
          ].where((value) => value.isNotEmpty).join(', ');
          if (customerAddress.isNotEmpty)
            widget = _pdfText(customerAddress, style, align, element.uppercase);
          break;
        case 'deliveryInstructions':
          final rawInstr = _safeValue(customer['instructions']);
          if (rawInstr.isNotEmpty)
            widget = _pdfText(
                _translateInstruction(rawInstr), style, align, element.uppercase);
          break;
        case 'note':
          if (_safeValue(customer['note']).isNotEmpty)
            widget = _pdfText('Notering: ${_safeValue(customer['note'])}',
                style, align, element.uppercase);
          break;
        case 'allergens':
          if (_safeValue(customer['allergens']).isNotEmpty)
            widget = _pdfText(
                'Allergener: ${_safeValue(customer['allergens'])}',
                style,
                align,
                element.uppercase);
          break;
        case 'items':
          widget = pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: items.expand((item) {
              final localWidgets = <pw.Widget>[];
              localWidgets.add(
                pw.Row(
                  mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                  children: [
                    pw.Expanded(
                        child: _pdfText(
                            '${item['qty']}x ${_safeValue(item['name'])}',
                            style,
                            pw.TextAlign.left,
                            element.uppercase)),
                    pw.Text('${_safeValue(item['subtotal'])} kr', style: style),
                  ],
                ),
              );
              if (extrasVisible) {
                for (final extra
                    in (item['extras'] as List? ?? const []).whereType<Map>()) {
                  final eName = _safeValue(extra['name']);
                  if (eName.isEmpty) continue;
                  final ePrice =
                      (extra['price'] as num?)?.toDouble() ?? 0.0;
                  final reqFlag = extra['required'] as bool?;
                  final isMandatory = reqFlag ?? (ePrice == 0);
                  final extraStyle = pw.TextStyle(
                      font: regularFont,
                      fontSize: element.size.toDouble() - 1);
                  if (!isMandatory) {
                    localWidgets.add(
                      pw.Padding(
                        padding: const pw.EdgeInsets.only(left: 10, top: 2),
                        child: pw.Row(
                          mainAxisAlignment:
                              pw.MainAxisAlignment.spaceBetween,
                          children: [
                            pw.Text('++ $eName', style: extraStyle),
                            pw.Text(
                                '+${ePrice.toStringAsFixed(0)} kr',
                                style: extraStyle),
                          ],
                        ),
                      ),
                    );
                  } else {
                    localWidgets.add(
                      pw.Padding(
                        padding: const pw.EdgeInsets.only(left: 10, top: 2),
                        child: pw.Text('-- $eName', style: extraStyle),
                      ),
                    );
                  }
                }
              }
              if (noteVisible && _safeValue(item['note']).isNotEmpty) {
                localWidgets.add(
                  pw.Padding(
                    padding: const pw.EdgeInsets.only(left: 10, top: 2),
                    child: pw.Text('! ${_safeValue(item['note'])}',
                        style: pw.TextStyle(
                            font: boldFont,
                            fontSize: element.size.toDouble() - 1)),
                  ),
                );
              }
              localWidgets.add(pw.SizedBox(height: 4));
              return localWidgets;
            }).toList(),
          );
          break;
        case 'deliveryFee':
          if ((_toNum(totals['deliveryFee']) ?? 0) > 0) {
            widget = _pdfRow(
                'Leverans', '${_safeValue(totals['deliveryFee'])} kr', style);
          }
          break;
        case 'discount':
          if ((_toNum(totals['discount']) ?? 0) > 0) {
            final code = _safeValue(totals['discountCode']);
            widget = _pdfRow(
              code.isNotEmpty ? 'Rabatt ($code)' : 'Rabatt',
              '-${_safeValue(totals['discount'])} kr',
              style.copyWith(color: PdfColors.green700),
            );
          }
          break;
        case 'total':
          widget =
              _pdfRow('Totalt', '${_safeValue(totals['total'])} kr', style);
          break;
        case 'paymentMethod':
          if (_safeValue(orderInfo['paymentMethod']).isNotEmpty) {
            widget = _pdfText(
                'Betalmetod: ${_safeValue(orderInfo['paymentMethod'])}',
                style,
                align,
                element.uppercase);
          }
          break;
        case 'thankYou':
          if ((element.content ?? '').trim().isNotEmpty)
            widget =
                _pdfText(element.content!, style, align, element.uppercase);
          break;
        case 'footerMsg':
          if ((element.content ?? '').trim().isNotEmpty)
            widget = _pdfText(
                element.content!,
                style.copyWith(color: PdfColors.grey700),
                align,
                element.uppercase);
          break;
      }

      if (widget != null) {
        widgets.add(widget);
        widgets.add(pw.SizedBox(height: 4));
      }
    }

    return widgets;
  }

  // ── Bitmap rendering ────────────────────────────────────────────────────────

  /// Renderar kvittot till en bitmap (img.Image) i rätt pixelbredd för
  /// pappersbredden. Delas av ESC/POS-vägen (nätverk/Bluetooth) och iMin-vägen
  /// (inbyggd skrivare) så utskriften ser exakt likadan ut oavsett kanal.
  static Future<img.Image> _renderReceiptImage(
    Map<String, dynamic>? receiptData,
    ReceiptTemplateSettings template,
    String paperWidth,
  ) async {
    // 203 DPI printable dots per paper width.
    // 72 mm gets a narrower canvas (512) to stay within the physical printable
    // area — many 72 mm printers have a ~8 mm hardware margin that would push
    // a full-576 px image off the right edge.
    final int widthPx = paperWidth == '58mm' ? 384
                      : paperWidth == '72mm' ? 512
                      :                        576; // 80 mm

    // Small soft margin; the printer itself provides a hardware margin.
    const double margin = 10.0;

    // Measure pass (canvas = null) to determine total receipt height.
    final m = _RP(width: widthPx.toDouble(), margin: margin);
    _drawReceiptBitmap(m, receiptData, template);
    final int heightPx = (m.y + 60).ceil();

    // Draw pass — render receipt onto a white canvas.
    final recorder = ui.PictureRecorder();
    final canvas = ui.Canvas(recorder);
    canvas.drawRect(
      Rect.fromLTWH(0, 0, widthPx.toDouble(), heightPx.toDouble()),
      Paint()..color = const Color(0xFFFFFFFF),
    );
    final d = _RP(canvas: canvas, width: widthPx.toDouble(), margin: margin);
    _drawReceiptBitmap(d, receiptData, template);

    final picture = recorder.endRecording();
    final uiImg = await picture.toImage(widthPx, heightPx);
    final byteData = await uiImg.toByteData(format: ui.ImageByteFormat.rawRgba);
    if (byteData == null) throw Exception('Bitmap render: toByteData returned null');

    return img.Image.fromBytes(
      width: widthPx,
      height: heightPx,
      bytes: byteData.buffer,
      numChannels: 4,
      order: img.ChannelOrder.rgba,
    );
  }

  /// PNG-kodad kvitto-bild för iMin:s printSingleBitmap (inbyggd skrivare).
  static Future<Uint8List> _buildReceiptPng(
    Map<String, dynamic>? receiptData,
    ReceiptTemplateSettings template,
    String paperWidth,
  ) async {
    final image = await _renderReceiptImage(receiptData, template, paperWidth);
    return Uint8List.fromList(img.encodePng(image));
  }

  /// Renders the receipt to a bitmap and wraps it in ESC/POS image commands.
  /// This produces a WYSIWYG printout matching the admin preview exactly.
  static Future<List<int>> _buildBitmapBytes(
    Generator generator,
    Map<String, dynamic>? receiptData,
    ReceiptTemplateSettings template,
    String paperWidth,
  ) async {
    final bitmapImg =
        await _renderReceiptImage(receiptData, template, paperWidth);
    return <int>[
      // Left-align so the printer doesn't try to center a potentially wider image
      // on a narrower physical paper, which would shift content off the right edge.
      ...generator.imageRaster(bitmapImg,
          align: PosAlign.center,
          highDensityHorizontal: true,
          highDensityVertical: true),
      ...generator.feed(2),
      ...generator.cut(),
    ];
  }

  static TextAlign _toTextAlign(String align) {
    switch (align) {
      case 'center': return TextAlign.center;
      case 'right':  return TextAlign.right;
      default:       return TextAlign.left;
    }
  }

  static FontWeight _toFontWeightBitmap(String weight) {
    switch (weight) {
      case 'black': return FontWeight.w900;
      case 'bold':  return FontWeight.bold;
      default:      return FontWeight.normal;
    }
  }

  static void _drawReceiptBitmap(
    _RP p,
    Map<String, dynamic>? receiptData,
    ReceiptTemplateSettings template,
  ) {
    final payload = receiptData ?? _fallbackReceiptData(null, template);
    final h = Map<String, dynamic>.from(payload['header'] as Map? ?? const {});
    final o = Map<String, dynamic>.from(payload['orderInfo'] as Map? ?? const {});
    final c = Map<String, dynamic>.from(payload['customer'] as Map? ?? const {});
    final t = Map<String, dynamic>.from(payload['totals'] as Map? ?? const {});
    final items = (payload['items'] as List? ?? const [])
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();

    // Build lookup from template elements so every field respects admin settings.
    final elMap = { for (final el in template.elements) el.key: el };

    // Template sizes are web CSS px (8-18). Bitmap canvas is ~512px wide for
    // 72mm @ 203 DPI, so we scale up to match printed output.
    const double bitmapScale = 3.0;

    TextAlign ea(String key, [String fallback = 'left']) =>
        _toTextAlign(elMap[key]?.align ?? fallback);
    double es(String key, double fallback) =>
        ((elMap[key]?.size ?? fallback) * bitmapScale);
    FontWeight ew(String key, [String fallback = 'normal']) =>
        _toFontWeightBitmap(elMap[key]?.weight ?? fallback);
    bool ev(String key) => elMap[key]?.visible != false;
    String eu(String key, String text) =>
        (elMap[key]?.uppercase == true) ? text.toUpperCase() : text;

    const grey = Color(0xFF666666);
    const red = Color(0xFFCC0000);
    final isDelivery = _safeValue(o['type']) == 'DELIVERY';

    // Platform + order number (always visible header)
    p.text('${template.platformName} #${_safeValue(o['number'])}',
        size: 22, w: FontWeight.bold, align: TextAlign.center);
    p.text('Ej kvitto', size: 20, align: TextAlign.center, color: grey);
    p.hr();

    // Restaurant name
    final rName = _safeValue(h['restaurantName']);
    if (ev('restaurantName') && rName.isNotEmpty) {
      p.text(eu('restaurantName', rName),
          size: es('restaurantName', 44), w: ew('restaurantName', 'black'), align: ea('restaurantName', 'center'));
    }
    // Timestamp
    if (ev('timestamp')) {
      p.text('${_safeValue(o['date'])} ${_safeValue(o['time'])}',
          size: es('timestamp', 24), w: ew('timestamp', 'bold'), align: ea('timestamp', 'center'));
    }
    // Restaurant address
    final rAddr = [
      _safeValue(h['address']),
      [h['zip'], h['city']].where((v) => _safeValue(v).isNotEmpty).join(' '),
    ].where((v) => v.isNotEmpty).join(', ');
    if (ev('address') && rAddr.isNotEmpty) {
      p.text(rAddr, size: es('address', 22), align: ea('address', 'center'));
    }
    // Restaurant phone
    if (ev('phone') && _safeValue(h['phone']).isNotEmpty) {
      p.text('Tel: ${_safeValue(h['phone'])}',
          size: es('phone', 22), align: ea('phone', 'center'));
    }
    p.hr();

    // Customer name
    if (ev('customerName') && _safeValue(c['name']).isNotEmpty) {
      p.text(_safeValue(c['name']),
          size: es('customerName', 34), w: ew('customerName', 'black'), align: ea('customerName', 'left'));
    }
    // Customer phone
    if (ev('customerPhone') && _safeValue(c['phone']).isNotEmpty) {
      p.text(_safeValue(c['phone']),
          size: es('customerPhone', 24), w: ew('customerPhone', 'bold'), align: ea('customerPhone', 'left'));
    }
    // Customer address
    final cAddr = [
      _safeValue(c['street']),
      [c['zip'], c['city']].where((v) => _safeValue(v).isNotEmpty).join(' '),
    ].where((v) => v.isNotEmpty).join(', ');
    if (ev('customerAddress') && cAddr.isNotEmpty) {
      p.space(8);
      p.text(cAddr,
          size: es('customerAddress', 24), w: ew('customerAddress', 'black'), align: ea('customerAddress', 'left'));
    }
    // Delivery instructions
    if (ev('deliveryInstructions') && _safeValue(c['instructions']).isNotEmpty) {
      p.text(_translateInstruction(_safeValue(c['instructions'])),
          size: es('deliveryInstructions', 22), w: ew('deliveryInstructions'), align: ea('deliveryInstructions', 'left'));
    }
    // Order note
    if (ev('note') && _safeValue(c['note']).isNotEmpty) {
      p.text(_safeValue(c['note']),
          size: es('note', 22), w: ew('note', 'bold'), align: ea('note', 'left'));
    }
    // Allergens
    if (ev('allergens')) {
      final allergensRaw = c['allergens'];
      final allergensStr = allergensRaw is List
          ? (allergensRaw as List).map((e) => _safeValue(e)).where((e) => e.isNotEmpty).join(', ')
          : _safeValue(allergensRaw);
      if (allergensStr.isNotEmpty) {
        p.text('! $allergensStr',
            size: es('allergens', 22), w: ew('allergens', 'black'), color: red, align: ea('allergens', 'left'));
      }
    }
    p.space(12);

    // Order type badge
    if (ev('orderType')) p.badge(isDelivery ? 'Utkörning' : 'Avhämtning');
    // Scheduled
    if (ev('scheduledFor') && o['isPreorder'] == true) {
      p.badge('Förbeställd ${_safeValue(o['scheduledDate'])} ${_safeValue(o['scheduledTime'])}');
    }
    // Payment method
    if (ev('paymentMethod') && _safeValue(o['paymentMethod']).isNotEmpty) {
      p.badge(_safeValue(o['paymentMethod']));
    }

    // Utlovad tid = klar-klockslag (accept-tid + utlovad tid). Fallback: minuter.
    if (ev('estimatedTime') && o['isPreorder'] != true && o['estimatedTime'] != null) {
      p.space(8);
      final ready = _safeValue(o['readyTime']);
      p.text('Utlovad tid', size: es('estimatedTime', 24), align: ea('estimatedTime', 'center'));
      p.text(ready.isNotEmpty ? 'Klar $ready' : '${o['estimatedTime']} min',
          size: es('estimatedTime', 64), w: FontWeight.w900, align: ea('estimatedTime', 'center'));
    }

    // Item count
    p.text(
      '${items.length} artikel${items.length > 1 ? 'ar' : ''}',
      size: 22, align: TextAlign.center, color: grey,
    );
    p.hr();

    // Items
    if (ev('items')) {
      for (final item in items) {
        p.row(
          '${item['qty']} x ${_normalizeText(_safeValue(item['name']), uppercase: false)}',
          '${_safeValue(item['subtotal'])} kr',
          size: es('items', 28),
        );
        if (ev('extras')) {
          final extras = item['extras'];
          if (extras is List) {
            for (final extra in extras) {
              final en =
                  extra is Map ? _safeValue(extra['name']) : _safeValue(extra);
              if (en.isEmpty) continue;
              final ePrice = extra is Map
                  ? ((extra['price'] as num?)?.toDouble() ?? 0.0)
                  : 0.0;
              final reqFlag = extra is Map ? extra['required'] as bool? : null;
              final isMandatory = reqFlag ?? (ePrice == 0);
              if (!isMandatory) {
                p.row('++ $en', '+${ePrice.toStringAsFixed(0)} kr',
                    size: es('extras', 22));
              } else {
                p.text('-- $en', size: es('extras', 22));
              }
            }
          }
        }
        if (_safeValue(item['note']).isNotEmpty) {
          p.text('! ${_safeValue(item['note'])}', size: es('items', 22), w: FontWeight.bold);
        }
        p.space(6);
      }
    }
    p.hr();

    // Totals
    if (ev('deliveryFee') && (_toNum(t['deliveryFee']) ?? 0) > 0) {
      p.row('Leveransavgift', '${_safeValue(t['deliveryFee'])} kr', size: es('deliveryFee', 24).toInt().toDouble());
    }
    if (ev('discount') && (_toNum(t['discount']) ?? 0) > 0) {
      final code = _safeValue(t['discountCode']);
      p.row(
        code.isNotEmpty ? 'Rabatt ($code)' : 'Rabatt',
        '-${_safeValue(t['discount'])} kr',
        size: es('discount', 24),
      );
    }
    p.hr(thickness: 3);
    if (ev('total')) {
      p.row('Totalt', '${_safeValue(t['total'])} kr',
          size: es('total', 44), w: ew('total', 'black'));
    }
    p.hr();

    // Footer
    p.space(6);
    if (ev('thankYou')) {
      final ty = (elMap['thankYou']?.content?.isNotEmpty == true)
          ? elMap['thankYou']!.content!
          : 'Tack för din beställning!';
      p.text(ty, size: es('thankYou', 22), w: ew('thankYou', 'bold'), align: ea('thankYou', 'center'));
    }
    if (ev('footerMsg')) {
      final fm = (elMap['footerMsg']?.content?.isNotEmpty == true)
          ? elMap['footerMsg']!.content!
          : 'Välkommen åter!';
      p.text(fm, size: es('footerMsg', 20), align: ea('footerMsg', 'center'), color: grey);
    }
  }

  // ── ESC/POS text (legacy, kept for A4 PDF path) ───────────────────────────

  static List<int> _buildEscPosBytes(
    Generator generator,
    Map<String, dynamic>? receiptData,
    ReceiptTemplateSettings template,
  ) {
    final payload = receiptData ?? _fallbackReceiptData(null, template);
    final header =
        Map<String, dynamic>.from(payload['header'] as Map? ?? const {});
    final orderInfo =
        Map<String, dynamic>.from(payload['orderInfo'] as Map? ?? const {});
    final customer =
        Map<String, dynamic>.from(payload['customer'] as Map? ?? const {});
    final totals =
        Map<String, dynamic>.from(payload['totals'] as Map? ?? const {});
    final items = (payload['items'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
    final visibleKeys = {
      for (final element
          in template.elements.where((element) => element.visible))
        element.key: element
    };
    final extrasVisible = visibleKeys.containsKey('extras');
    final noteVisible = visibleKeys.containsKey('note');

    final bytes = <int>[];
    for (final element
        in template.elements.where((element) => element.visible)) {
      if (element.key.startsWith('divider')) {
        bytes.addAll(generator.hr());
        continue;
      }

      switch (element.key) {
        case 'restaurantName':
          bytes.addAll(_posText(
              generator, _safeValue(header['restaurantName']), element));
          break;
        case 'platformName':
          bytes.addAll(_posText(generator, template.platformName, element));
          break;
        case 'address':
          final address = [
            header['address'],
            [header['zip'], header['city']]
                .where((value) => _safeValue(value).isNotEmpty)
                .join(' ')
          ].where((value) => _safeValue(value).isNotEmpty).join(', ');
          if (address.isNotEmpty)
            bytes.addAll(_posText(generator, address, element));
          break;
        case 'phone':
          if (_safeValue(header['phone']).isNotEmpty)
            bytes.addAll(_posText(
                generator, 'Tel: ${_safeValue(header['phone'])}', element));
          break;
        case 'headerMsg':
          if ((element.content ?? '').trim().isNotEmpty)
            bytes.addAll(_posText(generator, element.content!, element));
          break;
        case 'orderNumber':
          bytes.addAll(_posText(
              generator, '#${_safeValue(orderInfo['number'])}', element));
          break;
        case 'timestamp':
          bytes.addAll(_posText(
              generator,
              '${_safeValue(orderInfo['date'])} ${_safeValue(orderInfo['time'])}'
                  .trim(),
              element));
          break;
        case 'orderType':
          bytes.addAll(_posText(
              generator,
              _safeValue(orderInfo['type']) == 'DELIVERY'
                  ? '[ UTKORING ]'
                  : '[ AVHAMTNING ]',
              element));
          break;
        case 'scheduledFor':
          if (orderInfo['isPreorder'] == true)
            bytes.addAll(_posText(
                generator,
                'Forbestalld ${_safeValue(orderInfo['scheduledDate'])} ${_safeValue(orderInfo['scheduledTime'])}'
                    .trim(),
                element));
          break;
        case 'estimatedTime':
          if (orderInfo['isPreorder'] != true &&
              orderInfo['estimatedTime'] != null) {
            final ready = _safeValue(orderInfo['readyTime']);
            bytes.addAll(generator.text('Utlovad tid',
                styles: const PosStyles(align: PosAlign.center)));
            bytes.addAll(_posText(
                generator,
                ready.isNotEmpty ? 'Klar $ready' : '${orderInfo['estimatedTime']} min',
                element)); // size2 via element.size >= 12
          }
          break;
        case 'customerName':
          if (_safeValue(customer['name']).isNotEmpty) {
            bytes.addAll(generator.text('Kund:',
                styles: const PosStyles(align: PosAlign.left)));
            bytes.addAll(
                _posText(generator, _safeValue(customer['name']), element));
          }
          break;
        case 'customerPhone':
          if (_safeValue(customer['phone']).isNotEmpty)
            bytes.addAll(
                _posText(generator, _safeValue(customer['phone']), element));
          break;
        case 'customerAddress':
          final customerAddress = [
            _safeValue(customer['street']),
            [customer['zip'], customer['city']]
                .where((value) => _safeValue(value).isNotEmpty)
                .join(' ')
          ].where((value) => value.isNotEmpty).join(', ');
          if (customerAddress.isNotEmpty) {
            bytes.addAll(generator.text('Adress:',
                styles: const PosStyles(align: PosAlign.left)));
            bytes.addAll(_posText(generator, customerAddress, element));
          }
          break;
        case 'deliveryInstructions':
          final rawPosInstr = _safeValue(customer['instructions']);
          if (rawPosInstr.isNotEmpty)
            bytes.addAll(_posText(
                generator, _translateInstruction(rawPosInstr), element));
          break;
        case 'note':
          if (_safeValue(customer['note']).isNotEmpty)
            bytes.addAll(
                _posText(generator, _safeValue(customer['note']), element));
          break;
        case 'allergens':
          final allergensRaw = customer['allergens'];
          final allergensStr = allergensRaw is List
              ? (allergensRaw)
                  .map((e) => _safeValue(e))
                  .where((e) => e.isNotEmpty)
                  .join(', ')
              : _safeValue(allergensRaw);
          if (allergensStr.isNotEmpty)
            bytes.addAll(
                _posText(generator, '! $allergensStr', element));
          break;
        case 'items':
          bytes.addAll(generator.text(
              '${items.length} artikel${items.length > 1 ? 'ar' : ''}',
              styles: const PosStyles(align: PosAlign.center)));
          bytes.addAll(generator.hr());
          for (final item in items) {
            bytes.addAll(generator.row([
              PosColumn(
                  text:
                      '${item['qty']} x ${_normalizeText(_safeValue(item['name']), uppercase: element.uppercase)}',
                  width: 9,
                  styles: _posStyles(element)),
              PosColumn(
                  text: '${_safeValue(item['subtotal'])} kr',
                  width: 3,
                  styles: _posStyles(element, align: PosAlign.right)),
            ]));
            if (extrasVisible) {
              for (final extra
                  in (item['extras'] as List? ?? const []).whereType<Map>()) {
                final eName = _safeValue(extra['name']);
                if (eName.isEmpty) continue;
                final ePrice =
                    (extra['price'] as num?)?.toDouble() ?? 0.0;
                final reqFlag = extra['required'] as bool?;
                final isMandatory = reqFlag ?? (ePrice == 0);
                if (!isMandatory) {
                  bytes.addAll(generator.row([
                    PosColumn(
                        text: '++ $eName',
                        width: 9,
                        styles: const PosStyles(align: PosAlign.left)),
                    PosColumn(
                        text: '+${ePrice.toStringAsFixed(0)} kr',
                        width: 3,
                        styles: const PosStyles(align: PosAlign.right)),
                  ]));
                } else {
                  bytes.addAll(generator.text('-- $eName',
                      styles: const PosStyles(align: PosAlign.left)));
                }
              }
            }
            if (noteVisible && _safeValue(item['note']).isNotEmpty) {
              bytes.addAll(generator.text('! ${_safeValue(item['note'])}',
                  styles: const PosStyles(align: PosAlign.left, bold: true)));
            }
          }
          break;
        case 'deliveryFee':
          if ((_toNum(totals['deliveryFee']) ?? 0) > 0) {
            bytes.addAll(generator.row([
              PosColumn(
                  text: 'Leveransavgift', width: 8, styles: _posStyles(element)),
              PosColumn(
                  text: '${_safeValue(totals['deliveryFee'])} kr',
                  width: 4,
                  styles: _posStyles(element, align: PosAlign.right)),
            ]));
          }
          break;
        case 'discount':
          if ((_toNum(totals['discount']) ?? 0) > 0) {
            final code = _safeValue(totals['discountCode']);
            bytes.addAll(generator.row([
              PosColumn(
                  text: code.isNotEmpty ? 'Rabatt ($code)' : 'Rabatt',
                  width: 8,
                  styles: _posStyles(element)),
              PosColumn(
                  text: '-${_safeValue(totals['discount'])} kr',
                  width: 4,
                  styles: _posStyles(element, align: PosAlign.right)),
            ]));
          }
          break;
        case 'total':
          bytes.addAll(generator.row([
            PosColumn(
                text: 'Totalt',
                width: 6,
                styles: _posStyles(element)), // size2 via element.size=14
            PosColumn(
                text: '${_safeValue(totals['total'])} kr',
                width: 6,
                styles: _posStyles(element, align: PosAlign.right)),
          ]));
          break;
        case 'paymentMethod':
          if (_safeValue(orderInfo['paymentMethod']).isNotEmpty)
            bytes.addAll(_posText(
                generator,
                '[ ${_safeValue(orderInfo['paymentMethod'])} ]',
                element));
          break;
        case 'thankYou':
          if ((element.content ?? '').trim().isNotEmpty)
            bytes.addAll(_posText(generator, element.content!, element));
          break;
        case 'footerMsg':
          if ((element.content ?? '').trim().isNotEmpty)
            bytes.addAll(_posText(generator, element.content!, element));
          break;
      }
    }

    bytes.addAll(generator.feed(2));
    bytes.addAll(generator.cut());
    return bytes;
  }

  /// Konverterar dynamic → num oavsett om värdet är num eller String.
  static num? _toNum(dynamic value) {
    if (value is num) return value;
    if (value is String) return num.tryParse(value);
    return null;
  }

  static pw.Widget _pdfText(
      String text, pw.TextStyle style, pw.TextAlign align, bool uppercase) {
    return pw.Text(_normalizeText(text, uppercase: uppercase),
        style: style, textAlign: align);
  }

  static pw.Widget _pdfRow(String left, String right, pw.TextStyle style) {
    return pw.Row(
      mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
      children: [
        pw.Expanded(child: pw.Text(left, style: style)),
        pw.Text(right, style: style),
      ],
    );
  }

  static pw.TextAlign _pdfAlign(String align) {
    switch (align) {
      case 'center':
        return pw.TextAlign.center;
      case 'right':
        return pw.TextAlign.right;
      default:
        return pw.TextAlign.left;
    }
  }

  static List<int> _posText(
      Generator generator, String text, ReceiptTemplateElement element) {
    return generator.text(
      _latinize(_normalizeText(text, uppercase: element.uppercase)),
      styles: _posStyles(element),
    );
  }

  static PosStyles _posStyles(ReceiptTemplateElement element,
      {PosAlign? align}) {
    return PosStyles(
      align: align ?? _posAlign(element.align),
      bold: element.weight != 'normal',
      height: element.size >= 12 ? PosTextSize.size2 : PosTextSize.size1,
      width: element.size >= 12 ? PosTextSize.size2 : PosTextSize.size1,
    );
  }

  static PosAlign _posAlign(String align) {
    switch (align) {
      case 'center':
        return PosAlign.center;
      case 'right':
        return PosAlign.right;
      default:
        return PosAlign.left;
    }
  }

  static Map<String, dynamic> _fallbackReceiptData(
      OrderModel? order, ReceiptTemplateSettings template) {
    final activeOrder = order;
    final now = DateTime.now();
    final date = '${_twoDigits(now.day)}/${_twoDigits(now.month)}/${now.year}';
    final time = '${_twoDigits(now.hour)}:${_twoDigits(now.minute)}';

    return {
      'header': {
        'restaurantName': 'Delivera Business',
        'address': '',
        'city': '',
        'zip': '',
        'phone': '',
      },
      'orderInfo': {
        'number': activeOrder?.orderNumber ?? '0000',
        'type': activeOrder?.type ?? 'PICKUP',
        'status': activeOrder?.status ?? 'PENDING',
        'date': date,
        'time': time,
        'paymentMethod': activeOrder?.paymentMethod ?? 'ONLINE',
        'isPreorder': activeOrder?.scheduledFor != null,
        'scheduledDate': activeOrder?.scheduledFor != null
            ? _scheduledDate(activeOrder!.scheduledFor!)
            : null,
        'scheduledTime': activeOrder?.scheduledFor != null
            ? _scheduledTime(activeOrder!.scheduledFor!)
            : null,
      },
      'customer': {
        'name': activeOrder?.customerName ?? '',
        'phone': activeOrder?.customerPhone ?? '',
        'street': activeOrder?.deliveryStreet ?? '',
        'city': activeOrder?.deliveryCity ?? '',
        'zip': activeOrder?.deliveryZip ?? '',
        'instructions': activeOrder?.deliveryInstructions ?? '',
        'note': activeOrder?.note ?? '',
        'allergens': activeOrder?.allergens ?? '',
      },
      'items': (activeOrder?.items ?? [])
          .map((item) => {
                'name': item.productName,
                'qty': item.quantity,
                'subtotal': item.subtotal.toStringAsFixed(0),
                'extras': item.selectedExtras
                    .map((extra) => {
                          'name': (extra['name'] ?? '').toString(),
                          'price': (extra['price'] as num?)?.toDouble() ?? 0.0,
                          'required': extra['required'],
                        })
                    .toList(),
                'note': item.note ?? '',
              })
          .toList(),
      'totals': {
        'deliveryFee': activeOrder?.deliveryFee.toStringAsFixed(0) ?? '0',
        'discount': activeOrder?.discountAmount.toStringAsFixed(0) ?? '0',
        'discountCode': activeOrder?.discountCode ?? '',
        'total': activeOrder?.total.toStringAsFixed(0) ?? '0',
      },
      'template': template.toJson(),
    };
  }

  static OrderModel _buildTestOrder() {
    final now = DateTime.now();
    return OrderModel(
      id: 'test_print',
      orderNumber: 'TEST-01',
      status: 'PENDING',
      type: 'DELIVERY',
      customerName: 'Delivera Testkvitto',
      customerPhone: '070-000 00 00',
      total: 219,
      deliveryFee: 29,
      createdAt: now,
      deliveryStreet: 'Kungsgatan 1',
      deliveryCity: 'Stockholm',
      deliveryZip: '111 43',
      deliveryInstructions: 'Ring pa dorren',
      note: 'Extra tydligt test sa ni ser pappersbredd och layout.',
      paymentMethod: 'Kort',
      discountCode: 'TEST',
      discountAmount: 10,
      items: [
        OrderItemModel(
          productName: 'Signature Burger',
          quantity: 2,
          subtotal: 180,
          basePrice: 90,
          selectedExtras: [
            {'name': 'Pommes', 'price': 0.0},
            {'name': 'Vitlöksdipp', 'price': 0.0},
            {'name': 'Extra ost', 'price': 15.0},
          ],
          note: 'Utan lok',
        ),
      ],
    );
  }
}
