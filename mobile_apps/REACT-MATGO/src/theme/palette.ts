// ─────────────────────────────────────────────────────────────────────────────
// Palette — aligned with the web app's "Silk / Light Luxury" tokens.
// Source of truth: apps/web/app/globals.css (CSS custom properties).
//
// Web uses CSS variables (--bg-primary, --text-primary, etc.) that swap based
// on `data-theme='dark'`. Here we mirror those values into two flat palette
// objects: `lightPalette` and `darkPalette`. The legacy `palette` export
// remains an alias for `lightPalette` so the 33+ existing imports
// (`import { palette } from '../constants/theme'`) keep working unchanged.
//
// Gold scale matches the web's @theme block exactly:
//   gold-400 = #F4D086 (light/highlight)
//   gold-500 = #E7B24B (primary brand gold)
//   gold-600 = #C28E2E (hover / dark variant)
// ─────────────────────────────────────────────────────────────────────────────

export const goldScale = {
  gold400: "#F4D086",
  gold500: "#E7B24B",
  gold600: "#C28E2E",
} as const;

// ── Type contract ───────────────────────────────────────────────────────────
// We declare a structural Palette type up front so light/dark are guaranteed
// to expose the same keys. Without this, `as const` would give each palette
// distinct string-literal types and the two would be unassignable to each
// other in `useTheme()`.
export interface Palette {
  // Brand
  gold: string;
  goldLight: string;
  goldDark: string;

  // Web --bg-* tokens
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;

  // Legacy cream/warm surfaces (kept for backwards compatibility)
  bg: string;
  panel: string;
  panelMuted: string;
  card: string;

  // Borders / dividers
  border: string;
  borderMuted: string;

  // Text
  text: string;
  textPrimary: string;
  textSecondary: string;
  muted: string;

  // Glass surfaces
  glassBg: string;
  glassBorder: string;

  // Skeleton loaders
  skeletonBase: string;
  skeletonHighlight: string;

  // Status
  orange: string;
  success: string;
  danger: string;
  info: string;
}

// Status colors are shared across light/dark (same as web Tailwind defaults).
const sharedStatus = {
  orange: "#FF7A00",
  success: "#16A34A",
  danger: "#DC2626",
  info: "#2563EB",
};

// ── Light palette ────────────────────────────────────────────────────────────
// Mirrors :root { ... } in apps/web/app/globals.css.
// Backwards-compat keys (bg, panel, panelMuted, card, border, text, muted,
// gold, goldDark, skeletonBase, skeletonHighlight) keep their existing names
// so screens and components don't need to change.
export const lightPalette: Palette = {
  // Brand
  gold: goldScale.gold500,      // was #D9B055 — now matches web
  goldLight: goldScale.gold400, // new
  goldDark: goldScale.gold600,  // was #7D6126 — now matches web's gold-600

  // Backgrounds — web's --bg-primary / --bg-secondary / --bg-deep
  bgPrimary: "#FCFCF9",
  bgSecondary: "#FFFFFF",
  bgTertiary: "#F5F5F2",

  // Cream backdrop — kept for legacy gradients/heroes that reference it.
  // The web doesn't use this exact tone, but it's still part of the brand's
  // warm food-photography backdrop and is referenced by screens directly.
  bg: "#FFF8EF",
  panel: "#FFFFFF",
  panelMuted: "#FFF0D8",
  card: "#FFF6E7",

  // Borders / dividers — web --glass-border / --border-muted
  border: "rgba(28,28,30,0.07)",
  borderMuted: "rgba(28,28,30,0.05)",

  // Text — web --text-primary / --text-secondary
  text: "#1C1C1E",
  textPrimary: "#1C1C1E",
  textSecondary: "#6E6E73",
  muted: "#6E6E73", // alias of textSecondary for legacy code

  // Glass / surfaces
  glassBg: "rgba(255,255,255,0.92)",
  glassBorder: "rgba(28,28,30,0.07)",

  // Skeleton (web --skeleton-*)
  skeletonBase: "#EAEAEA",
  skeletonHighlight: "#F5F5F5",

  // Status
  ...sharedStatus,
};

// ── Dark palette ─────────────────────────────────────────────────────────────
// Mirrors [data-theme='dark'] { ... } in apps/web/app/globals.css.
export const darkPalette: Palette = {
  // Brand (gold is identical in dark mode — web doesn't shift it either)
  gold: goldScale.gold500,
  goldLight: goldScale.gold400,
  goldDark: goldScale.gold600,

  // Backgrounds
  bgPrimary: "#09090b",
  bgSecondary: "#18181b",
  bgTertiary: "#09090b",

  // Legacy aliases — map cream tones to dark surfaces
  bg: "#09090b",
  panel: "#18181b",
  panelMuted: "rgba(255,255,255,0.04)",
  card: "rgba(30,30,35,0.95)",

  // Borders / dividers
  border: "rgba(255,255,255,0.05)",
  borderMuted: "rgba(255,255,255,0.04)",

  // Text
  text: "#FFFFFF",
  textPrimary: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.6)",
  muted: "rgba(255,255,255,0.6)",

  // Glass / surfaces
  glassBg: "rgba(24,24,27,0.9)",
  glassBorder: "rgba(255,255,255,0.05)",

  // Skeleton
  skeletonBase: "#27272a",
  skeletonHighlight: "#3f3f46",

  // Status
  ...sharedStatus,
};
