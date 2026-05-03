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
}
