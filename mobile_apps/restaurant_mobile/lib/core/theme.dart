import 'package:flutter/material.dart';

/// MatGo Business — visuell stil matchad mot webben + admin-panelen v2.
///
/// Palett: electric lime (#c2f54b) på neutral näst-svart, zinc-grå texter,
/// 14px hörnradie, semibold (600) typografi.
///
/// Vi behåller alla gamla constant-namn (gold, brandGold, deepSea, etc.) så att
/// befintliga widgets kompilerar — bara värdena byts till de nya kort.
class AppTheme {
  // ── Neutral dark backgrounds (zinc/near-black, INTE blue-tinted) ───────────
  static const Color midnight = Color(0xFF08090B); // bg-page
  static const Color storm = Color(0xFF0B0C0F); // bg-primary
  static const Color deepSea = Color(0xFF0E0F12); // bg-panel
  static const Color steel = Color(0xFF16181B); // bg-panel-muted

  // ── Light surfaces ─────────────────────────────────────────────────────────
  static const Color paper = Color(0xFFFFFFFF);
  static const Color mist = Color(0xFFFAFAFA);
  static const Color frost = Color(0xFFF4F4F5);
  static const Color ink = Color(0xFF09090B); // zinc-950
  static const Color mutedInk = Color(0xFF52525B); // zinc-600

  // ── Accent: electric lime (matchar admin v2 #c2f54b) ───────────────────────
  // Behåll gamla namn (gold/lightGold/goldAccent) för bakåtkomp.
  static const Color gold = Color(0xFFC2F54B);
  static const Color goldAccent = Color(0xFFD6FF6E);
  static const Color lightGold = Color(0xFF84CC16); // lime-500 för light mode

  /// Behåll "brandGold"-namnet — det är pickup-färgen i order-korten.
  /// I nya paletten är pickup också lime.
  static const Color brandGold = Color(0xFFC2F54B);
  static const Color brandGoldSoft = Color(0xFFD6FF6E);
  static const Color creamBg = Color(0x14C2F54B); // lime-soft bg
  static const Color creamPill = Color(0x26C2F54B); // lime-soft pill

  /// Delivery-färgen (semantisk differentiering vs pickup). Soft sky-blue.
  static const Color brandBlue = Color(0xFF60A5FA);
  static const Color blueTint = Color(0x1460A5FA);
  static const Color blueTintPill = Color(0x2660A5FA);

  // ── Status ────────────────────────────────────────────────────────────────
  static const Color success = Color(0xFF4ADE80);
  static const Color danger = Color(0xFFFB7185);
  static const Color warning = Color(0xFFFBBF24);
  static const Color info = Color(0xFF60A5FA);
  static const Color lavender = Color(0xFFA78BFA);

  // Legacy aliases
  static const Color charcoal = midnight;
  static const Color zinc = deepSea;
  static const Color lightBg = mist;
  static const Color lightSurface = paper;
  static const Color lightText = ink;
  static const Color lightSubtext = mutedInk;

  static ThemeData get midnightTheme => _buildDarkTheme();
  static ThemeData get lightTheme => _buildLightTheme();

