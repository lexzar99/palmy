import 'package:flutter/foundation.dart';
import 'package:print_bluetooth_thermal/print_bluetooth_thermal.dart';

class BluetoothPrinterDevice {
  final String name;
  final String address;

  const BluetoothPrinterDevice({required this.name, required this.address});
}

/// Resultat från [BluetoothPrinterService.printBytes]. Tidigare returnerade
/// vi bara `bool` — vilket dolde "kopia 1 OK, kopia 2 fail"-fallet (B5-bug
/// från A9 Ivar): writeBytes returnerade false efter att första kopian redan
/// tryckts, personalen trodde 0 var ute, tryckte igen → dubbelutskrifter.
/// Nu kommunicerar vi exakt antal lyckade kopior så UI kan visa "1 av 2"
/// istället för bara "misslyckad".
class BluetoothPrintResult {
  final int successCopies;
  final int totalCopies;
  final String? error;

  const BluetoothPrintResult({
    required this.successCopies,
    required this.totalCopies,
    this.error,
  });

  bool get isFullSuccess => successCopies > 0 && successCopies == totalCopies;
  bool get isPartial => successCopies > 0 && successCopies < totalCopies;
  bool get isFullFailure => successCopies == 0;
}

class BluetoothPrinterService {
  static bool get supported => true;

  static Future<String?> availabilityIssue() async {
    try {
      final hasPermission =
          await PrintBluetoothThermal.isPermissionBluetoothGranted;
      if (!hasPermission) {
        return 'Bluetooth-behörighet saknas. Tillåt appen i systeminställningarna.';
      }

      final enabled = await PrintBluetoothThermal.bluetoothEnabled;
      if (!enabled) {
        return 'Bluetooth är avstängt. Slå på Bluetooth och försök igen.';
      }

      return null;
    } catch (error) {
      debugPrint('Bluetooth availability check failed: $error');
      return 'Bluetooth kunde inte initieras på den här enheten.';
    }
  }

  static Future<List<BluetoothPrinterDevice>> discoverPrinters() async {
    final issue = await availabilityIssue();
    if (issue != null) return const [];

    try {
      final devices = await PrintBluetoothThermal.pairedBluetooths;
      return devices
          .map(
            (device) => BluetoothPrinterDevice(
              name: device.name,
              address: device.macAdress,
            ),
          )
          .where((device) => device.address.trim().isNotEmpty)
          .toList();
    } catch (error) {
      debugPrint('Bluetooth discovery failed: $error');
      return const [];
    }
  }

  /// Skickar `copies` antal kopior av `bytes` (en kopia per iteration) till
  /// skrivaren. Returnerar antal lyckade kopior + ev fel. Tidigare körde vi
  /// allt i ett writeBytes-anrop — om socket dog efter kopia 1 var skriven men
  /// innan kopia 2 hann ut, fick personalen "misslyckad" och tryckte igen.
  static Future<BluetoothPrintResult> printBytes({
    required String address,
    required List<int> bytes,
    int copies = 1,
  }) async {
    final totalCopies = copies < 1 ? 1 : copies;
    final issue = await availabilityIssue();
    if (issue != null) {
      return BluetoothPrintResult(
        successCopies: 0,
        totalCopies: totalCopies,
        error: issue,
      );
    }

    try {
      final wasConnected = await PrintBluetoothThermal.connectionStatus;
      if (wasConnected) {
        await PrintBluetoothThermal.disconnect;
      }
      final connected =
          await PrintBluetoothThermal.connect(macPrinterAddress: address);
      if (!connected) {
        return BluetoothPrintResult(
          successCopies: 0,
          totalCopies: totalCopies,
          error: 'Kunde inte ansluta till skrivaren',
        );
      }

      var successCopies = 0;
      String? lastError;
      for (var i = 0; i < totalCopies; i++) {
        try {
          // Verifiera att vi fortfarande är anslutna innan nästa kopia.
          // Bluetooth-socketen kan tappa kontakt mellan kopior — speciellt
          // när skrivaren bearbetar långa utskrifter och tar paus.
          if (i > 0) {
            final stillConnected =
                await PrintBluetoothThermal.connectionStatus;
            if (!stillConnected) {
              final reconnected = await PrintBluetoothThermal.connect(
                  macPrinterAddress: address);
              if (!reconnected) {
                lastError =
                    'Tappade kontakt efter kopia $successCopies — försök igen';
                break;
              }
            }
          }
          final didPrint = await PrintBluetoothThermal.writeBytes(bytes);
          if (didPrint) {
            successCopies += 1;
          } else {
            lastError =
                'Skrivaren accepterade inte data för kopia ${i + 1}';
            break;
          }
        } catch (loopErr) {
          lastError = 'Avbruten vid kopia ${i + 1}: $loopErr';
          break;
        }
      }
      try {
        await PrintBluetoothThermal.disconnect;
      } catch (_) {}
      return BluetoothPrintResult(
        successCopies: successCopies,
        totalCopies: totalCopies,
        error: lastError,
      );
    } catch (error) {
      debugPrint('Bluetooth print failed: $error');
      return BluetoothPrintResult(
        successCopies: 0,
        totalCopies: totalCopies,
        error: error.toString(),
      );
    }
  }

  static Future<bool> disconnect() async {
    try {
      return await PrintBluetoothThermal.disconnect;
    } catch (_) {
      return false;
    }
  }
}
