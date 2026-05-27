import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/api_client.dart';
import '../core/constants.dart';
import '../core/foreground_service.dart';
import '../core/log_service.dart';
import '../core/push_service.dart';
import '../core/secure_token_store.dart';

class AuthProvider with ChangeNotifier {
  final ApiClient _api = ApiClient();
  bool _isLoading = false;
  String? _error;
  Map<String, dynamic>? _user;
  String? _logoutCode;

  bool get isLoading => _isLoading;
  String? get error => _error;
  Map<String, dynamic>? get user => _user;
  bool get isAuthenticated => _user != null;
  String? get logoutCode => _logoutCode;

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
}
