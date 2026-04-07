import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/api_client.dart';
import '../core/constants.dart';

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
        _isLoading = false;
        notifyListeners();
        return true;
      }
    } on DioException catch (e) {
      final responseError = e.response?.data is Map ? (e.response?.data['error'] as String?) : null;
      if (responseError != null && responseError.trim().isNotEmpty) {
        _error = responseError;
      } else if (e.response?.statusCode != null) {
        _error = 'Inloggning misslyckades (HTTP ${e.response?.statusCode})';
      } else if (e.message != null && e.message!.trim().isNotEmpty) {
        _error = 'Inloggning misslyckades: ${e.message}';
      } else {
        _error = 'Inloggning misslyckades';
      }
    } catch (e) {
      _error = 'Ett oväntat fel uppstod';
    }

    _isLoading = false;
    notifyListeners();
    return false;
  }

  Future<void> logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(AppConstants.tokenKey);
    await prefs.remove(AppConstants.adminKey);
    _user = null;
    notifyListeners();
  }

  Future<void> tryAutoLogin() async {
    final prefs = await SharedPreferences.getInstance();
    final adminStr = prefs.getString(AppConstants.adminKey);
    if (adminStr != null) {
      _user = jsonDecode(adminStr);
      notifyListeners();
    }
  }
}
