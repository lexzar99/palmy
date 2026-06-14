import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/theme.dart';

enum ThemePreference { midnight, light, system }

extension ThemePreferenceLabels on ThemePreference {
  String get storageKey {
    switch (this) {
      case ThemePreference.midnight:
        return 'midnight';
      case ThemePreference.light:
        return 'light';
      case ThemePreference.system:
        return 'system';
    }
  }

  String get label {
    switch (this) {
      case ThemePreference.midnight:
        return 'Mörkt läge';
      case ThemePreference.light:
        return 'Ljust läge';
      case ThemePreference.system:
        return 'Följ systemet';
    }
  }

  String get description {
    switch (this) {
      case ThemePreference.midnight:
        return 'Mörkt läge för restaurangdrift.';
      case ThemePreference.light:
        return 'Ren och ljus vy för dagarbete.';
      case ThemePreference.system:
        return 'Växlar automatiskt efter mobilen.';
    }
  }
}

class ThemeProvider with ChangeNotifier {
  static const String _themeStorageKey = 'app_theme_v2';

  final ThemeData _midnightTheme = AppTheme.midnightTheme;
  final ThemeData _lightTheme = AppTheme.lightTheme;
  ThemePreference _themePreference = ThemePreference.system;
  Brightness _systemBrightness = Brightness.dark;

  ThemeData get currentTheme {
    if (_themePreference == ThemePreference.system) {
      return _systemBrightness == Brightness.dark
          ? _midnightTheme
          : _lightTheme;
    }
    return _themePreference == ThemePreference.light
        ? _lightTheme
        : _midnightTheme;
  }

  String get themeName => _themePreference.label;
  ThemePreference get themePreference => _themePreference;

  ThemeProvider() {
    _loadTheme();
  }

  void updateSystemBrightness(Brightness brightness) {
    if (_systemBrightness != brightness) {
      _systemBrightness = brightness;
      if (_themePreference == ThemePreference.system) notifyListeners();
    }
  }

  Future<void> _loadTheme() async {
    final prefs = await SharedPreferences.getInstance();
    final savedTheme = prefs.getString(_themeStorageKey);
    _themePreference = savedTheme == null
        ? ThemePreference.system
        : _parseSavedTheme(savedTheme);
    notifyListeners();
  }

  Future<void> setThemePreference(ThemePreference preference) async {
    if (_themePreference == preference) return;

    _themePreference = preference;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_themeStorageKey, preference.storageKey);
    notifyListeners();
  }

  Future<void> setTheme(String name) {
    return setThemePreference(_parseSavedTheme(name));
  }

  ThemePreference _parseSavedTheme(String? rawValue) {
    switch (rawValue?.trim().toLowerCase()) {
      case 'light':
      case 'light mode':
      case 'soft daylight':
        return ThemePreference.light;
      case 'system':
      case 'sync with system':
      case 'följ systemet':
      case 'folj systemet':
        return ThemePreference.system;
      case 'midnight':
      case 'midnight gold':
      case 'night shift':
        return ThemePreference.midnight;
      default:
        return ThemePreference.system;
    }
  }
}
