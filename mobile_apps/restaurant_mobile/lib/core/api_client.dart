import 'package:dio/dio.dart';
import 'constants.dart';
import 'secure_token_store.dart';

class ApiClient {
  late Dio dio;

  // Set this once at app startup (e.g. from AuthProvider) to auto-logout on 401
  static void Function()? onUnauthorized;

  ApiClient() {
    dio = Dio(BaseOptions(
      baseUrl: AppConstants.baseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
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
      onError: (e, handler) {
        if (e.response?.statusCode == 401) {
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
