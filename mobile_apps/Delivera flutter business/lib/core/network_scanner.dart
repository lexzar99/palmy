import 'package:network_info_plus/network_info_plus.dart';
import 'package:ping_discover_network_forked/ping_discover_network_forked.dart';

class NetworkScanner {
  static Future<List<String>> discoverPrinters() async {
    final info = NetworkInfo();
    final wifiIP = await info.getWifiIP();
    if (wifiIP == null) return [];

    final String subnet = wifiIP.substring(0, wifiIP.lastIndexOf('.'));
    final stream = NetworkAnalyzer.discover2(subnet, 9100,
        timeout: Duration(milliseconds: 2000));

    List<String> printers = [];
    await for (final addr in stream) {
      if (addr.exists) {
        printers.add(addr.ip);
      }
    }
    return printers;
  }
}
