import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/api_client.dart';
import '../core/constants.dart';
import '../core/log_service.dart';

class AuthProvider with ChangeNotifier {
  final ApiClient _api = ApiClient();
  bool _isLoading = false;
  String? _error;
  Map<String, dynamic>? _user;

  bool get isLoading => _isLoading;
  String? get error => _error;
  Map<String, dynamic>? get user => _user;
  bool get isAuthenticated => _user != null;

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

        await prefs.setString(AppConstants.tokenKey, data['token']);
        await prefs.setString(AppConstants.adminKey, jsonEncode(data['admin']));

        _user = data['admin'];
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
      } else if (e.type == DioExceptionType.connectionError) {
        _error =
            'Kunde inte ansluta till servern (DNS/nätverk). Kontrollera internet.';
      } else if (e.type == DioExceptionType.badCertificate) {
        _error =
            'SSL-certifikatfel. Kontrollera att datum/tid på mobilen är korrekt.';
      } else if (e.message != null && e.message!.trim().isNotEmpty) {
        _error = 'Inloggning misslyckades: ${e.message}';
      } else {
        _error = 'Inloggning misslyckades';
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

  Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(AppConstants.tokenKey);
    await prefs.remove(AppConstants.adminKey);
    logger.log('LOGOUT: ${_user?['email']}');
    _user = null;
    notifyListeners();
  }

  Future<void> tryAutoLogin() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString(AppConstants.tokenKey);
    final adminStr = prefs.getString(AppConstants.adminKey);

    if (token == null || adminStr == null) {
      return;
    }

    try {
      final res = await _api.post('/api/account/verify', {'token': token});
      final isValid = res.data is Map && res.data['valid'] == true;

      if (!isValid) {
        await prefs.remove(AppConstants.tokenKey);
        await prefs.remove(AppConstants.adminKey);
        logger.log('AUTO-LOGIN: session invalid, cleared cached credentials');
        _user = null;
        notifyListeners();
        return;
      }

      _user = Map<String, dynamic>.from(
          (res.data['admin'] as Map?) ?? jsonDecode(adminStr));
      await prefs.setString(AppConstants.adminKey, jsonEncode(_user));
      logger.log('AUTO-LOGIN VERIFIED: ${_user?['email']}');
      notifyListeners();
    } on DioException catch (e) {
      logger.log(
          'AUTO-LOGIN VERIFY ERROR: ${e.response?.statusCode ?? e.message}');
      if (e.response?.statusCode == 401) {
        await prefs.remove(AppConstants.tokenKey);
        await prefs.remove(AppConstants.adminKey);
        _user = null;
        notifyListeners();
      }
    } catch (e) {
      logger.log('AUTO-LOGIN EXCEPTION: $e');
    }
  }
}
