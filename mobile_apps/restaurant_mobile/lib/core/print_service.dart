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

/// Event som publiceras när ett auto-print misslyckas. UI:t (DashboardScreen)
/// lyssnar på [PrintService.errors] och visar en SnackBar.
class PrintFailure {
  final String orderNumber;
  final String reason;
  PrintFailure({required this.orderNumber, required this.reason});
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

  static String _normalizeText(String value, {required bool uppercase}) {
    final normalized = value.trim();
    return uppercase ? normalized.toUpperCase() : normalized;
  }

  /// Returnerar null vid succé eller skip, annars en kort felbeskrivning.
  /// Vid auto-print skickas dessutom felet till [errors]-streamen så UI:t
  /// kan visa toast.
  static Future<String?> printReceipt(OrderModel order,
      {bool respectAutoPrint = false}) async {
    PrintingConfig? config;
    try {
      config = await _printingConfigService.fetchConfig();
    } catch (e) {
      logger.log('PRINT: kunde inte hämta config: $e');
    }
    final printer = config?.defaultPrinter ??
        await _printingConfigService.loadLocalPrinter();

    if (respectAutoPrint && !(printer?.autoPrint ?? false)) {
      return null; // auto-print avstängd → tyst skip
    }

    if (printer == null) {
      const reason = 'Ingen skrivare konfigurerad';
      _emitFailure(order, reason, isAuto: respectAutoPrint);
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
        allowPdfFallback: !respectAutoPrint,
        printJobName: 'Order_${order.orderNumber}',
      );

      if (issue != null) {
        logger.log('PRINT FAIL #${order.orderNumber}: $issue');
        _emitFailure(order, issue, isAuto: respectAutoPrint);
        return issue;
      }
      return null;
    } catch (e) {
      final reason = _humanizeError(e);
      logger.log('PRINT EXCEPTION #${order.orderNumber}: $e');
      _emitFailure(order, reason, isAuto: respectAutoPrint);
      return reason;
    }
  }

  static void _emitFailure(OrderModel order, String reason,
      {required bool isAuto}) {
    if (!isAuto) return; // manuella prints har redan UI-feedback via knapp
    if (_errorController.isClosed) return;
    _errorController.add(
      PrintFailure(orderNumber: order.orderNumber, reason: reason),
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

    return _dispatchPrint(
      order: sampleOrder,
      receiptData: _fallbackReceiptData(sampleOrder, template),
      template: template,
      printer: effectivePrinter,
      allowPdfFallback:
          effectivePrinter == null || effectivePrinter.paperWidth == 'A4',
      printJobName: 'MatGo_Testkvitto',
    );
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
      if (_isBluetoothPrinter(printer)) {
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
      } else if (_looksLikeNetworkPrinter(address)) {
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
      final oneCopy = await _buildBitmapBytes(generator, receiptData, template, paperWidth);
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
      final oneCopy = await _buildBitmapBytes(generator, receiptData, template, paperWidth);
      final allBytes = <int>[
        for (var i = 0; i < copies; i++) ...oneCopy,
      ];
      final printed = await BluetoothPrinterService.printBytes(
        address: address,
        bytes: allBytes,
      );
      if (!printed) {
        return 'Bluetooth-skrivaren ($address) svarade inte. '
            'Kontrollera att skrivaren är påslagen och parad i Android Bluetooth-inställningarna.';
      }
      return null;
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
          // Utlovad ETA i minuter (kommer från order.estimatedTime, dynamiskt
          // räknat från restaurangens senaste 20 ordrarnas snitt). Visas inte
          // för förbeställningar — de har redan scheduledFor som tydlig tid.
          if (orderInfo['isPreorder'] != true &&
              orderInfo['estimatedTime'] != null) {
            widget = _pdfText(
                'Utlovad tid: ${orderInfo['estimatedTime']} min',
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
          if (_safeValue(customer['instructions']).isNotEmpty)
            widget = _pdfText(
                'Instruktion: ${_safeValue(customer['instructions'])}',
                style,
                align,
                element.uppercase);
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
                  localWidgets.add(
                    pw.Padding(
                      padding: const pw.EdgeInsets.only(left: 10, top: 2),
                      child: pw.Text('+ ${_safeValue(extra['name'])}',
                          style: pw.TextStyle(
                              font: regularFont,
                              fontSize: element.size.toDouble() - 1)),
                    ),
                  );
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

  /// Renders the receipt to a bitmap and wraps it in ESC/POS image commands.
  /// This produces a WYSIWYG printout matching the admin preview exactly.
  static Future<List<int>> _buildBitmapBytes(
    Generator generator,
    Map<String, dynamic>? receiptData,
    ReceiptTemplateSettings template,
    String paperWidth,
  ) async {
    // 203 DPI: 58mm → 384 dots, 72/80mm → 576 dots
    final int widthPx = paperWidth == '58mm' ? 384 : 576;

    // Measure pass (canvas = null)
    final m = _RP(width: widthPx.toDouble(), margin: 28);
    _drawReceiptBitmap(m, receiptData, template);
    final int heightPx = (m.y + 60).ceil();

    // Draw pass
    final recorder = ui.PictureRecorder();
    final canvas = ui.Canvas(recorder);
    canvas.drawRect(
      Rect.fromLTWH(0, 0, widthPx.toDouble(), heightPx.toDouble()),
      Paint()..color = const Color(0xFFFFFFFF),
    );
    final d = _RP(canvas: canvas, width: widthPx.toDouble(), margin: 28);
    _drawReceiptBitmap(d, receiptData, template);

    final picture = recorder.endRecording();
    final uiImg = await picture.toImage(widthPx, heightPx);
    final byteData = await uiImg.toByteData(format: ui.ImageByteFormat.rawRgba);
    if (byteData == null) throw Exception('Bitmap render: toByteData returned null');

    final bitmapImg = img.Image.fromBytes(
      width: widthPx,
      height: heightPx,
      bytes: byteData.buffer,
      numChannels: 4,
      order: img.ChannelOrder.rgba,
    );

    return <int>[
      ...generator.imageRaster(bitmapImg,
          align: PosAlign.center,
          highDensityHorizontal: true,
          highDensityVertical: true),
      ...generator.feed(2),
      ...generator.cut(),
    ];
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

    const grey = Color(0xFF666666);
    const red = Color(0xFFCC0000);
    final isDelivery = _safeValue(o['type']) == 'DELIVERY';

    // Platform + order number
    p.text('${template.platformName} #${_safeValue(o['number'])}',
        size: 22, w: FontWeight.bold, align: TextAlign.center);
    p.text('Ej kvitto', size: 20, align: TextAlign.center, color: grey);
    p.hr();

    // Restaurant header
    final rName = _safeValue(h['restaurantName']);
    if (rName.isNotEmpty) {
      p.text(rName.toUpperCase(), size: 44, w: FontWeight.w900, align: TextAlign.center);
    }
    p.text('${_safeValue(o['date'])} ${_safeValue(o['time'])}',
        size: 24, w: FontWeight.bold, align: TextAlign.center);
    final rAddr = [
      _safeValue(h['address']),
      [h['zip'], h['city']].where((v) => _safeValue(v).isNotEmpty).join(' '),
    ].where((v) => v.isNotEmpty).join(', ');
    if (rAddr.isNotEmpty) p.text(rAddr, size: 22, align: TextAlign.center);
    if (_safeValue(h['phone']).isNotEmpty) {
      p.text('Tel: ${_safeValue(h['phone'])}', size: 22, align: TextAlign.center);
    }
    p.hr();

    // Customer
    if (_safeValue(c['name']).isNotEmpty) {
      p.text('Kund:', size: 22, color: grey);
      p.text(_safeValue(c['name']), size: 34, w: FontWeight.w900);
    }
    if (_safeValue(c['phone']).isNotEmpty) {
      p.text(_safeValue(c['phone']), size: 24, w: FontWeight.bold);
    }
    final cAddr = [
      _safeValue(c['street']),
      [c['zip'], c['city']].where((v) => _safeValue(v).isNotEmpty).join(' '),
    ].where((v) => v.isNotEmpty).join(', ');
    if (cAddr.isNotEmpty) {
      p.space(8);
      p.text('Adress:', size: 22, color: grey);
      p.text(cAddr, size: 24, w: FontWeight.w900);
    }
    if (_safeValue(c['instructions']).isNotEmpty) {
      p.text(_safeValue(c['instructions']), size: 22);
    }
    if (_safeValue(c['note']).isNotEmpty) {
      p.text(_safeValue(c['note']), size: 22, w: FontWeight.w900);
    }
    final allergensRaw = c['allergens'];
    final allergensStr = allergensRaw is List
        ? (allergensRaw as List).map((e) => _safeValue(e)).where((e) => e.isNotEmpty).join(', ')
        : _safeValue(allergensRaw);
    if (allergensStr.isNotEmpty) {
      p.text('! $allergensStr', size: 22, w: FontWeight.w900, color: red);
    }
    p.space(12);

    // Status badges
    p.badge(isDelivery ? 'Utkörning' : 'Avhämtning');
    if (o['isPreorder'] == true) {
      p.badge('Förbeställd ${_safeValue(o['scheduledDate'])} ${_safeValue(o['scheduledTime'])}');
    }
    if (_safeValue(o['paymentMethod']).isNotEmpty) {
      p.badge(_safeValue(o['paymentMethod']));
    }

    // Delivery time (very large)
    if (o['isPreorder'] != true && o['estimatedTime'] != null) {
      p.space(8);
      p.text('Leveranstid', size: 24, align: TextAlign.center);
      p.text('${o['estimatedTime']} min', size: 64, w: FontWeight.w900, align: TextAlign.center);
    }

    // Item count
    p.text(
      '${items.length} artikel${items.length > 1 ? 'ar' : ''}',
      size: 22, align: TextAlign.center, color: grey,
    );
    p.hr();

    // Items
    for (final item in items) {
      p.row(
        '${item['qty']} x ${_normalizeText(_safeValue(item['name']), uppercase: false)}',
        '${_safeValue(item['subtotal'])} kr',
        size: 28,
      );
      final extras = item['extras'];
      if (extras is List) {
        for (final extra in extras) {
          final en = extra is Map ? _safeValue(extra['name']) : _safeValue(extra);
          if (en.isNotEmpty) p.text('** $en', size: 22, color: grey);
        }
      }
      if (_safeValue(item['note']).isNotEmpty) {
        p.text('! ${_safeValue(item['note'])}', size: 22, w: FontWeight.bold);
      }
      p.space(6);
    }
    p.hr();

    // Totals
    if ((_toNum(t['deliveryFee']) ?? 0) > 0) {
      p.row('Leveransavgift', '${_safeValue(t['deliveryFee'])} kr', size: 24);
    }
    if ((_toNum(t['discount']) ?? 0) > 0) {
      final code = _safeValue(t['discountCode']);
      p.row(
        code.isNotEmpty ? 'Rabatt ($code)' : 'Rabatt',
        '-${_safeValue(t['discount'])} kr',
        size: 24,
      );
    }
    p.hr(thickness: 3);
    p.row('Totalt', '${_safeValue(t['total'])} kr', size: 44, w: FontWeight.w900);
    p.hr();

    // Footer
    p.space(6);
    p.text('Tack för din beställning!', size: 22, w: FontWeight.bold, align: TextAlign.center);
    p.text('Välkommen åter!', size: 20, align: TextAlign.center, color: grey);
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
            bytes.addAll(generator.text('Leveranstid',
                styles: const PosStyles(align: PosAlign.center)));
            bytes.addAll(_posText(
                generator,
                '${orderInfo['estimatedTime']} min',
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
          if (_safeValue(customer['instructions']).isNotEmpty)
            bytes.addAll(_posText(
                generator, _safeValue(customer['instructions']), element));
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
                bytes.addAll(generator.text('** ${_safeValue(extra['name'])}',
                    styles: const PosStyles(align: PosAlign.left)));
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
      _normalizeText(text, uppercase: element.uppercase),
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
        'restaurantName': 'MatGo Business',
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
                    .map((extra) => {'name': extra.toString()})
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
      customerName: 'MatGo Testkvitto',
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
          selectedExtras: ['Pommes', 'Vitloksdipp'],
          note: 'Utan lok',
        ),
      ],
    );
  }
}
