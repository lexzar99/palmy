import 'package:flutter/material.dart';

/// Levera Business — "Ember Studio" redesign.
///
/// Levera Business — guld-accent (#E7B24B) på rent off-white (light) eller
/// neutral svärta (dark), enligt Levera Brand Identity Guide v1.0. Guldskala
/// #F4D086 / #E7B24B / #C28E2E. Light är rent/neutralt — guldet är enda värmen.
/// Behåller alla legacy const-namn (gold, brandGold, deepSea, etc.) för bakåtkomp.
class AppTheme {
  // ── Dark — warm ink ────────────────────────────────────────────────────────
  static const Color midnight = Color(0xFF09090B); // bg-page (neutral svärta)
  static const Color storm = Color(0xFF0E0E10); // bg-primary
  static const Color deepSea = Color(0xFF18181B); // bg-panel (Levera dark yta)
  static const Color steel = Color(0xFF202024); // bg-panel-elevated

  // ── Light — Levera off-white ────────────────────────────────────────────────
  static const Color paper = Color(0xFFFFFFFF); // Yta/Kort
  static const Color mist = Color(0xFFFCFCF9); // BG/Primär (off-white)
  static const Color frost = Color(0xFFF5F5F2); // BG/Djup (subtila sektioner)
  static const Color ink = Color(0xFF1C1C1E); // Text/Primär
  static const Color mutedInk = Color(0xFF6E6E73); // Text/Sekundär

  // ── Accent — Levera guldskala ("ember"-alias bibehållet) ────────────────────
  // Legacy names kept (gold/lightGold/goldAccent/brandGold) – pekar på guldet.
  static const Color ember = Color(0xFFE7B24B); // Gold/Primär — märke, CTA, accent
  static const Color emberDeep = Color(0xFFC28E2E); // Gold/Djup — hover, gradient-botten
  static const Color emberSoft = Color(0xFFF4D086); // Gold/Highlight — glow, ljusa stopp

  static const Color gold = ember; // legacy alias
  static const Color goldAccent = emberSoft; // legacy alias
  static const Color lightGold =
      emberDeep; // legacy alias (used for light theme primary)

  /// Pickup-accent. Warm amber.
  static const Color brandGold = ember;
  static const Color brandGoldSoft = emberSoft;
  static const Color creamBg = Color(0x14E7B24B);
  static const Color creamPill = Color(0x26E7B24B);

  /// Delivery-accent. Cool sky för semantisk skillnad.
  static const Color brandBlue = Color(0xFF38BDF8);
  static const Color blueTint = Color(0x1438BDF8);
  static const Color blueTintPill = Color(0x2638BDF8);

  // ── Status ────────────────────────────────────────────────────────────────
  static const Color success = Color(0xFF16A34A); // grön — bekräftat/levererat
  static const Color danger = Color(0xFFDC2626); // röd — fel/ångra
  static const Color warning = Color(0xFFFF7A00); // orange — obs/kampanj
  static const Color info = Color(0xFF2563EB); // blå — info/länkar
  static const Color lavender = Color(0xFFC084FC);
  // Lila — förbeställningar (scheduledFor). Egen accent skild från blå/guld.
  static const Color preorder = Color(0xFF8B5CF6);

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

  /// Shell-gradient. Dark = warm ink, light = paper cream — båda subtila.
  static LinearGradient shellGradient(BuildContext context) {
    if (isDark(context)) {
      return const LinearGradient(
        colors: [Color(0xFF09090B), Color(0xFF101013)],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      );
    }
    return const LinearGradient(
      colors: [Color(0xFFFCFCF9), Color(0xFFF5F5F2)],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    );
  }

  static Color panelColor(BuildContext context) {
    return isDark(context) ? deepSea : paper;
  }

  static Color elevatedPanelColor(BuildContext context) {
    return isDark(context) ? steel : paper;
  }

  static Color mutedColor(BuildContext context) {
    return isDark(context) ? const Color(0xFF9C9CA3) : mutedInk;
  }

  static Color faintColor(BuildContext context) {
    return isDark(context)
        ? Colors.white.withOpacity(0.04)
        : ink.withOpacity(0.04);
  }

  static Color borderColor(BuildContext context, {Color? tint}) {
    if (tint != null) return tint.withOpacity(isDark(context) ? 0.22 : 0.18);
    return isDark(context)
        ? Colors.white.withOpacity(0.07)
        : ink.withOpacity(0.12);
  }

