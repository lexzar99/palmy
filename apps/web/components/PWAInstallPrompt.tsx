"use client";

import { useEffect, useState } from "react";
import { Smartphone, X } from "lucide-react";

const VISITS_KEY = "viaeats_visit_count";
const PROMPT_DISMISSED_KEY = "viaeats_pwa_dismissed_at";
const MIN_VISITS = 2;
const DISMISS_COOLDOWN_DAYS = 30;

/**
 * PWAInstallPrompt — mjuk "Lägg till på hemskärm"-prompt för mobile-användare
 * efter minst 2 besök. Visas inte om appen redan körs i standalone-mode
 * (alltså redan installerad). Dismissad → kommer inte tillbaka på 30 dagar.
 *
 * iOS Safari stöder INTE beforeinstallprompt-eventet så vi visar en manuell
 * instruktion istället. Android Chrome använder native-prompten.
 */
export default function PWAInstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Redan installerad? Visa inte.
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) return;

    // Cooldown från senaste dismiss
    const dismissedAt = parseInt(localStorage.getItem(PROMPT_DISMISSED_KEY) || "0", 10);
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000) return;

    // Räkna besök
    const visits = parseInt(localStorage.getItem(VISITS_KEY) || "0", 10) + 1;
    localStorage.setItem(VISITS_KEY, String(visits));
    if (visits < MIN_VISITS) return;

    // Detektera iOS
    const ua = navigator.userAgent || "";
    const isIosDevice = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    setIsIos(isIosDevice);

    // Android Chrome — fånga beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS — visa manuell instruktion efter 4s delay
    if (isIosDevice) {
      const t = setTimeout(() => setVisible(true), 4000);
      return () => {
        clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", handler);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt && typeof deferredPrompt.prompt === "function") {
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch {}
      setDeferredPrompt(null);
    }
    dismiss();
  };

  const dismiss = () => {
    localStorage.setItem(PROMPT_DISMISSED_KEY, String(Date.now()));
    setVisible(false);
  };

  return (
    <>
      {visible && (
        <div
          className="fixed left-4 right-4 md:hidden z-[90]"
          style={{ bottom: "calc(7rem + env(safe-area-inset-bottom, 0px))" }}
        >
          <div
            className="flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-xl"
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderColor: "rgba(212,167,74,0.3)",
            }}
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-gold-500/10 border border-gold-500/20">
              <Smartphone size={16} className="text-gold-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-black uppercase tracking-tight" style={{ color: "var(--text-primary)" }}>
                Lägg till på hemskärm
              </p>
              <p className="text-[10px] font-bold mt-0.5 leading-tight" style={{ color: "var(--text-secondary)" }}>
                {isIos
                  ? "Tryck dela-ikonen och välj \"Lägg till på hemskärmen\""
                  : "Snabbare access — appen öppnas som en app"}
              </p>
            </div>
            {!isIos && deferredPrompt && (
              <button
                onClick={handleInstall}
                className="shrink-0 px-3 py-2 bg-gold-500 text-zinc-950 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-transform"
              >
                Installera
              </button>
            )}
            <button
              onClick={dismiss}
              aria-label="Stäng"
              className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-white/5"
              style={{ color: "var(--text-secondary)" }}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