  static bool isDark(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark;

  /// Backgrunds-gradient. I nya paletten är dark läget en RIKTIG neutral nästan-svart
  /// (inte blå-tonad). Ljus är off-white.
  static LinearGradient shellGradient(BuildContext context) {
    if (isDark(context)) {
      return const LinearGradient(
        colors: [Color(0xFF08090B), Color(0xFF0B0C0F)],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      );
    }

    return const LinearGradient(
      colors: [Color(0xFFFAFAFA), Color(0xFFF4F4F5)],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    );
  }

  static Color panelColor(BuildContext context) {
    return isDark(context) ? const Color(0xFF0E0F12) : paper;
  }

  static Color mutedColor(BuildContext context) {
    return isDark(context) ? const Color(0xFFA1A1AA) : mutedInk;
  }

  static Color faintColor(BuildContext context) {
    return isDark(context)
        ? Colors.white.withOpacity(0.04)
        : ink.withOpacity(0.04);
  }

  static Color borderColor(BuildContext context, {Color? tint}) {
    if (tint != null) return tint.withOpacity(isDark(context) ? 0.20 : 0.18);
    return isDark(context)
        ? Colors.white.withOpacity(0.06)
        : ink.withOpacity(0.06);
  }

  /// Panel-dekoration. Subtila borders, ingen tung skugga i dark. 14px hörn.
  static BoxDecoration panelDecoration(
    BuildContext context, {
    Color? tint,
    double radius = 14,
    Gradient? gradient,
    Color? color,
  }) {
    final isDarkMode = isDark(context);
    return BoxDecoration(
      color: color ?? panelColor(context),
      gradient: gradient,
      borderRadius: BorderRadius.circular(radius),
      border: Border.all(
        color: borderColor(context, tint: tint),
        width: 1,
      ),
      boxShadow: isDarkMode
          ? const []
          : [
              BoxShadow(
                color: Colors.black.withOpacity(0.04),
                blurRadius: 12,
                offset: const Offset(0, 2),
              ),
            ],
    );
  }

  static ThemeData _buildDarkTheme() {
    const scheme = ColorScheme(
      brightness: Brightness.dark,
      primary: gold,
      onPrimary: ink,
      secondary: info,
      onSecondary: ink,
      error: danger,
      onError: paper,
      surface: deepSea,
      onSurface: paper,
      tertiary: lavender,
      onTertiary: paper,
      outline: Color(0x14FFFFFF),
      outlineVariant: Color(0x0AFFFFFF),
      shadow: Colors.black,
      scrim: Colors.black,
      inverseSurface: paper,
      onInverseSurface: ink,
      inversePrimary: lightGold,
      surfaceTint: gold,
    );

    final base = ThemeData.dark(useMaterial3: true);
    final textTheme = _buildTextTheme(base.textTheme, Brightness.dark);

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: scheme,
      primaryColor: gold,
      scaffoldBackgroundColor: Colors.transparent,
      canvasColor: midnight,
      cardColor: deepSea,
      dividerColor: Colors.white.withOpacity(0.06),
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        foregroundColor: paper,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: textTheme.titleLarge?.copyWith(color: paper),
      ),
      inputDecorationTheme: _inputDecorationTheme(Brightness.dark),
      elevatedButtonTheme: _elevatedButtonTheme(
        background: gold,
        foreground: ink,
      ),
      outlinedButtonTheme: _outlinedButtonTheme(Brightness.dark),
      textButtonTheme: _textButtonTheme(Brightness.dark),
      chipTheme: _chipTheme(Brightness.dark),
      switchTheme: _switchTheme(gold),
      snackBarTheme: _snackBarTheme(Brightness.dark),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: Colors.transparent,
        indicatorColor: gold.withOpacity(0.14),
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => textTheme.labelSmall?.copyWith(
            color: states.contains(WidgetState.selected)
                ? gold
                : Colors.white.withOpacity(0.58),
            fontWeight: states.contains(WidgetState.selected)
                ? FontWeight.w700
                : FontWeight.w500,
          ),
        ),
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: Colors.transparent,
        selectedIconTheme: const IconThemeData(color: ink),
        unselectedIconTheme:
            IconThemeData(color: Colors.white.withOpacity(0.56)),
        selectedLabelTextStyle: textTheme.labelSmall?.copyWith(color: gold),
        unselectedLabelTextStyle: textTheme.labelSmall
            ?.copyWith(color: Colors.white.withOpacity(0.52)),
        indicatorColor: gold,
      ),
      tabBarTheme: TabBarTheme(
        indicatorColor: gold,
        labelColor: gold,
        unselectedLabelColor: Colors.white.withOpacity(0.55),
        labelStyle: textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700),
        unselectedLabelStyle:
            textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w500),
        dividerColor: Colors.transparent,
      ),
      cardTheme: CardTheme(
        color: deepSea,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: Colors.white.withOpacity(0.06)),
        ),
      ),
      dialogTheme: DialogTheme(
        backgroundColor: storm,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      ),
    );
  }

  static ThemeData _buildLightTheme() {
    const scheme = ColorScheme(
      brightness: Brightness.light,
      primary: lightGold,
      onPrimary: paper,
      secondary: info,
      onSecondary: paper,
      error: danger,
      onError: paper,
      surface: paper,
      onSurface: ink,
      tertiary: lavender,
      onTertiary: paper,
      outline: Color(0x14111827),
      outlineVariant: Color(0x0A111827),
      shadow: Color(0x14000000),
      scrim: Color(0x33000000),
      inverseSurface: ink,
      onInverseSurface: paper,
      inversePrimary: gold,
      surfaceTint: lightGold,
    );

    final base = ThemeData.light(useMaterial3: true);
    final textTheme = _buildTextTheme(base.textTheme, Brightness.light);

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: scheme,
      primaryColor: lightGold,
      scaffoldBackgroundColor: Colors.transparent,
      canvasColor: mist,
      cardColor: paper,
      dividerColor: ink.withOpacity(0.06),
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        foregroundColor: ink,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: textTheme.titleLarge?.copyWith(color: ink),
      ),
      inputDecorationTheme: _inputDecorationTheme(Brightness.light),
      elevatedButtonTheme: _elevatedButtonTheme(
        background: lightGold,
        foreground: paper,
      ),
      outlinedButtonTheme: _outlinedButtonTheme(Brightness.light),
      textButtonTheme: _textButtonTheme(Brightness.light),
      chipTheme: _chipTheme(Brightness.light),
      switchTheme: _switchTheme(lightGold),
      snackBarTheme: _snackBarTheme(Brightness.light),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: Colors.transparent,
        indicatorColor: lightGold.withOpacity(0.12),
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => textTheme.labelSmall?.copyWith(
            color: states.contains(WidgetState.selected) ? lightGold : mutedInk,
            fontWeight: states.contains(WidgetState.selected)
                ? FontWeight.w700
                : FontWeight.w500,
          ),
        ),
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: Colors.transparent,
        selectedIconTheme: const IconThemeData(color: paper),
        unselectedIconTheme: const IconThemeData(color: mutedInk),
        selectedLabelTextStyle:
            textTheme.labelSmall?.copyWith(color: lightGold),
        unselectedLabelTextStyle:
            textTheme.labelSmall?.copyWith(color: mutedInk),
        indicatorColor: lightGold,
      ),
      tabBarTheme: TabBarTheme(
        indicatorColor: lightGold,
        labelColor: lightGold,
        unselectedLabelColor: mutedInk,
        labelStyle: textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700),
        unselectedLabelStyle:
            textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w500),
        dividerColor: Colors.transparent,
      ),
      cardTheme: CardTheme(
        color: paper,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: ink.withOpacity(0.06)),
        ),
      ),
      dialogTheme: DialogTheme(
        backgroundColor: paper,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      ),
    );
  }

  static TextTheme _buildTextTheme(TextTheme base, Brightness brightness) {
    final bodyColor = brightness == Brightness.dark ? paper : ink;
    final secondary = brightness == Brightness.dark
        ? const Color(0xFFA1A1AA) // zinc-400
        : mutedInk;

    return base.copyWith(
      displaySmall: base.displaySmall?.copyWith(
        fontSize: 30,
        fontWeight: FontWeight.w600,
        color: bodyColor,
        letterSpacing: -0.6,
        height: 1.1,
      ),
      headlineMedium: base.headlineMedium?.copyWith(
        fontSize: 22,
        fontWeight: FontWeight.w600,
        color: bodyColor,
        letterSpacing: -0.3,
        height: 1.2,
      ),
      titleLarge: base.titleLarge?.copyWith(
        fontSize: 18,
        fontWeight: FontWeight.w600,
        color: bodyColor,
        letterSpacing: -0.2,
      ),
      titleMedium: base.titleMedium?.copyWith(
        fontSize: 15,
        fontWeight: FontWeight.w600,
        color: bodyColor,
      ),
      bodyLarge: base.bodyLarge?.copyWith(
        fontSize: 14,
        fontWeight: FontWeight.w500,
        color: bodyColor,
        height: 1.45,
      ),
      bodyMedium: base.bodyMedium?.copyWith(
        fontSize: 13,
        fontWeight: FontWeight.w500,
        color: secondary,
        height: 1.45,
      ),
      bodySmall: base.bodySmall?.copyWith(
        fontSize: 11,
        fontWeight: FontWeight.w500,
        color: secondary,
        height: 1.4,
      ),
      labelLarge: base.labelLarge?.copyWith(
        fontSize: 12,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.1,
      ),
      labelMedium: base.labelMedium?.copyWith(
        fontSize: 10,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.6,
      ),
    );
  }

  static InputDecorationTheme _inputDecorationTheme(Brightness brightness) {
    final isDarkMode = brightness == Brightness.dark;
    final fill = isDarkMode ? const Color(0xFF16181B) : paper;
    final borderColor =
        isDarkMode ? Colors.white.withOpacity(0.08) : ink.withOpacity(0.08);
    final labelColor = isDarkMode
        ? const Color(0xFFA1A1AA)
        : mutedInk;

    return InputDecorationTheme(
      filled: true,
      fillColor: fill,
      hintStyle: TextStyle(color: labelColor.withOpacity(0.75)),
      labelStyle: TextStyle(
        color: labelColor,
        fontSize: 13,
        fontWeight: FontWeight.w500,
      ),
      prefixIconColor: labelColor,
      suffixIconColor: labelColor,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: borderColor, width: 1),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(
          color: isDarkMode ? gold : lightGold,
          width: 1.5,
        ),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: danger, width: 1.2),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: danger, width: 1.4),
      ),
    );
  }

  static ElevatedButtonThemeData _elevatedButtonTheme({
    required Color background,
    required Color foreground,
  }) {
    return ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: background,
        foregroundColor: foreground,
        elevation: 0,
        shadowColor: Colors.transparent,
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        textStyle: const TextStyle(
          fontWeight: FontWeight.w600,
          letterSpacing: 0.1,
          fontSize: 14,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }

  static OutlinedButtonThemeData _outlinedButtonTheme(Brightness brightness) {
    final isDarkMode = brightness == Brightness.dark;
    return OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: isDarkMode ? paper : ink,
        side: BorderSide(
          color: isDarkMode
              ? Colors.white.withOpacity(0.10)
              : ink.withOpacity(0.10),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }

  static TextButtonThemeData _textButtonTheme(Brightness brightness) {
    final color = brightness == Brightness.dark ? gold : lightGold;
    return TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: color,
        textStyle: const TextStyle(fontWeight: FontWeight.w600),
      ),
    );
  }

  static ChipThemeData _chipTheme(Brightness brightness) {
    final isDarkMode = brightness == Brightness.dark;
    return ChipThemeData(
      backgroundColor:
          isDarkMode ? Colors.white.withOpacity(0.04) : ink.withOpacity(0.04),
      selectedColor:
          isDarkMode ? gold.withOpacity(0.16) : lightGold.withOpacity(0.14),
      side: BorderSide(
        color:
            isDarkMode ? Colors.white.withOpacity(0.08) : ink.withOpacity(0.06),
      ),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      labelStyle: TextStyle(
        color: isDarkMode ? paper : ink,
        fontWeight: FontWeight.w500,
        fontSize: 12,
      ),
    );
  }

  static SwitchThemeData _switchTheme(Color activeColor) {
    return SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected)
            ? activeColor
            : Colors.grey.shade400,
      ),
      trackColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected)
            ? activeColor.withOpacity(0.28)
            : Colors.grey.withOpacity(0.18),
      ),
    );
  }

  static SnackBarThemeData _snackBarTheme(Brightness brightness) {
    return SnackBarThemeData(
      backgroundColor: brightness == Brightness.dark ? steel : ink,
      contentTextStyle:
          const TextStyle(color: paper, fontWeight: FontWeight.w500),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      behavior: SnackBarBehavior.floating,
    );
  }
}
