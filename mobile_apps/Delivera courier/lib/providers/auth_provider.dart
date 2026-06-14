import 'package:flutter/foundation.dart';

import '../core/api_client.dart';
import '../core/models_api.dart';
import '../models/models.dart';

enum AuthStatus { booting, loggedOut, loggedIn }

/// Auth: e-post + lösenord → JWT (60 dagar). Konton skapas av admin; kuriren
/// kan inte registrera sig själv. Token lagras krypterat via [ApiClient].
class AuthProvider with ChangeNotifier {
  AuthProvider(this._api, this._client);

  final CourierApi _api;
  final ApiClient _client;

  AuthStatus _status = AuthStatus.booting;
  CourierProfile? _courier;
  String? _error;

  /// Anropas synkront vid utloggning (manuell ELLER påtvingad 401) så att
  /// SessionProvider kan riva ner polling/GPS direkt — inte beroende av att
  /// MainShell hinner disposas (vilket AnimatedSwitcher fördröjer ~360ms).
  void Function()? onLoggedOut;

  AuthStatus get status => _status;
  CourierProfile? get courier => _courier;
  String? get error => _error;
  bool get isAuthenticated => _status == AuthStatus.loggedIn;

  /// Vid app-start: läs lagrad token och validera mot /me.
  Future<void> bootstrap() async {
    _client.onUnauthorized = _onUnauthorized;
    await _client.bootstrap();
    if (!_client.hasToken) {
      _set(AuthStatus.loggedOut);
      return;
    }
    try {
      _courier = await _api.me();
      _set(AuthStatus.loggedIn);
    } catch (_) {
      // Ogiltig/utgången token → tillbaka till login.
      await _client.clearToken();
      _set(AuthStatus.loggedOut);
    }
  }

  Future<bool> login(String email, String password) async {
    _error = null;
    notifyListeners();
    try {
      final res = await _api.login(email, password);
      await _client.setToken(res.token);
      _courier = res.courier;
      _set(AuthStatus.loggedIn);
      return true;
    } catch (e) {
      _error = ApiClient.messageFor(e);
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    onLoggedOut?.call(); // riv ner sessionen direkt (polling/GPS/listor)
    await _client.clearToken();
    _courier = null;
    _set(AuthStatus.loggedOut);
  }

  void _onUnauthorized() {
    // Token återkallad av admin (tokenVersion-bump) eller utgången.
    if (_status == AuthStatus.loggedIn) {
      onLoggedOut?.call(); // stäng polling/GPS-fönstret omedelbart
      _client.clearToken();
      _courier = null;
      _set(AuthStatus.loggedOut);
    }
  }

  void _set(AuthStatus s) {
    _status = s;
    notifyListeners();
  }
}
