// Tema-rotationsmotorn: samma kort får nytt utseende varje vecka, deterministiskt.
// hash(nyckel + ISO-vecka) väljer ur poolen — stabil hela veckan (ingen slump per
// render), ny känsla varje cykel. Admin kan låsa tema per kort (appTheme på Deal,
// theme på sponsorkort) — låst värde vinner alltid över rotationen.

export const THEME_POOL = ['sky', 'ember', 'forest', 'midnight', 'gold'] as const;
export type PulseTheme = (typeof THEME_POOL)[number];

// FNV-1a — samma stabila hash som deal-tilldelningen använder.
const fnv1a = (input: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

export const isoWeekKey = (date = new Date()): string => {
  // ISO 8601-vecka (torsdagen avgör året).
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${week}`;
};

export const dayOfYear = (date = new Date()): number => {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  return Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 86400000);
};

// Veckoroterande tema för en nyckel (t.ex. "deal:<id>", "module:champion").
export const themeForKey = (key: string, date = new Date()): PulseTheme =>
  THEME_POOL[fnv1a(`${key}:${isoWeekKey(date)}`) % THEME_POOL.length];

// Dagsroterande val ur en lista (t.ex. topp-3-champions → dagens).
export const dailyPick = <T>(items: T[], seed: string, date = new Date()): T | null => {
  if (!items.length) return null;
  return items[fnv1a(`${seed}:${dayOfYear(date)}:${date.getFullYear()}`) % items.length];
};

// Dagsstabil poäng för rotation av vilka moduler som visas idag.
export const dailyScore = (key: string, date = new Date()): number =>
  fnv1a(`${key}:${dayOfYear(date)}:${date.getFullYear()}`);
