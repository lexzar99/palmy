import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'constants.dart';

/// Tunn Dio-wrapper med Bearer-token-interceptor och central 401-hantering.
/// Token lagras krypterat (Keychain på iOS, Keystore på Android).
class ApiClient {
  ApiClient._();
  static final ApiClient instance = ApiClient._();

  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  );

  /// Anropas när servern svarar 401 (token utgången/återkallad av admin).
  void Function()? onUnauthorized;

  String? _token;
  String? get token => _token;
  bool get hasToken => _token != null && _token!.isNotEmpty;

  late final Dio _dio = Dio(
    BaseOptions(
      baseUrl: Constants.baseUrl,
      connectTimeout: const Duration(seconds: 12),
      receiveTimeout: const Duration(seconds: 20),
      sendTimeout: const Duration(seconds: 20),
      headers: {'Content-Type': 'application/json'},
    ),
  )..interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (hasToken) {
            options.headers['Authorization'] = 'Bearer $_token';
          }
          handler.next(options);
        },
        onError: (e, handler) {
          if (e.response?.statusCode == 401) {
            onUnauthorized?.call();
          }
          handler.next(e);
        },
      ),
    );

  /// Läs in lagrad token vid app-start.
  Future<void> bootstrap() async {
    _token = await _storage.read(key: Constants.tokenKey);
  }

  Future<void> setToken(String token) async {
    _token = token;
    await _storage.write(key: Constants.tokenKey, value: token);
  }

  Future<void> clearToken() async {
    _token = null;
    await _storage.delete(key: Constants.tokenKey);
  }

  Future<Response<T>> get<T>(String path) => _dio.get<T>(path);

  Future<Response<T>> post<T>(String path, {Object? data}) =>
      _dio.post<T>(path, data: data);

  /// Översätt Dio-fel till svenska, läsbara meddelanden.
  static String messageFor(Object error) {
    if (error is DioException) {
      final code = error.response?.statusCode;
      if (code == 401) return 'Sessionen har gått ut. Logga in igen.';
      if (code == 403) return 'Du saknar behörighet för detta.';
      if (code == 404) return 'Hittades inte längre.';
      if (code == 409) return 'Uppdraget är inte längre tillgängligt.';
      if (code != null && code >= 500) {
        return 'Serverfel. Försök igen om en stund.';
      }
      switch (error.type) {
        case DioExceptionType.connectionTimeout:
        case DioExceptionType.receiveTimeout:
        case DioExceptionType.sendTimeout:
          return 'Tidsgräns nådd. Kontrollera din uppkoppling.';
        case DioExceptionType.connectionError:
          return 'Ingen anslutning. Kontrollera internet.';
        default:
          final data = error.response?.data;
          if (data is Map && data['error'] is String) {
            return data['error'] as String;
          }
          return 'Något gick fel. Försök igen.';
      }
    }
    return 'Något gick fel. Försök igen.';
  }
}
