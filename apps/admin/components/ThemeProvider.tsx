"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("admin_theme") as Theme;
    if (stored) setTheme(stored);
  }, []);

  useEffect(() => {
    if (mounted) {
      document.documentElement.classList.toggle("light", theme === "light");
      localStorage.setItem("admin_theme", theme);
    }
  }, [theme, mounted]);

  const toggleTheme = () => setTheme(prev => (prev === "dark" ? "light" : "dark"));

  if (!mounted) return <div className="bg-[#07080d] min-h-screen" />;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
};
