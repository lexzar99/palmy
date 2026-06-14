import 'dart:io';

class NetworkPrintClient {
  static Future<void> sendBytes({
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
      try {
        await socket.flush();
      } finally {
        // destroy() stänger omedelbart – en del skrivare stänger
        // förbindelsen från sin sida direkt efter att de fått data,
        // vilket annars kastar SocketException på close().
        socket.destroy();
      }
    }
  }
}
