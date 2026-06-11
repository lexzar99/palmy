"use client";

import { SessionProvider } from "next-auth/react";
import { createContext, useContext, useEffect, useState } from "react";
import { clearLegacyPlatformUserToken } from "@/lib/platformSessionClient";
import { ToastProvider } from "@/components/Toast";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
};

// Synka <meta name="theme-color"> med APPENS tema (inte systemets). Status-
// baren/safe-arean runt dynamic island färgas av denna — med media-baserade
// värden följde den systemtemat, så mörkt system + ljus app gav en svart
// "boxad" yta överst i installerad PWA.
function syncThemeColorMeta(theme: Theme) {
  const color = theme === "dark" ? "#09090b" : "#ffffff";
  // Rensa ev. media-baserade dubbletter och håll EN auktoritativ tagg.
  document.querySelectorAll('meta[name="theme-color"]').forEach((el, i) => {
    if (i > 0) el.remove();
  });
  let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.removeAttribute("media");
  meta.content = color;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    clearLegacyPlatformUserToken();
    const storedTheme = localStorage.getItem("matgo-theme") as Theme;
    if (storedTheme) {
      setTheme(storedTheme);
      document.documentElement.setAttribute("data-theme", storedTheme);
    }
    syncThemeColorMeta(storedTheme || "light");
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    localStorage.setItem("matgo-theme", newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    syncThemeColorMeta(newTheme);
  };

  return (
    <SessionProvider>
      <LocaleProvider>
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
          <ToastProvider>{children}</ToastProvider>
        </ThemeContext.Provider>
      </LocaleProvider>
    </SessionProvider>
  );
}
