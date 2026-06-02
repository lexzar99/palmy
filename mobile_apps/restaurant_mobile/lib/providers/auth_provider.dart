import 'dart:async';
import 'dart:convert';
import 'dart:io' show Platform;
import 'dart:math';
import 'package:dio/dio.dart';
import 'package:android_id/android_id.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/api_client.dart';
import '../core/constants.dart';
import '../core/foreground_service.dart';
import '../core/log_service.dart';
import '../core/push_service.dart';
import '../core/secure_token_store.dart';

/// Terminal-session-status. En platta paras EN gång och förblir inloggad;
/// bara super-admin (revoke i admin-panelen) loggar ut den.
enum TerminalStatus { booting, paired, needsPairing, revoked }

class AuthProvider with ChangeNotifier {
  final ApiClient _api = ApiClient();
  bool _isLoading = false;
  String? _error;
  Map<String, dynamic>? _user;
  String? _logoutCode;
  TerminalStatus _terminalStatus = TerminalStatus.booting;
  String? _deviceIdCache;

  bool get isLoading => _isLoading;
  String? get error => _error;
  Map<String, dynamic>? get user => _user;
  bool get isAuthenticated => _user != null;
  String? get logoutCode => _logoutCode;
  TerminalStatus get terminalStatus => _terminalStatus;

  Future<bool> login(String identifier, String password) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final res = await _api.post('/api/account/login', {
        'identifier': identifier,
        'password': password,
      });

