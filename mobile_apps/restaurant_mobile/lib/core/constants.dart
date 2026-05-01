class AppConstants {
  static const String baseUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'https://palmy-production-2021.up.railway.app',
  );
  static const String socketUrl = String.fromEnvironment(
    'SOCKET_URL',
    defaultValue: 'https://palmy-production-2021.up.railway.app',
  );

  // Local storage keys
  static const String tokenKey = 'matgo_token';
  static const String adminKey = 'matgo_admin';

  // App settings
  static const String appTitle = 'MatGo Business';
}
