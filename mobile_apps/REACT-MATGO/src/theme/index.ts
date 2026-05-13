// ─────────────────────────────────────────────────────────────────────────────
// Theme barrel — single import point for tokens and the theme provider.
//
// Usage:
//   import { palette, radii, spacing, useTheme } from "@/theme";
//
// `palette` exported from here is the LIGHT palette (= the previous flat
// palette object) for backwards-compatibility with code that imports it
// directly. For dark-mode-aware components use `useTheme()` instead.
// ─────────────────────────────────────────────────────────────────────────────

export { lightPalette, darkPalette, goldScale, type Palette } from "./palette";
export { lightPalette as palette } from "./palette";
export { radii, type Radii } from "./radii";
export { spacing, type Spacing } from "./spacing";
export {
  fontFamily,
  fontWeight,
  setBrandFontLoaded,
  type FontFamily,
  type FontWeight,
} from "./typography";
export {
  ThemeProvider,
  useTheme,
  useThemeMode,
  type Theme,
  type ThemeMode,
  type ResolvedThemeMode,
} from "./ThemeProvider";
