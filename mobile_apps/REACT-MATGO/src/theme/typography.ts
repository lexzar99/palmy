// ─────────────────────────────────────────────────────────────────────────────
// Typography tokens.
//
// Font: web uses 'Outfit' as the brand display font. To keep the RN app
// visually aligned we expose `fontFamily.brand` here. The actual font file is
// loaded in App.tsx with expo-font; until that lands the `brand` value is
// `undefined`, which makes RN gracefully fall back to the system font (San
// Francisco on iOS, Roboto on Android). Once the font is registered the value
// becomes `'Outfit'` and any Text/style that reads it will pick it up.
//
// Set `__OUTFIT_LOADED__` from App.tsx after `useFonts({ Outfit: ... })`
// resolves, or call `setBrandFontLoaded(true)` from the same place.
// ─────────────────────────────────────────────────────────────────────────────

// Mutable so App.tsx can flip it once the font is loaded.
// (RN re-reads style objects on every render, so flipping this is enough.)
let brandFontLoaded = false;

export function setBrandFontLoaded(loaded: boolean) {
  brandFontLoaded = loaded;
}

export const fontFamily = {
  // Returns 'Outfit' once the font has been loaded, otherwise undefined so RN
  // falls back to the platform's system font.
  get brand(): string | undefined {
    return brandFontLoaded ? "Outfit" : undefined;
  },
  // Explicit override for components that need to opt in regardless of state.
  brandName: "Outfit" as const,
  system: undefined as string | undefined,
} as const;

// Font weights mirroring web's tailwind usage.
export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
  extrabold: "800",
  black: "900",
} as const;

export type FontFamily = typeof fontFamily;
export type FontWeight = typeof fontWeight;
