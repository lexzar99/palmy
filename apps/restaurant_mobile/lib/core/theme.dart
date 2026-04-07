import 'package:flutter/material.dart';

class AppTheme {
  // PREMIUM COLORS
  static const Color charcoal = Color(0xFF161719); // Slightly lighter gray-charcoal
  static const Color zinc = Color(0xFF1E2024);
  static const Color gold = Color(0xFFE2B05E); // Refined Champagne Gold
  static const Color goldAccent = Color(0xFFFFD700);
  static const Color goldLight = Color(0xFFF3D5A5);
  static const Color success = Color(0xFF2ECC71);
  static const Color danger = Color(0xFFE74C3C);

  static ThemeData get midnightTheme => _buildTheme(Brightness.dark, charcoal, gold);
  static ThemeData get lightTheme => _buildTheme(Brightness.light, Colors.white, Color(0xFF916A2D));

  static ThemeData _buildTheme(Brightness brightness, Color bg, Color primary) {
    bool isDark = brightness == Brightness.dark;
    final baseTextTheme =
        isDark ? ThemeData.dark().textTheme : ThemeData.light().textTheme;
    final appTextTheme = baseTextTheme.apply(
      bodyColor: isDark ? Colors.white : charcoal,
      displayColor: isDark ? Colors.white : charcoal,
      fontFamily: 'sans-serif',
    ).copyWith(
      titleLarge: baseTextTheme.titleLarge?.copyWith(
        fontSize: 16,
        fontWeight: FontWeight.w900,
        letterSpacing: 2,
      ),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      scaffoldBackgroundColor: bg,
      primaryColor: primary,
      colorScheme: ColorScheme.fromSeed(
        seedColor: primary,
        brightness: brightness,
        surface: isDark ? zinc : Colors.grey[50]!,
        onSurface: isDark ? Colors.white : charcoal,
      ),
      textTheme: appTextTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: bg,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: appTextTheme.titleLarge?.copyWith(
          color: isDark ? Colors.white : charcoal,
        ),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) return primary;
          return Colors.grey;
        }),
        trackColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) return primary.withOpacity(0.3);
          return isDark ? Colors.white10 : Colors.black12;
        }),
      ),
    );
  }
}