      if (res.statusCode == 200) {
        final data = res.data;
        final prefs = await SharedPreferences.getInstance();

        await SecureTokenStore.writeToken(data['token']);
        await prefs.setString(AppConstants.adminKey, jsonEncode(data['admin']));

        _user = data['admin'];
        _logoutCode = data['admin']?['logoutCode'] as String?;
        logger.log('LOGIN SUCCESS: ${_user?['email'] ?? identifier}');
        _isLoading = false;
        notifyListeners();
        return true;
      }
      // Shouldn't normally happen because Dio throws on non-2xx, but keep a fallback.
      _error = 'Inloggning misslyckades (HTTP ${res.statusCode})';
    } on DioException catch (e) {
      final responseError = e.response?.data is Map
          ? (e.response?.data['error'] as String?)
          : null;
      if (responseError != null && responseError.trim().isNotEmpty) {
        _error = responseError;
      } else if (e.response?.statusCode != null) {
        _error = 'Inloggning misslyckades (HTTP ${e.response?.statusCode})';
      } else if (e.type == DioExceptionType.connectionTimeout ||
                 e.type == DioExceptionType.receiveTimeout ||
                 e.type == DioExceptionType.sendTimeout) {
        _error = 'Servern svarar inte – kontrollera din internetanslutning och försök igen.';
      } else if (e.type == DioExceptionType.connectionError) {
        _error = 'Kunde inte ansluta till servern – kontrollera internet.';
      } else if (e.type == DioExceptionType.badCertificate) {
        _error = 'SSL-certifikatfel. Kontrollera att datum/tid på mobilen är korrekt.';
      } else {
        _error = 'Inloggning misslyckades – kontrollera internetanslutningen.';
      }
    } catch (e) {
      _error = 'Ett oväntat fel uppstod';
      logger.log('LOGIN EXCEPTION: $e');
    }

    _isLoading = false;
    _error ??= 'Inloggning misslyckades';
    notifyListeners();
    return false;
  }

  // Lista med SharedPreferences-nycklar som hör till föregående inloggad
  // staff och INTE ska överleva en logout. Petra (A16) påvisade att
  // restaurang B:s personal kunde se restaurang A:s cachade ordrar,
  // printer-konfig och app-logs när de loggade in på samma device.
  static const List<String> _userScopedPrefKeys = [
    'printer_id',
    'printer_name',
    'printer_ip',
    'printer_paper_width',
    'printer_connection_type',
    'auto_print',
    'print_copies',
    'receipt_template_cache',
    'app_logs',
  ];

  Future<void> _clearUserScopedData(SharedPreferences prefs) async {
    // Cached orders har dynamiska nycklar (cached_orders_<restaurantId>),
    // så vi iterar över alla keys och rensar matchande prefix.
    final allKeys = prefs.getKeys();
    for (final key in allKeys) {
      if (key.startsWith('cached_orders_')) {
        await prefs.remove(key);
      }
    }
    for (final key in _userScopedPrefKeys) {
      await prefs.remove(key);
    }
  }

  Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await PushService.unregister();
    await AppForegroundService.stop();
    await SecureTokenStore.deleteToken();
    await prefs.remove(AppConstants.adminKey);
    await _clearUserScopedData(prefs);
    logger.log('LOGOUT: ${_user?['email']}');
    _user = null;
    _logoutCode = null;
    notifyListeners();
  }

  Future<void> tryAutoLogin() async {
    // Engångsmigrering från gammal plaintext-lagring → Keystore
    await SecureTokenStore.migrateFromPrefs();

    final prefs = await SharedPreferences.getInstance();
    final token = await SecureTokenStore.readToken();
    final adminStr = prefs.getString(AppConstants.adminKey);

    if (token == null || adminStr == null) {
      return;
    }

    // Återställ från cache direkt så appen startar snabbt (iOS watchdog).
    // Token-validering sker i bakgrunden utan att blockera UI.
    try {
      _user = Map<String, dynamic>.from(jsonDecode(adminStr));
      _logoutCode = _user?['logoutCode'] as String?;
      notifyListeners();
    } catch (_) {}

    unawaited(_validateTokenInBackground(token, prefs));
  }

  Future<void> _validateTokenInBackground(
      String token, SharedPreferences prefs) async {
    try {
      final res = await _api.post('/api/account/verify', {'token': token});
      final isValid = res.data is Map && res.data['valid'] == true;

      if (!isValid) {
        await SecureTokenStore.deleteToken();
        await prefs.remove(AppConstants.adminKey);
        logger.log('AUTO-LOGIN: session invalid, cleared cached credentials');
        _user = null;
        notifyListeners();
        return;
      }

      final adminStr = prefs.getString(AppConstants.adminKey);
      _user = Map<String, dynamic>.from(
          (res.data['admin'] as Map?) ??
              (adminStr != null ? jsonDecode(adminStr) : {}));
      _logoutCode = _user?['logoutCode'] as String?;
      await prefs.setString(AppConstants.adminKey, jsonEncode(_user));
      logger.log('AUTO-LOGIN VERIFIED: ${_user?['email']}');
      notifyListeners();
    } on DioException catch (e) {
      logger.log(
          'AUTO-LOGIN VERIFY ERROR: ${e.response?.statusCode ?? e.message}');
      if (e.response?.statusCode == 401) {
        await SecureTokenStore.deleteToken();
        await prefs.remove(AppConstants.adminKey);
        _user = null;
        notifyListeners();
      }
      // Vid nätverksfel behåller vi cached-state — bättre än tvångsutloggning.
    } catch (e) {
      logger.log('AUTO-LOGIN EXCEPTION: $e');
    }
  }

  // ── Device-session (terminal-parning) ──────────────────────────────────────

  Future<String> _getDeviceId() async {
    if (_deviceIdCache != null) return _deviceIdCache!;
    String? id;
    try {
      if (!kIsWeb && Platform.isAndroid) {
        id = await const AndroidId().getId();
      }
    } catch (e) {
      logger.log('DEVICE-ID: ANDROID_ID misslyckades: $e');
    }
    if (id == null || id.isEmpty) {
      // Fallback (web/iOS) — persistent men överlever inte ominstallation.
      // På Android används det stabila ANDROID_ID som klarar ominstallation.
      id = await SecureTokenStore.readDeviceId();
      if (id == null || id.isEmpty) {
        final r = Random.secure();
        id = List<int>.generate(16, (_) => r.nextInt(256))
            .map((b) => b.toRadixString(16).padLeft(2, '0'))
            .join();
        await SecureTokenStore.writeDeviceId(id);
      }
    }
    _deviceIdCache = id;
    return id;
  }

  Future<String?> _pushToken() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getString(AppConstants.fcmTokenKey);
    } catch (_) {
      return null;
    }
  }

  Future<void> _applyTerminalTokens(dynamic data) async {
    if (data is! Map) return;
    final access = data['accessToken'] as String?;
    final refresh = data['refreshToken'] as String?;
    if (access != null && access.isNotEmpty) {
      await SecureTokenStore.writeToken(access);
    }
    if (refresh != null && refresh.isNotEmpty) {
      await SecureTokenStore.writeRefreshToken(refresh);
    }
  }

  // Återanvänder /verify för att hämta admin-objektet (restaurantId, namn,
  // logoutCode) för den access-token som device-sessionen gav.
  Future<void> _loadAdminFromToken() async {
    final token = await SecureTokenStore.readToken();
    if (token == null) return;
    try {
      final res = await _api.post('/api/account/verify', {'token': token});
      if (res.data is Map && res.data['valid'] == true) {
        _user = Map<String, dynamic>.from((res.data['admin'] as Map?) ?? {});
        _logoutCode = _user?['logoutCode'] as String?;
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(AppConstants.adminKey, jsonEncode(_user));
      }
    } catch (e) {
      logger.log('TERMINAL: verify efter token misslyckades: $e');
    }
  }

  Future<void> _clearSession() async {
    await SecureTokenStore.deleteToken();
    await SecureTokenStore.deleteRefreshToken();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(AppConstants.adminKey);
  }

  /// Anropas vid app-start. Återupptar (eller auto-återställer efter
  /// ominstallation) terminal-sessionen via device-id-bindningen på servern.
  Future<void> bootstrapTerminal() async {
    _terminalStatus = TerminalStatus.booting;
    notifyListeners();

    await SecureTokenStore.migrateFromPrefs();

    // Visa cachad användare direkt (snabb start / offline-tolerans).
    final prefs = await SharedPreferences.getInstance();
    final adminStr = prefs.getString(AppConstants.adminKey);
    if (adminStr != null) {
      try {
        _user = Map<String, dynamic>.from(jsonDecode(adminStr));
        _logoutCode = _user?['logoutCode'] as String?;
      } catch (_) {}
    }

    final deviceId = await _getDeviceId();
    final refresh = await SecureTokenStore.readRefreshToken();
    final pushToken = await _pushToken();

    try {
      final res = await _api.post('/api/terminal/session', {
        'deviceId': deviceId,
        if (refresh != null) 'refreshToken': refresh,
        if (pushToken != null) 'pushToken': pushToken,
      });
      if (res.statusCode == 200) {
        await _applyTerminalTokens(res.data);
        await _loadAdminFromToken();
        _terminalStatus =
            _user != null ? TerminalStatus.paired : TerminalStatus.needsPairing;
      } else {
        _terminalStatus = TerminalStatus.needsPairing;
      }
    } on DioException catch (e) {
      final code = e.response?.statusCode;
      if (code == 403) {
        _terminalStatus = TerminalStatus.revoked;
        _user = null;
        await _clearSession();
      } else if (code == 404) {
        _terminalStatus = TerminalStatus.needsPairing;
      } else {
        // Nätverksfel: kör offline om vi har en cachad session, annars parning.
        final token = await SecureTokenStore.readToken();
        _terminalStatus = (_user != null && token != null)
            ? TerminalStatus.paired
            : TerminalStatus.needsPairing;
      }
    } catch (e) {
      logger.log('TERMINAL bootstrap-fel: $e');
      _terminalStatus = TerminalStatus.needsPairing;
    }
    notifyListeners();
  }

  /// Parar plattan med en engångskod genererad i admin-panelen.
  Future<bool> pair(String code) async {
    _isLoading = true;
    _error = null;
    notifyListeners();
    try {
      final deviceId = await _getDeviceId();
      final pushToken = await _pushToken();
      final res = await _api.post('/api/terminal/pair', {
        'code': code.trim().toUpperCase(),
        'deviceId': deviceId,
        if (pushToken != null) 'pushToken': pushToken,
      });
      if (res.statusCode == 200) {
        await _applyTerminalTokens(res.data);
        await _loadAdminFromToken();
        _terminalStatus = TerminalStatus.paired;
        _isLoading = false;
        notifyListeners();
        return true;
      }
      _error = 'Parning misslyckades';
    } on DioException catch (e) {
      _error = (e.response?.data is Map
              ? e.response?.data['error'] as String?
              : null) ??
          'Ogiltig eller utgången kod';
    } catch (e) {
      _error = 'Ett fel uppstod vid parning';
      logger.log('TERMINAL pair-fel: $e');
    }
    _isLoading = false;
    notifyListeners();
    return false;
  }

  /// Hämtar ny access-token via refresh-token. Kopplas till
  /// ApiClient.onRefreshToken → retriar 401-requests automatiskt.
  Future<bool> refreshTerminalSession() async {
    try {
      final deviceId = await _getDeviceId();
      final refresh = await SecureTokenStore.readRefreshToken();
      final res = await _api.post('/api/terminal/session', {
        'deviceId': deviceId,
        if (refresh != null) 'refreshToken': refresh,
      });
      if (res.statusCode == 200) {
        await _applyTerminalTokens(res.data);
        return true;
      }
      return false;
    } on DioException catch (e) {
      if (e.response?.statusCode == 403) {
        _terminalStatus = TerminalStatus.revoked;
        _user = null;
        await _clearSession();
        notifyListeners();
      }
      return false;
    } catch (e) {
      logger.log('TERMINAL refresh-fel: $e');
      return false;
    }
  }

  /// Anropas via socket-eventet 'device:session-changed' (admin revoke/delete).
  /// Omvärderar sessionen direkt → låsskärm (revoked) eller pairing (deleted).
  Future<void> handleDeviceSessionChanged(String? targetDeviceId) async {
    try {
      final myId = await _getDeviceId();
      if (targetDeviceId == null || targetDeviceId == myId) {
        await bootstrapTerminal();
      }
    } catch (e) {
      logger.log('TERMINAL session-changed-fel: $e');
    }
  }

  /// Tyst om-validering (ingen booting-splash). Anropas när appen återvänder
  /// till förgrunden — fångar revoke/delete som skett medan appen var i
  /// bakgrunden (då socket-eventet kan ha missats). Ändrar bara status om
  /// sessionen faktiskt blivit revoked (403) eller borttagen (404).
  Future<void> revalidateSession() async {
    if (_terminalStatus != TerminalStatus.paired) return;
    try {
      final deviceId = await _getDeviceId();
      final refresh = await SecureTokenStore.readRefreshToken();
      final res = await _api.post('/api/terminal/session', {
        'deviceId': deviceId,
        if (refresh != null) 'refreshToken': refresh,
      });
      if (res.statusCode == 200) {
        await _applyTerminalTokens(res.data);
      }
    } on DioException catch (e) {
      final code = e.response?.statusCode;
      if (code == 403) {
        _terminalStatus = TerminalStatus.revoked;
        _user = null;
        await _clearSession();
        notifyListeners();
      } else if (code == 404) {
        _terminalStatus = TerminalStatus.needsPairing;
        _user = null;
        await _clearSession();
        notifyListeners();
      }
      // Nätverksfel → behåll nuvarande status (offline-tolerans).
    } catch (e) {
      logger.log('TERMINAL revalidate-fel: $e');
    }
  }
}
