class BluetoothPrinterDevice {
  final String name;
  final String address;

  const BluetoothPrinterDevice({required this.name, required this.address});
}

class BluetoothPrinterService {
  static bool get supported => false;

  static Future<String?> availabilityIssue() async {
    return 'Bluetooth-utskrift ar inte tillganglig pa denna plattform.';
  }

  static Future<List<BluetoothPrinterDevice>> discoverPrinters() async {
    return const [];
  }

  static Future<bool> printBytes({
    required String address,
    required List<int> bytes,
  }) async {
    return false;
  }

  static Future<bool> disconnect() async {
    return false;
  }
}
