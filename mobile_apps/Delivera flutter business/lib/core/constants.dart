/// Konfiguration via --dart-define
///
/// Standard = produktion (Railway). För staging eller lokal dev bygger man:
///
///   flutter build apk --release \
///     --dart-define=ENV=production
///
///   flutter run \
///     --dart-define=ENV=staging \
///     --dart-define=API_URL=https://palmy-staging.up.railway.app \
///     --dart-define=SOCKET_URL=https://palmy-staging.up.railway.app
///
/// Eller använd scripts/build_release.sh / scripts/run_dev.sh.
enum AppEnv { production, staging, development }

class AppConstants {
  static const String _envName = String.fromEnvironment(
    'ENV',
    defaultValue: 'production',
  );

  static AppEnv get env {
    switch (_envName.toLowerCase()) {
      case 'staging':
        return AppEnv.staging;
      case 'development':
      case 'dev':
      case 'local':
        return AppEnv.development;
      default:
        return AppEnv.production;
    }
  }

  static bool get isProduction => env == AppEnv.production;
  static bool get isStaging => env == AppEnv.staging;
  static bool get isDevelopment => env == AppEnv.development;

  /// Standard-URL beror på vilken miljö som är vald.
  static String get _defaultUrl {
    switch (env) {
      case AppEnv.development:
        return 'http://localhost:4000';
      case AppEnv.staging:
        return 'https://palmy-staging.up.railway.app';
      case AppEnv.production:
        return 'https://palmy-production-2021.up.railway.app';
    }
  }

  static const String _apiUrlOverride =
      String.fromEnvironment('API_URL', defaultValue: '');
  static const String _socketUrlOverride =
      String.fromEnvironment('SOCKET_URL', defaultValue: '');

  static String get baseUrl =>
      _apiUrlOverride.isNotEmpty ? _apiUrlOverride : _defaultUrl;
  static String get socketUrl =>
      _socketUrlOverride.isNotEmpty ? _socketUrlOverride : _defaultUrl;

  // Local storage keys
  static const String tokenKey = 'matgo_token';
  static const String adminKey = 'matgo_admin';
  static const String fcmTokenKey = 'matgo_fcm_token';

  // App settings
  static const String appTitle = 'Delivera Business';
}
