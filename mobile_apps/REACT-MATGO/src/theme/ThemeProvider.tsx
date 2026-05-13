// ─────────────────────────────────────────────────────────────────────────────
// ThemeProvider — runtime theme context for the RN app.
//
// Components can either:
//   1. Continue importing the static `palette` (= lightPalette) for now, OR
//   2. Subscribe to the active theme via `const { palette, mode } = useTheme()`
//      once they get migrated to dark-mode-aware styles.
//
// The provider defaults to `'system'`, meaning it follows the OS's color
// scheme via RN's `useColorScheme()`. Users can override that later through
// a settings screen by calling `setMode('light' | 'dark' | 'system')`.
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useColorScheme } from "react-native";

import { darkPalette, lightPalette, type Palette } from "./palette";
import { radii, type Radii } from "./radii";
import { spacing, type Spacing } from "./spacing";
import { fontFamily, fontWeight, type FontFamily, type FontWeight } from "./typography";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedThemeMode = "light" | "dark";

export interface Theme {
  mode: ResolvedThemeMode;
  palette: Palette;
  radii: Radii;
  spacing: Spacing;
  fontFamily: FontFamily;
  fontWeight: FontWeight;
}

interface ThemeContextValue extends Theme {
  // The user's preference (may be 'system'); `mode` above is the resolved one.
  preference: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: React.ReactNode;
  // Optional initial preference — defaults to following the OS.
  initialMode?: ThemeMode;
}

export function ThemeProvider({ children, initialMode = "system" }: ThemeProviderProps) {
  const [preference, setPreference] = useState<ThemeMode>(initialMode);
  const systemScheme = useColorScheme();

  const resolved: ResolvedThemeMode =
    preference === "system" ? (systemScheme === "dark" ? "dark" : "light") : preference;

  const setMode = useCallback((mode: ThemeMode) => {
    setPreference(mode);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode: resolved,
      palette: resolved === "dark" ? darkPalette : lightPalette,
      radii,
      spacing,
      fontFamily,
      fontWeight,
      preference,
      setMode,
    }),
    [resolved, preference, setMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * useTheme — returns the active theme (palette, radii, spacing, fontFamily).
 *
 * Safe to call without a <ThemeProvider> wrapper: in that case it falls back
 * to the OS-detected color scheme and returns a "live" theme based on it.
 * This means existing components can adopt it incrementally — they don't
 * have to wait for App.tsx to be wrapped in <ThemeProvider>.
 */
export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  const systemScheme = useColorScheme();

  if (ctx) {
    return {
      mode: ctx.mode,
      palette: ctx.palette,
      radii: ctx.radii,
      spacing: ctx.spacing,
      fontFamily: ctx.fontFamily,
      fontWeight: ctx.fontWeight,
    };
  }

  const fallbackMode: ResolvedThemeMode = systemScheme === "dark" ? "dark" : "light";
  return {
    mode: fallbackMode,
    palette: fallbackMode === "dark" ? darkPalette : lightPalette,
    radii,
    spacing,
    fontFamily,
    fontWeight,
  };
}

/**
 * useThemeMode — returns the current preference and a setter. Throws if used
 * outside a <ThemeProvider>, because changing the mode without a provider
 * would be a no-op.
 */
export function useThemeMode(): { preference: ThemeMode; mode: ResolvedThemeMode; setMode: (m: ThemeMode) => void } {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useThemeMode must be used inside <ThemeProvider>");
  }
  return { preference: ctx.preference, mode: ctx.mode, setMode: ctx.setMode };
}
