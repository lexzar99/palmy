import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  static const Color charcoal = Color(0xFF121212);
  static const Color gold = Color(0xFFE7B24B);
  static const Color zinc = Color(0xFF1A1A1A);
  static const Color borderSubtle = Color(0x33FFFFFF);
  static const Color textSecondary = Colors.white54;

  static ThemeData darkTheme = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: charcoal,
    primaryColor: gold,
    colorScheme: const ColorScheme.dark(
      primary: gold,
      secondary: gold,
      surface: zinc,
      onSurface: Colors.white,
    ),
    textTheme: GoogleFonts.outfitTextTheme(ThemeData.dark().textTheme).copyWith(
      displayLarge: GoogleFonts.outfit(
        color: Colors.white,
        fontWeight: FontWeight.w900,
        fontSize: 32,
      ),
      titleLarge: GoogleFonts.outfit(
        color: Colors.white,
        fontWeight: FontWeight.w800,
        fontSize: 20,
      ),
      bodyMedium: GoogleFonts.outfit(
        color: Colors.white70,
        fontWeight: FontWeight.w500,
        fontSize: 16,
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: gold,
        foregroundColor: charcoal,
        padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 32),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
        ),
        textStyle: GoogleFonts.outfit(
          fontWeight: FontWeight.w900,
          letterSpacing: 1.2,
        ),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      fillColor: Colors.black,
      filled: true,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(20),
        borderSide: const BorderSide(color: borderSubtle),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(20),
        borderSide: const BorderSide(color: gold, width: 2),
      ),
      labelStyle: const TextStyle(color: textSecondary),
    ),
  );
}
