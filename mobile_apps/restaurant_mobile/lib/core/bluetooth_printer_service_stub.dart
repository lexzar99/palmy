class BluetoothPrinterDevice {
  final String name;
  final String address;

  const BluetoothPrinterDevice({required this.name, required this.address});
}

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
  static bool get supported => false;

  static Future<String?> availabilityIssue() async {
    return 'Bluetooth-utskrift ar inte tillganglig pa denna plattform.';
  }

  static Future<List<BluetoothPrinterDevice>> discoverPrinters() async {
    return const [];
  }

  static Future<BluetoothPrintResult> printBytes({
    required String address,
    required List<int> bytes,
    int copies = 1,
  }) async {
    return BluetoothPrintResult(
      successCopies: 0,
      totalCopies: copies < 1 ? 1 : copies,
      error: 'Bluetooth-utskrift ar inte tillganglig pa denna plattform.',
    );
  }

  static Future<bool> disconnect() async {
    return false;
  }
}
