import 'dart:typed_data';

import 'package:flutter/services.dart';
// Dölj imin_printer:s egen `logger` så den inte krockar med appens log_service.
import 'package:imin_printer/imin_printer.dart' hide logger;

import 'log_service.dart';

/// Tunn wrapper runt iMin:s inbyggda skrivar-SDK (Swift 2 Pro m.fl.).
///
/// Ger TYST direktutskrift på den inbyggda termoskrivaren — ingen Android-
/// utskriftsdialog. På icke-iMin-enheter rapporterar [isAvailable] false så
/// anroparen kan falla tillbaka på Android-utskriftsramverket.
class IminPrinterService {
  IminPrinterService._();

  static final IminPrinter _printer = IminPrinter();
  static const MethodChannel _deviceChannel =
      MethodChannel('com.matgo.restaurant/device');

  // Cachas: true = bekräftad iMin + initierad. null = inte avgjort än.
  static bool? _available;
  static bool _initialized = false;

  /// True endast på iMin-enheter (Build.MANUFACTURER/BRAND innehåller "imin")
  /// där SDK:t dessutom initieras. Cachar bara ett positivt svar så ett
  /// tillfälligt fel kan omprövas vid nästa utskrift.
  static Future<bool> isAvailable() async {
    if (_available == true) return true;
    if (!await _isIminDevice()) return false;
    try {
      await _printer
          .initPrinter()
          .timeout(const Duration(seconds: 4), onTimeout: () => false);
      _available = true;
      _initialized = true;
      return true;
    } catch (e) {
      logger.log('IMIN: initPrinter misslyckades: $e');
      return false;
    }
  }

  static Future<bool> _isIminDevice() async {
    try {
      final manufacturer =
          (await _deviceChannel.invokeMethod<String>('getManufacturer')) ?? '';
      final brand =
          (await _deviceChannel.invokeMethod<String>('getBrand')) ?? '';
      final model =
          (await _deviceChannel.invokeMethod<String>('getModel')) ?? '';
      final isImin = manufacturer.toLowerCase().contains('imin') ||
          brand.toLowerCase().contains('imin');
      logger.log(
          'IMIN: enhet manufacturer="$manufacturer" brand="$brand" model="$model" → iMin=$isImin');
      return isImin;
    } catch (e) {
      logger.log('IMIN: enhetskoll misslyckades: $e');
      return false;
    }
  }

  static Future<void> _ensureInit() async {
    if (_initialized) return;
    await _printer.initPrinter();
    _initialized = true;
  }

  /// Skriver ut en redan PNG-kodad kvitto-bild på den inbyggda skrivaren och
  /// matar fram papperet för avrivning (Swift 2 Pro saknar kniv).
  /// Returnerar null vid succé, annars ett kort felmeddelande.
  static Future<String?> printReceiptImage(Uint8List pngBytes) async {
    try {
      await _ensureInit();
      await _printer.printSingleBitmap(pngBytes);
      await _printer.printAndFeedPaper(80);
      return null;
    } catch (e) {
      logger.log('IMIN: utskrift fel: $e');
      return 'iMin inbyggd skrivare: $e';
    }
  }
}
