import 'package:flutter/foundation.dart';
import 'package:print_bluetooth_thermal/print_bluetooth_thermal.dart';

class BluetoothPrinterDevice {
  final String name;
  final String address;

  const BluetoothPrinterDevice({required this.name, required this.address});
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

  static Future<bool> printBytes({
    required String address,
    required List<int> bytes,
  }) async {
    final issue = await availabilityIssue();
    if (issue != null) return false;

    try {
      final wasConnected = await PrintBluetoothThermal.connectionStatus;
      if (wasConnected) {
        await PrintBluetoothThermal.disconnect;
      }

      final connected =
          await PrintBluetoothThermal.connect(macPrinterAddress: address);
      if (!connected) return false;

      final didPrint = await PrintBluetoothThermal.writeBytes(bytes);
      await PrintBluetoothThermal.disconnect;
      return didPrint;
    } catch (error) {
      debugPrint('Bluetooth print failed: $error');
      return false;
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
