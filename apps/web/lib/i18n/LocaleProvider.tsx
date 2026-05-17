"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  detectBrowserLocale,
  messages,
  type Locale,
} from "./messages";

// Cookie istället för bara localStorage så ev. framtida SSR-rendering kan
// läsa locale på server-sidan utan att tappa val. För nu räcker localStorage
// + cookie spegling.
const LOCALE_KEY = "ui-locale";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

const interpolate = (template: string, vars?: Record<string, string | number>) => {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => {
    const v = vars[name];
    return v == null ? match : String(v);
  });
};

const writeLocale = (l: Locale) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCALE_KEY, l);
    document.cookie = `${LOCALE_KEY}=${l}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    document.documentElement.lang = l;
  } catch {
    /* ignorera private-mode/SSR */
  }
};

const readPersistedLocale = (): Locale | null => {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(LOCALE_KEY);
    if (v && SUPPORTED_LOCALES.includes(v as Locale)) return v as Locale;
    const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${LOCALE_KEY}=([^;]+)`));
    if (m && SUPPORTED_LOCALES.includes(m[1] as Locale)) return m[1] as Locale;
  } catch { /* ignore */ }
  return null;
};

export const LocaleProvider = ({ children }: { children: React.ReactNode }) => {
  // Starta med DEFAULT_LOCALE för SSR-kompabilitet (samma render server/klient).
  // Justera till browser-locale / persisted i useEffect efter mount.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const persisted = readPersistedLocale();
    const initial = persisted ?? detectBrowserLocale();
    if (initial !== locale) setLocaleState(initial);
    // Säkerställ att <html lang> är korrekt även när vi behöll default.
    if (typeof document !== "undefined") document.documentElement.lang = initial;
    if (!persisted) writeLocale(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    writeLocale(l);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const tableForLocale = messages[locale] ?? messages[DEFAULT_LOCALE];
      const raw = tableForLocale[key] ?? messages[DEFAULT_LOCALE][key] ?? key;
      return interpolate(raw, vars);
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
};

export const useTranslation = () => {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    // Fallback för komponenter som råkar renderas utanför provider — t.ex.
    // en error-page som monteras innan layout-trädet. Vi returnerar då en
    // no-provider implementation som bara läser default-svenska.
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: (key: string, vars?: Record<string, string | number>) => interpolate(messages[DEFAULT_LOCALE][key] ?? key, vars),
    } as LocaleContextValue;
  }
  return ctx;
};
