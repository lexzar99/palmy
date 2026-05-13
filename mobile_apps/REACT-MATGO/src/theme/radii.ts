// ─────────────────────────────────────────────────────────────────────────────
// Border radii — aligned with the web app's scale.
// Web uses Tailwind's rounded-{sm,md,lg,xl,2xl,full} (8 / 10 / 14 / 18 / 22 px).
// RN previously used 12–30px which felt heavier than the web. The new scale
// brings cards and chips visually closer to the web counterparts.
// ─────────────────────────────────────────────────────────────────────────────

export const radii = {
  sm: 8,
  md: 10,
  lg: 14,
  xl: 18,
  "2xl": 22,
  pill: 999,
} as const;

export type Radii = typeof radii;
