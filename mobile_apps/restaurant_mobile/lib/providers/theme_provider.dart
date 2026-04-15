import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/theme.dart';

class ThemeProvider with ChangeNotifier {
  ThemeData _midnightTheme = AppTheme.midnightTheme;
  ThemeData _lightTheme = AppTheme.lightTheme;
  String _themeName = 'MIDNIGHT GOLD';
  Brightness _systemBrightness = Brightness.dark;

  ThemeData get currentTheme {
    if (_themeName == 'SYNC WITH SYSTEM') {
      return _systemBrightness == Brightness.dark ? _midnightTheme : _lightTheme;
    }
    return _themeName == 'LIGHT MODE' ? _lightTheme : _midnightTheme;
  }

  String get themeName => _themeName;

  ThemeProvider() {
    _loadTheme();
  }

  void updateSystemBrightness(Brightness brightness) {
    if (_systemBrightness != brightness) {
      _systemBrightness = brightness;
      if (_themeName == 'SYNC WITH SYSTEM') notifyListeners();
    }
  }

  Future<void> _loadTheme() async {
    final prefs = await SharedPreferences.getInstance();
    _themeName = prefs.getString('app_theme') ?? 'MIDNIGHT GOLD';
    _updateThemeData();
  }

  void setTheme(String name) async {
    _themeName = name;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('app_theme', name);
    notifyListeners();
  }

  void _updateThemeData() {
    // This is now handled by the getter
    notifyListeners();
  }
}
