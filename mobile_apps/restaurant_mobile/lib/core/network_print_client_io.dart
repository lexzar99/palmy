import 'dart:io';

class NetworkPrintClient {
  static Future<bool> sendBytes({
    required String host,
    required int port,
    required List<int> bytes,
    required int copies,
  }) async {
    for (var index = 0; index < copies; index += 1) {
      final socket = await Socket.connect(
        host,
        port,
        timeout: const Duration(seconds: 5),
      );
      socket.add(bytes);
      await socket.flush();
      await socket.close();
    }

    return true;
  }
}
