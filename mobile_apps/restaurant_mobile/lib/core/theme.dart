import 'package:flutter/material.dart';

class AppTheme {
  static const Color midnight = Color(0xFF09111F);
  static const Color storm = Color(0xFF101A2F);
  static const Color deepSea = Color(0xFF16233D);
  static const Color steel = Color(0xFF24324F);
  static const Color paper = Color(0xFFFFFFFF);
  static const Color mist = Color(0xFFF4F7FB);
  static const Color frost = Color(0xFFE8EEF7);
  static const Color ink = Color(0xFF0E1628);
  static const Color mutedInk = Color(0xFF5E6A84);
  static const Color gold = Color(0xFFFFC86B);
  static const Color goldAccent = Color(0xFFFFE5AE);
  static const Color lightGold = Color(0xFFA76A17);
  static const Color success = Color(0xFF2DC48D);
  static const Color danger = Color(0xFFFF6B78);
  static const Color warning = Color(0xFFFFA749);
  static const Color info = Color(0xFF5AB7FF);
  static const Color lavender = Color(0xFF8D8BFF);

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

  static LinearGradient shellGradient(BuildContext context) {
    if (isDark(context)) {
      return const LinearGradient(
        colors: [Color(0xFF07101E), Color(0xFF0B1730), Color(0xFF132240)],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      );
    }

    return const LinearGradient(
      colors: [Color(0xFFFDFEFE), Color(0xFFF7F9FC), Color(0xFFF2F5F9)],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    );
  }

  static Color panelColor(BuildContext context) {
    return isDark(context) ? const Color(0xCC16233D) : const Color(0xFFFFFFFF);
  }

  static Color mutedColor(BuildContext context) {
    return isDark(context) ? Colors.white.withOpacity(0.68) : mutedInk;
  }

  static Color faintColor(BuildContext context) {
    return isDark(context)
        ? Colors.white.withOpacity(0.12)
        : ink.withOpacity(0.05);
  }

  static Color borderColor(BuildContext context, {Color? tint}) {
    final base = tint ?? (isDark(context) ? Colors.white : ink);
    return base.withOpacity(isDark(context) ? 0.12 : 0.06);
  }

