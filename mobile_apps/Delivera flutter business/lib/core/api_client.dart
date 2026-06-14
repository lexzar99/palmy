import 'package:dio/dio.dart';
import 'constants.dart';
import 'secure_token_store.dart';

class ApiClient {
  late Dio dio;

  // Set this once at app startup (e.g. from AuthProvider) to auto-logout on 401
  static void Function()? onUnauthorized;

  // Sätts av AuthProvider. Anropas vid 401 för att hämta en ny access-token
  // (device-session-refresh). Returnerar true om en ny token hämtades → då
  // retrias den misslyckade requesten automatiskt en gång.
  static Future<bool> Function()? onRefreshToken;

  ApiClient() {
    dio = Dio(BaseOptions(
      baseUrl: AppConstants.baseUrl,
      connectTimeout: const Duration(seconds: 30),
      receiveTimeout: const Duration(seconds: 60),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    ));

    // Add interceptor for auth token
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await SecureTokenStore.readToken();
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        return handler.next(options);
      },
      onError: (e, handler) async {
        final isAuthErr = e.response?.statusCode == 401;
        final alreadyRetried = e.requestOptions.extra['__retried'] == true;
        // Terminal-endpoints (/pair, /session) auth:as via device-id, inte
        // access-token — försök aldrig refresh:a dem (skulle ge en loop).
        final isTerminalPath =
            e.requestOptions.path.contains('/api/terminal/');
        if (isAuthErr && !alreadyRetried && !isTerminalPath && onRefreshToken != null) {
          bool refreshed = false;
          try {
            refreshed = await onRefreshToken!();
          } catch (_) {}
          if (refreshed) {
            final newToken = await SecureTokenStore.readToken();
            final opts = e.requestOptions;
            opts.extra['__retried'] = true;
            if (newToken != null) {
              opts.headers['Authorization'] = 'Bearer $newToken';
            }
            try {
              final clone = await dio.fetch(opts);
              return handler.resolve(clone);
            } catch (err) {
              return handler.next(err is DioException ? err : e);
            }
          }
        }
        if (isAuthErr) {
          onUnauthorized?.call();
        }
        return handler.next(e);
      },
    ));
  }

  Future<Response> post(String path, dynamic data) =>
      dio.post(path, data: data);
  Future<Response> get(String path, {Map<String, dynamic>? queryParameters}) =>
      dio.get(path, queryParameters: queryParameters);
  Future<Response> patch(String path, dynamic data) =>
      dio.patch(path, data: data);
}
