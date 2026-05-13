// ─────────────────────────────────────────────────────────────────────────────
// Spacing scale — mirrors Tailwind's default spacing used across the web app.
// Useful for keeping padding/gap consistent between the two surfaces.
// ─────────────────────────────────────────────────────────────────────────────

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
} as const;

export type Spacing = typeof spacing;