  /// Panel-dekoration. 18px hörn (rundare än tidigare). Subtila skuggor i light.
  static BoxDecoration panelDecoration(
    BuildContext context, {
    Color? tint,
    double radius = 18,
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
                color: const Color(0xFF0F1115).withOpacity(0.06),
                blurRadius: 14,
                offset: const Offset(0, 4),
              ),
            ],
    );
  }

  static ThemeData _buildDarkTheme() {
    const scheme = ColorScheme(
      brightness: Brightness.dark,
      primary: ember,
      onPrimary: ink,
      secondary: brandBlue,
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
      inversePrimary: emberDeep,
      surfaceTint: ember,
    );

    final base = ThemeData.dark(useMaterial3: true);
    final textTheme = _buildTextTheme(base.textTheme, Brightness.dark);

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: scheme,
      primaryColor: ember,
      scaffoldBackgroundColor: Colors.transparent,
      canvasColor: midnight,
      cardColor: deepSea,
      dividerColor: Colors.white.withOpacity(0.07),
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
        background: ember,
        foreground: ink,
      ),
      outlinedButtonTheme: _outlinedButtonTheme(Brightness.dark),
      textButtonTheme: _textButtonTheme(Brightness.dark),
      chipTheme: _chipTheme(Brightness.dark),
      switchTheme: _switchTheme(ember),
      snackBarTheme: _snackBarTheme(Brightness.dark),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: Colors.transparent,
        indicatorColor: ember.withOpacity(0.18),
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => textTheme.labelSmall?.copyWith(
            color: states.contains(WidgetState.selected)
                ? ember
                : Colors.white.withOpacity(0.55),
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
            IconThemeData(color: Colors.white.withOpacity(0.55)),
        selectedLabelTextStyle: textTheme.labelSmall?.copyWith(color: ember),
        unselectedLabelTextStyle: textTheme.labelSmall
            ?.copyWith(color: Colors.white.withOpacity(0.52)),
        indicatorColor: ember,
      ),
      tabBarTheme: TabBarTheme(
        indicatorColor: ember,
        labelColor: ember,
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
          borderRadius: BorderRadius.circular(18),
          side: BorderSide(color: Colors.white.withOpacity(0.07)),
        ),
      ),
      dialogTheme: DialogTheme(
        backgroundColor: steel,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      ),
    );
  }

  static ThemeData _buildLightTheme() {
    const scheme = ColorScheme(
      brightness: Brightness.light,
      primary: emberDeep,
      onPrimary: paper,
      secondary: brandBlue,
      onSecondary: paper,
      error: danger,
      onError: paper,
      surface: paper,
      onSurface: ink,
      tertiary: lavender,
      onTertiary: paper,
      outline: Color(0x26181A20),
      outlineVariant: Color(0x14181A20),
      shadow: Color(0x14000000),
      scrim: Color(0x33000000),
      inverseSurface: ink,
      onInverseSurface: paper,
      inversePrimary: ember,
      surfaceTint: emberDeep,
    );

    final base = ThemeData.light(useMaterial3: true);
    final textTheme = _buildTextTheme(base.textTheme, Brightness.light);

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: scheme,
      primaryColor: emberDeep,
      scaffoldBackgroundColor: Colors.transparent,
      canvasColor: mist,
      cardColor: paper,
      dividerColor: ink.withOpacity(0.12),
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
        background: emberDeep,
        foreground: paper,
      ),
      outlinedButtonTheme: _outlinedButtonTheme(Brightness.light),
      textButtonTheme: _textButtonTheme(Brightness.light),
      chipTheme: _chipTheme(Brightness.light),
      switchTheme: _switchTheme(emberDeep),
      snackBarTheme: _snackBarTheme(Brightness.light),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: paper,
        indicatorColor: emberDeep.withOpacity(0.16),
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => textTheme.labelSmall?.copyWith(
            color: states.contains(WidgetState.selected) ? emberDeep : mutedInk,
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
            textTheme.labelSmall?.copyWith(color: emberDeep),
        unselectedLabelTextStyle:
            textTheme.labelSmall?.copyWith(color: mutedInk),
        indicatorColor: emberDeep,
      ),
      tabBarTheme: TabBarTheme(
        indicatorColor: emberDeep,
        labelColor: emberDeep,
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
          borderRadius: BorderRadius.circular(18),
          side: BorderSide(color: ink.withOpacity(0.07)),
        ),
      ),
      dialogTheme: DialogTheme(
        backgroundColor: paper,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      ),
    );
  }

  /// Editorial typography — large hierarchies, generous spacing.
  static TextTheme _buildTextTheme(TextTheme base, Brightness brightness) {
    final bodyColor = brightness == Brightness.dark ? paper : ink;
    final secondary =
        brightness == Brightness.dark ? const Color(0xFF9C9CA3) : mutedInk;

    return base.copyWith(
      displayLarge: base.displayLarge?.copyWith(
        fontSize: 64,
        fontWeight: FontWeight.w800,
        color: bodyColor,
        letterSpacing: -2.0,
        height: 0.98,
      ),
      displayMedium: base.displayMedium?.copyWith(
        fontSize: 48,
        fontWeight: FontWeight.w800,
        color: bodyColor,
        letterSpacing: -1.4,
        height: 1.0,
      ),
      displaySmall: base.displaySmall?.copyWith(
        fontSize: 36,
        fontWeight: FontWeight.w700,
        color: bodyColor,
        letterSpacing: -0.8,
        height: 1.05,
      ),
      headlineLarge: base.headlineLarge?.copyWith(
        fontSize: 30,
        fontWeight: FontWeight.w700,
        color: bodyColor,
        letterSpacing: -0.5,
        height: 1.15,
      ),
      headlineMedium: base.headlineMedium?.copyWith(
        fontSize: 24,
        fontWeight: FontWeight.w700,
        color: bodyColor,
        letterSpacing: -0.4,
        height: 1.2,
      ),
      headlineSmall: base.headlineSmall?.copyWith(
        fontSize: 20,
        fontWeight: FontWeight.w700,
        color: bodyColor,
        letterSpacing: -0.3,
        height: 1.25,
      ),
      titleLarge: base.titleLarge?.copyWith(
        fontSize: 18,
        fontWeight: FontWeight.w700,
        color: bodyColor,
        letterSpacing: -0.2,
      ),
      titleMedium: base.titleMedium?.copyWith(
        fontSize: 15,
        fontWeight: FontWeight.w600,
        color: bodyColor,
      ),
      titleSmall: base.titleSmall?.copyWith(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: bodyColor,
      ),
      bodyLarge: base.bodyLarge?.copyWith(
        fontSize: 15,
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
        fontSize: 13,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.2,
      ),
      labelMedium: base.labelMedium?.copyWith(
        fontSize: 11,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.8,
      ),
      labelSmall: base.labelSmall?.copyWith(
        fontSize: 10,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.6,
      ),
    );
  }

  static InputDecorationTheme _inputDecorationTheme(Brightness brightness) {
    final isDarkMode = brightness == Brightness.dark;
    final fill = isDarkMode ? steel : paper;
    final border =
        isDarkMode ? Colors.white.withOpacity(0.08) : ink.withOpacity(0.08);
    final labelColor = isDarkMode ? const Color(0xFF9C9CA3) : mutedInk;

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
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: border, width: 1),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(
          color: isDarkMode ? ember : emberDeep,
          width: 1.5,
        ),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: danger, width: 1.2),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
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
        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 16),
        textStyle: const TextStyle(
          fontWeight: FontWeight.w700,
          letterSpacing: 0.2,
          fontSize: 15,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
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
              : ink.withOpacity(0.12),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    );
  }

  static TextButtonThemeData _textButtonTheme(Brightness brightness) {
    final color = brightness == Brightness.dark ? ember : emberDeep;
    return TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: color,
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    );
  }

  static ChipThemeData _chipTheme(Brightness brightness) {
    final isDarkMode = brightness == Brightness.dark;
    return ChipThemeData(
      backgroundColor:
          isDarkMode ? Colors.white.withOpacity(0.04) : ink.withOpacity(0.04),
      selectedColor:
          isDarkMode ? ember.withOpacity(0.18) : emberDeep.withOpacity(0.14),
      side: BorderSide(
        color:
            isDarkMode ? Colors.white.withOpacity(0.08) : ink.withOpacity(0.06),
      ),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      labelStyle: TextStyle(
        color: isDarkMode ? paper : ink,
        fontWeight: FontWeight.w600,
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
            ? activeColor.withOpacity(0.32)
            : Colors.grey.withOpacity(0.18),
      ),
    );
  }

  static SnackBarThemeData _snackBarTheme(Brightness brightness) {
    return SnackBarThemeData(
      backgroundColor: brightness == Brightness.dark ? steel : ink,
      contentTextStyle:
          const TextStyle(color: paper, fontWeight: FontWeight.w500),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      behavior: SnackBarBehavior.floating,
    );
  }
}
