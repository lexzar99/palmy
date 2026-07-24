/** Delade typer och parsers för menyredigeraren. */
export type MenuTab = "categories" | "products" | "extras";

export function parseNumberDraft(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseIntegerDraft(value: string): number | null {
  const parsed = parseNumberDraft(value);
  return parsed === null ? null : Math.round(parsed);
}

// Enhetlig monokrom på/av-stil för alla toggle-kontroller i menyeditorn. Aktiv =
// ifylld accent (vit/silver) med kontrast-text, inaktiv = ren kontur. Ingen
// dekorfärg, så valt läge alltid läses lika över hela editorn.
export const toggleOnClass = "border-[var(--brand-navy)] bg-[var(--brand-navy)] text-[var(--brand-cream)]";
export const toggleOffClass = "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]";

/** Plockar serverns felmeddelande ur ett axios-fel utan `as any`. */
export function apiErrorMessage(error: unknown): string | null {
  return (error as { response?: { data?: { error?: string } } } | null)?.response?.data?.error ?? null;
}
