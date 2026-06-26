// Tema-val (mörkt/ljust) som persisteras i localStorage och appliceras som
// data-theme på <html>. Initialt sätts attributet av en inline-skript i
// root-layouten innan paint (ingen tema-flimmer); denna modul sköter runtime-
// växlingen efter hydration.
export type Theme = "dark" | "light";

export const THEME_KEY = "admin:theme";

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function setStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = theme;
  }
}
