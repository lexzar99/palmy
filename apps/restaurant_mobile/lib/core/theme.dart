import 'package:flutter/material.dart';

class AppTheme {
  // PREMIUM COLORS
  static const Color charcoal = Color(0xFF161719);
  static const Color zinc = Color(0xFF1E2024);
  static const Color gold = Color(0xFFE2B05E);
  static const Color goldAccent = Color(0xFFFFD700);
  static const Color goldLight = Color(0xFFF3D5A5);
  static const Color success = Color(0xFF2ECC71);
  static const Color danger = Color(0xFFE74C3C);

  // Light theme colors
  static const Color lightBg = Color(0xFFF8F5F0);       // Warm ivory
  static const Color lightSurface = Color(0xFFFFFFFF);
  static const Color lightText = Color(0xFF1A1A1A);
  static const Color lightSubtext = Color(0xFF6B6560);
  static const Color lightGold = Color(0xFF7A5522);     // Darker gold for contrast on light

  static ThemeData get midnightTheme => _buildDarkTheme();
  static ThemeData get lightTheme => _buildLightTheme();

  static ThemeData _buildDarkTheme() {
    const bg = charcoal;
    const primary = gold;
    
    final base = ThemeData.dark();
    final textTheme = base.textTheme.apply(
      bodyColor: Colors.white,
      displayColor: Colors.white,
      fontFamily: 'sans-serif',
    ).copyWith(
      titleLarge: base.textTheme.titleLarge?.copyWith(
        fontSize: 16, fontWeight: FontWeight.w900, letterSpacing: 2,
      ),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: bg,
      primaryColor: primary,
      colorScheme: ColorScheme.fromSeed(
        seedColor: primary,
        brightness: Brightness.dark,
        surface: zinc,
        onSurface: Colors.white,
      ),
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: bg,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: textTheme.titleLarge?.copyWith(color: Colors.white),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: primary,
          foregroundColor: charcoal,
          textStyle: const TextStyle(fontWeight: FontWeight.w900, letterSpacing: 2, fontSize: 13),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
          elevation: 0,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: zinc,
        labelStyle: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1.5),
        hintStyle: TextStyle(color: Colors.white.withOpacity(0.3)),
        prefixIconColor: Colors.white.withOpacity(0.4),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: Colors.white.withOpacity(0.06), width: 1.5)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: gold, width: 1.5)),
        contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? primary : Colors.grey),
        trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? primary.withOpacity(0.3) : Colors.white10),
      ),
    );
  }

  static ThemeData _buildLightTheme() {
    const bg = lightBg;
    const primary = lightGold;
    const surface = lightSurface;

    final base = ThemeData.light();
    final textTheme = base.textTheme.apply(
      bodyColor: lightText,
      displayColor: lightText,
      fontFamily: 'sans-serif',
    ).copyWith(
      titleLarge: base.textTheme.titleLarge?.copyWith(
        fontSize: 16, fontWeight: FontWeight.w900, letterSpacing: 2, color: lightText,
      ),
      bodyLarge: base.textTheme.bodyLarge?.copyWith(color: lightText),
      bodyMedium: base.textTheme.bodyMedium?.copyWith(color: lightText),
      bodySmall: base.textTheme.bodySmall?.copyWith(color: lightSubtext),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: bg,
      primaryColor: primary,
      colorScheme: ColorScheme.fromSeed(
        seedColor: primary,
        brightness: Brightness.light,
        surface: surface,
        onSurface: lightText,
        primary: primary,
        onPrimary: Colors.white,
        secondary: gold,
        onSecondary: charcoal,
      ),
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: bg,
        elevation: 0,
        centerTitle: false,
        foregroundColor: lightText,
        titleTextStyle: textTheme.titleLarge?.copyWith(color: lightText),
        iconTheme: const IconThemeData(color: lightText),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: primary,
          foregroundColor: Colors.white,
          textStyle: const TextStyle(fontWeight: FontWeight.w900, letterSpacing: 2, fontSize: 13),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
          elevation: 2,
          shadowColor: lightGold.withOpacity(0.3),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        labelStyle: TextStyle(color: lightSubtext, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1.5),
        hintStyle: TextStyle(color: lightSubtext.withOpacity(0.5)),
        prefixIconColor: lightSubtext,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide.none),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: Colors.black.withOpacity(0.08), width: 1.5)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: primary, width: 1.5)),
        contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
      ),
      cardTheme: CardThemeData(
        color: Colors.white,
        elevation: 1,
        shadowColor: Colors.black.withOpacity(0.08),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
      dividerTheme: DividerThemeData(color: Colors.black.withOpacity(0.07)),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? primary : Colors.grey[400]!),
        trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? primary.withOpacity(0.25) : Colors.black12),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: lightSurface,
        selectedItemColor: primary,
        unselectedItemColor: lightSubtext,
      ),
      navigationRailTheme: const NavigationRailThemeData(
        backgroundColor: lightSurface,
        selectedIconTheme: IconThemeData(color: primary),
        unselectedIconTheme: IconThemeData(color: lightSubtext),
        indicatorColor: Color(0x257A5522),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: charcoal,
        contentTextStyle: const TextStyle(color: Colors.white),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}