  static BoxDecoration panelDecoration(
    BuildContext context, {
    Color? tint,
    double radius = 28,
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
        width: 1.2,
      ),
      boxShadow: [
        BoxShadow(
          color: isDarkMode
              ? Colors.black.withOpacity(0.30)
              : const Color(0xFF95A3BE).withOpacity(0.08),
          blurRadius: isDarkMode ? 28 : 14,
          offset: const Offset(0, 8),
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
      outline: Color(0x334B617F),
      outlineVariant: Color(0x1F4B617F),
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
      dividerColor: Colors.white.withOpacity(0.08),
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
        foreground: ink,
        shadowColor: gold.withOpacity(0.28),
      ),
      outlinedButtonTheme: _outlinedButtonTheme(Brightness.dark),
      textButtonTheme: _textButtonTheme(Brightness.dark),
      chipTheme: _chipTheme(Brightness.dark),
      switchTheme: _switchTheme(gold),
      snackBarTheme: _snackBarTheme(Brightness.dark),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: Colors.transparent,
        indicatorColor: gold.withOpacity(0.16),
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => textTheme.labelSmall?.copyWith(
            color: states.contains(WidgetState.selected)
                ? gold
                : Colors.white.withOpacity(0.62),
            fontWeight: states.contains(WidgetState.selected)
                ? FontWeight.w900
                : FontWeight.w700,
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
        labelStyle: textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w900),
        unselectedLabelStyle:
            textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700),
        dividerColor: Colors.transparent,
      ),
      cardTheme: CardTheme(
        color: deepSea,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(28),
          side: BorderSide(color: Colors.white.withOpacity(0.06)),
        ),
      ),
      dialogTheme: DialogTheme(
        backgroundColor: storm,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
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
      outline: Color(0x1A111827),
      outlineVariant: Color(0x14111827),
      shadow: Color(0x22000000),
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
      dividerColor: ink.withOpacity(0.08),
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
        foreground: paper,
        shadowColor: lightGold.withOpacity(0.22),
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
                ? FontWeight.w900
                : FontWeight.w700,
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
        labelStyle: textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w900),
        unselectedLabelStyle:
            textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700),
        dividerColor: Colors.transparent,
      ),
      cardTheme: CardTheme(
        color: paper,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(28),
          side: BorderSide(color: ink.withOpacity(0.05)),
        ),
      ),
      dialogTheme: DialogTheme(
        backgroundColor: paper,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
      ),
    );
  }

  static TextTheme _buildTextTheme(TextTheme base, Brightness brightness) {
    final bodyColor = brightness == Brightness.dark ? paper : ink;
    final secondary = brightness == Brightness.dark
        ? Colors.white.withOpacity(0.72)
        : mutedInk;

    return base.copyWith(
      displaySmall: base.displaySmall?.copyWith(
        fontWeight: FontWeight.w900,
        color: bodyColor,
        letterSpacing: -1.6,
      ),
      headlineMedium: base.headlineMedium?.copyWith(
        fontWeight: FontWeight.w900,
        color: bodyColor,
        letterSpacing: -0.7,
      ),
      titleLarge: base.titleLarge?.copyWith(
        fontSize: 22,
        fontWeight: FontWeight.w900,
        color: bodyColor,
        letterSpacing: -0.4,
      ),
      titleMedium: base.titleMedium?.copyWith(
        fontSize: 16,
        fontWeight: FontWeight.w800,
        color: bodyColor,
      ),
      bodyLarge: base.bodyLarge?.copyWith(
        fontSize: 15,
        fontWeight: FontWeight.w600,
        color: bodyColor,
        height: 1.35,
      ),
      bodyMedium: base.bodyMedium?.copyWith(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: secondary,
        height: 1.4,
      ),
      bodySmall: base.bodySmall?.copyWith(
        fontSize: 11,
        fontWeight: FontWeight.w700,
        color: secondary,
        height: 1.35,
      ),
      labelLarge: base.labelLarge?.copyWith(
        fontSize: 12,
        fontWeight: FontWeight.w800,
        letterSpacing: 0.1,
      ),
      labelMedium: base.labelMedium?.copyWith(
        fontSize: 10,
        fontWeight: FontWeight.w900,
        letterSpacing: 1.1,
      ),
    );
  }

  static InputDecorationTheme _inputDecorationTheme(Brightness brightness) {
    final isDarkMode = brightness == Brightness.dark;
    final fill = isDarkMode ? const Color(0xB0192743) : Colors.white;
    final borderColor =
        isDarkMode ? Colors.white.withOpacity(0.08) : ink.withOpacity(0.08);
    final labelColor = isDarkMode ? Colors.white.withOpacity(0.72) : mutedInk;

    return InputDecorationTheme(
      filled: true,
      fillColor: fill,
      hintStyle: TextStyle(color: labelColor.withOpacity(0.75)),
      labelStyle: TextStyle(
        color: labelColor,
        fontSize: 11,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.3,
      ),
      prefixIconColor: labelColor,
      suffixIconColor: labelColor,
      contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 18),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(22),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(22),
        borderSide: BorderSide(color: borderColor, width: 1.1),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(22),
        borderSide: BorderSide(
          color: isDarkMode ? gold : lightGold,
          width: 1.4,
        ),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(22),
        borderSide: const BorderSide(color: danger, width: 1.3),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(22),
        borderSide: const BorderSide(color: danger, width: 1.4),
      ),
    );
  }

  static ElevatedButtonThemeData _elevatedButtonTheme({
    required Color foreground,
    required Color shadowColor,
  }) {
    return ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: gold,
        foregroundColor: foreground,
        elevation: 0,
        shadowColor: shadowColor,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        textStyle: const TextStyle(
          fontWeight: FontWeight.w900,
          letterSpacing: 0.2,
          fontSize: 13,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
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
              ? Colors.white.withOpacity(0.12)
              : ink.withOpacity(0.10),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 15),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      ),
    );
  }

  static TextButtonThemeData _textButtonTheme(Brightness brightness) {
    final color = brightness == Brightness.dark ? gold : lightGold;
    return TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: color,
        textStyle: const TextStyle(fontWeight: FontWeight.w800),
      ),
    );
  }

  static ChipThemeData _chipTheme(Brightness brightness) {
    final isDarkMode = brightness == Brightness.dark;
    return ChipThemeData(
      backgroundColor:
          isDarkMode ? Colors.white.withOpacity(0.06) : ink.withOpacity(0.04),
      selectedColor:
          isDarkMode ? gold.withOpacity(0.18) : lightGold.withOpacity(0.16),
      side: BorderSide(
        color:
            isDarkMode ? Colors.white.withOpacity(0.10) : ink.withOpacity(0.08),
      ),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      labelStyle: TextStyle(
        color: isDarkMode ? paper : ink,
        fontWeight: FontWeight.w700,
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
      backgroundColor: brightness == Brightness.dark ? storm : ink,
      contentTextStyle:
          const TextStyle(color: paper, fontWeight: FontWeight.w600),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      behavior: SnackBarBehavior.floating,
    );
  }
}
