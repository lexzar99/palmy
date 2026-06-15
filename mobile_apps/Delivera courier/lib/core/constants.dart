/// App-wide konstanter för Delivera Courier.
class Constants {
  /// Backend-bas-URL. Samma API som webb-kuriren (`apps/courier`).
  /// Kan överskridas vid bygg med --dart-define=API_URL=...
  static const String baseUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'https://api.delivera.se',
  );

  /// Secure-storage-nyckel för JWT (60 dagars token från /api/courier/login).
  static const String tokenKey = 'delivera_courier_token';

  /// SharedPreferences-flagga: var kuriren online när appen stängdes
  /// (för att kunna återuppta delning/heartbeat).
  static const String onlineFlagKey = 'delivera_courier_online';

  /// SharedPreferences-flagga: onboarding visad.
  static const String onboardingSeenKey = 'delivera_courier_onboarding_seen';

  /// Max antal samtidiga aktiva leveranser (matchar backend MAX_ACTIVE).
  static const int maxActive = 3;

  /// Polling-intervall för tillgängliga uppdrag. 10s = snabbare fallback för
  /// in-app "klar för hämtning"-bannern; FCM-pushen är den primära (omedelbara).
  static const Duration jobsPollInterval = Duration(seconds: 10);

  /// GPS-heartbeat-intervall när kuriren är online.
  static const Duration locationHeartbeat = Duration(seconds: 10);
}
