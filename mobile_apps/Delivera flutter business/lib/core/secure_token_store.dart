import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'constants.dart';

/// Krypterad lagring för JWT-token. På Android används Keystore via
/// flutter_secure_storage. På web (där det inte finns säker storage)
/// faller vi tillbaka till SharedPreferences eftersom appen där bara
/// används för utveckling/test.
class SecureTokenStore {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  /// Engångsmigrering: flytta gammal plaintext-token från SharedPreferences
  /// till Keystore. Säker att anropa flera gånger.
  static Future<void> migrateFromPrefs() async {
    if (kIsWeb) return;
    final prefs = await SharedPreferences.getInstance();
    final legacy = prefs.getString(AppConstants.tokenKey);
    if (legacy == null || legacy.isEmpty) return;
    final existing = await _storage.read(key: AppConstants.tokenKey);
    if (existing == null) {
      await _storage.write(key: AppConstants.tokenKey, value: legacy);
    }
    await prefs.remove(AppConstants.tokenKey);
  }

  static Future<String?> readToken() async {
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getString(AppConstants.tokenKey);
    }
    return _storage.read(key: AppConstants.tokenKey);
  }

  static Future<void> writeToken(String token) async {
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(AppConstants.tokenKey, token);
      return;
    }
    await _storage.write(key: AppConstants.tokenKey, value: token);
  }

  static Future<void> deleteToken() async {
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(AppConstants.tokenKey);
      return;
    }
    await _storage.delete(key: AppConstants.tokenKey);
  }

  // ── Terminal refresh-token (device-session) ────────────────────────────────
  static const _refreshKey = 'terminal_refresh_token';
  static const _deviceIdKey = 'terminal_device_id';

  static Future<String?> readRefreshToken() async {
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getString(_refreshKey);
    }
    return _storage.read(key: _refreshKey);
  }

  static Future<void> writeRefreshToken(String token) async {
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_refreshKey, token);
      return;
    }
    await _storage.write(key: _refreshKey, value: token);
  }

  static Future<void> deleteRefreshToken() async {
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_refreshKey);
      return;
    }
    await _storage.delete(key: _refreshKey);
  }

  // Fallback-device-id för plattformar utan ANDROID_ID (web/iOS). Överlever
  // INTE ominstallation — på Android används det stabila ANDROID_ID istället.
  static Future<String?> readDeviceId() async {
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getString(_deviceIdKey);
    }
    return _storage.read(key: _deviceIdKey);
  }

  static Future<void> writeDeviceId(String id) async {
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_deviceIdKey, id);
      return;
    }
    await _storage.write(key: _deviceIdKey, value: id);
  }
}
