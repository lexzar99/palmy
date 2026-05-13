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

import React from "react";

import { useTheme } from "./ThemeProvider";
import { makeSharedStyles } from "../constants/theme";

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

/**
 * useSharedStyles — palette-driven version of the legacy `styles` StyleSheet
 * exported from `src/constants/theme`. Returns the same set of style keys,
 * but built from the currently-active palette so dark mode actually works.
 *
 * Usage:
 *   const styles = useSharedStyles();
 *   ...
 *   <View style={styles.safe} />
 */
export function useSharedStyles() {
  const { palette } = useTheme();
  return React.useMemo(() => makeSharedStyles(palette), [palette]);
}
