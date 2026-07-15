"use client";

import { createContext, useContext, useEffect } from "react";
import { clearLegacyPlatformUserToken } from "@/lib/platformSessionClient";
import { ToastProvider } from "@/components/Toast";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { useCartStore } from "@/store/cartStore";

// Mörka temat är borttaget — appen är ljus, punkt. useTheme behålls som en
// no-op-shim så befintliga konsumenter (Navbar, cart, AddressModal m.fl.) inte
// behöver röras: theme är alltid "light" och toggleTheme gör ingenting.
type Theme = "light";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const LIGHT_THEME: ThemeContextType = { theme: "light", toggleTheme: () => {} };
const ThemeContext = createContext<ThemeContextType>(LIGHT_THEME);

export const useTheme = () => useContext(ThemeContext);

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    clearLegacyPlatformUserToken();
    // Städa bort ev. gammalt mörkt-tema-val som ligger kvar i en redan
    // installerad PWA, så ingen återbesökare fastnar i dark mode.
    try {
      localStorage.removeItem("viaeats-theme");
      document.documentElement.removeAttribute("data-theme");
    } catch { /* noop */ }

    // Native `storage` events reach the other tabs only. When one tab logs out
    // or switches customer, clear the already-hydrated Zustand cart there too;
    // otherwise its in-memory state could write the previous customer's cart
    // back after the persisted key was removed.
    const onCustomerStorageCleared = (event: StorageEvent) => {
      if (event.key === "viaeats-cart" && event.newValue === null) {
        useCartStore.getState().clearCart();
      }
    };
    window.addEventListener("storage", onCustomerStorageCleared);
    return () => window.removeEventListener("storage", onCustomerStorageCleared);
  }, []);

  return (
    <LocaleProvider>
      <ThemeContext.Provider value={LIGHT_THEME}>
        <ToastProvider>{children}</ToastProvider>
      </ThemeContext.Provider>
    </LocaleProvider>
  );
}
