"use client";

import { useEffect, useState } from "react";
import { Smartphone, X } from "lucide-react";
import "@/components/restaurant/restaurant.css";

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
          className="ve-root fixed left-4 right-4 z-[90] md:hidden"
          style={{ bottom: "calc(7rem + env(safe-area-inset-bottom, 0px))", backgroundColor: "transparent" }}
        >
          <div className="ve-card flex items-center gap-3 px-3.5 py-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ backgroundColor: "var(--ve-accent-soft)", color: "var(--ve-accent)" }}>
              <Smartphone size={17} strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[15px] font-semibold" style={{ color: "var(--ve-ink)", letterSpacing: "-0.01em" }}>Lägg till på hemskärmen</p>
              <p className="m-0 mt-0.5 text-[12.5px] leading-snug" style={{ color: "var(--ve-ink-2)" }}>
                {isIos
                  ? "Tryck på dela-ikonen och välj \"Lägg till på hemskärmen\""
                  : "Öppnas som en app, direkt från hemskärmen"}
              </p>
            </div>
            {!isIos && deferredPrompt && (
              <button
                onClick={handleInstall}
                className="ve-press h-9 shrink-0 rounded-full px-3.5 text-[13.5px] font-semibold"
                style={{ backgroundColor: "var(--ve-cta)", color: "var(--ve-cta-ink)" }}
              >
                Installera
              </button>
            )}
            <button
              onClick={dismiss}
              aria-label="Stäng"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
              style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink-2)" }}
            >
              <X size={14} strokeWidth={2.6} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
