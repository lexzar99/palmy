"use client";

import { useState, useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { Cookie, X, Check, Sliders, Shield } from "lucide-react";

/**
 * CookieConsent — GDPR-kompatibel samtyckesbanner.
 *
 * Tre tillstånd som persisteras i `localStorage.viaeats_cookie_consent`:
 *
 *   "accepted"        Alla kategorier (inkl. analys/Sentry).
 *   "essential-only"  Endast tekniskt nödvändiga cookies (session/cart/auth).
 *   "rejected"        Sammanblandning av "essential-only" — nödvändiga får
 *                     fortfarande sättas (annars går t.ex. cart inte att
 *                     använda), men inget analytics/marketing tracking sker.
 *
 * Saknat värde ≈ "essential-only" (banner inte besvarad än) — sentry init:as
 * först när användaren explicit klickat "Acceptera alla".
 *
 * Sentry-gating: `apps/web/instrumentation-client.ts` lyssnar på
 * `window` event:et `viaeats:cookie-consent` och init:ar Sentry lazy om värdet
 * är `"accepted"`. Vid `"essential-only"` / `"rejected"` händer ingenting.
 */

type Consent = "accepted" | "essential-only" | "rejected";
const STORAGE_KEY = "viaeats_cookie_consent";
const CONSENT_EVENT = "viaeats:cookie-consent";

function readConsent(): Consent | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "accepted" || v === "essential-only" || v === "rejected")
      return v;
    // Backåtkomp: gamla bannern lagrade "true" — behandla som "accepted".
    if (v === "true") return "accepted";
    return null;
  } catch {
    return null;
  }
}

function readServerConsent(): Consent {
  // Rendera inte bannern i server-HTML; klienten visar den efter hydration om
  // inget samtycke finns lagrat.
  return "essential-only";
}

function subscribeConsent(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener(CONSENT_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CONSENT_EVENT, callback);
  };
}

function writeConsent(value: Consent) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // localStorage kan vara blockerad — vi ger inte upp men banner kommer
    // dyka upp nästa session istället.
  }
  try {
    window.dispatchEvent(new Event(CONSENT_EVENT));
  } catch {
    // Event constructor finns i alla moderna browsers; skydda mot SSR/edge.
  }
}

export default function CookieConsent() {
  const consent = useSyncExternalStore(
    subscribeConsent,
    readConsent,
    readServerConsent,
  );
  const [isDismissed, setIsDismissed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // Granulära toggles i settings-modalen. Essential är alltid på.
  const [allowAnalytics, setAllowAnalytics] = useState(false);
  const [allowMarketing, setAllowMarketing] = useState(false);

  const close = useCallback(() => {
    setIsDismissed(true);
    setShowSettings(false);
  }, []);

  const acceptAll = useCallback(() => {
    writeConsent("accepted");
    close();
  }, [close]);

  const acceptEssential = useCallback(() => {
    writeConsent("essential-only");
    close();
  }, [close]);

  const reject = useCallback(() => {
    writeConsent("rejected");
    close();
  }, [close]);

  const saveSettings = useCallback(() => {
    // Map toggle-state → consent. Om båda är på = accepted.
    // Annars essential-only (marketing utan analytics är inget meningsfullt
    // scenario hos oss idag — placeholder för framtiden).
    if (allowAnalytics && allowMarketing) writeConsent("accepted");
    else if (allowAnalytics) writeConsent("accepted");
    else writeConsent("essential-only");
    close();
  }, [allowAnalytics, allowMarketing, close]);

  if (consent !== null || isDismissed) return null;

  return (
    <>
      {/* Settings-modal (öppnas via "Inställningar" på bannern) */}
      {showSettings && (
        <div
          // z-[110] så vi ligger ovanför BottomNav (z-100) på mobil
          className="fixed inset-0 z-[110] flex items-end md:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cookie-settings-title"
          aria-describedby="cookie-settings-description"
        >
          <div
            className="w-full max-w-lg rounded-3xl border p-6 shadow-2xl space-y-5"
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderColor: "var(--border-muted)",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: "var(--bg-deep)" }}
                >
                  <Shield size={18} className="text-gold-500" />
                </div>
                <h2
                  id="cookie-settings-title"
                  className="text-lg font-black uppercase italic tracking-tight"
                  style={{ color: "var(--text-primary)" }}
                >
                  Cookie-inställningar
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                aria-label="Stäng inställningar"
                className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-white/5"
                style={{ color: "var(--text-secondary)" }}
              >
                <X size={16} />
              </button>
            </div>

            <p
              id="cookie-settings-description"
              className="text-[12px] leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              Välj vilka kategorier av cookies du tillåter. Du kan ändra ditt
              val när som helst. Läs mer i vår{" "}
              <Link href="/privacy" className="text-gold-500 underline">
                integritetspolicy
              </Link>
              .
            </p>

            <div className="space-y-3">
              {/* Nödvändiga — alltid på */}
              <div
                className="rounded-2xl border p-4"
                style={{
                  backgroundColor: "var(--bg-deep)",
                  borderColor: "var(--border-muted)",
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <div
                    className="text-[13px] font-black"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Nödvändiga
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-gold-500">
                    Alltid på
                  </span>
                </div>
                <p
                  className="text-[11px] leading-snug"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Session, varukorg och inloggning. Utan dessa fungerar inte
                  beställningen.
                </p>
              </div>

              {/* Analys */}
              <button
                type="button"
                onClick={() => setAllowAnalytics((v) => !v)}
                aria-pressed={allowAnalytics}
                className="w-full text-left rounded-2xl border p-4 transition-colors"
                style={{
                  backgroundColor: "var(--bg-deep)",
                  borderColor: allowAnalytics
                    ? "rgba(240,83,28,0.4)"
                    : "var(--border-muted)",
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <div
                    className="text-[13px] font-black"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Analys
                  </div>
                  <span
                    aria-hidden
                    className="w-10 h-6 rounded-full flex items-center transition-colors px-0.5"
                    style={{
                      backgroundColor: allowAnalytics
                        ? "var(--gold-500, #F0531C)"
                        : "var(--border-muted)",
                    }}
                  >
                    <span
                      className="w-5 h-5 rounded-full bg-white transition-transform"
                      style={{
                        transform: allowAnalytics
                          ? "translateX(16px)"
                          : "translateX(0)",
                      }}
                    />
                  </span>
                </div>
                <p
                  className="text-[11px] leading-snug"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Sentry för felrapportering och prestandamätning. Hjälper oss
                  laga buggar.
                </p>
              </button>

              {/* Marknadsföring */}
              <button
                type="button"
                onClick={() => setAllowMarketing((v) => !v)}
                aria-pressed={allowMarketing}
                className="w-full text-left rounded-2xl border p-4 transition-colors"
                style={{
                  backgroundColor: "var(--bg-deep)",
                  borderColor: allowMarketing
                    ? "rgba(240,83,28,0.4)"
                    : "var(--border-muted)",
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <div
                    className="text-[13px] font-black"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Marknadsföring
                  </div>
                  <span
                    aria-hidden
                    className="w-10 h-6 rounded-full flex items-center transition-colors px-0.5"
                    style={{
                      backgroundColor: allowMarketing
                        ? "var(--gold-500, #F0531C)"
                        : "var(--border-muted)",
                    }}
                  >
                    <span
                      className="w-5 h-5 rounded-full bg-white transition-transform"
                      style={{
                        transform: allowMarketing
                          ? "translateX(16px)"
                          : "translateX(0)",
                      }}
                    />
                  </span>
                </div>
                <p
                  className="text-[11px] leading-snug"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Placeholder. Vi använder inga marknadsförings-cookies idag.
                </p>
              </button>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={reject}
                className="flex-1 py-3 rounded-2xl border text-[11px] font-black uppercase tracking-widest transition-all active:scale-95"
                style={{
                  backgroundColor: "transparent",
                  borderColor: "var(--border-muted)",
                  color: "var(--text-secondary)",
                }}
              >
                Avvisa alla
              </button>
              <button
                type="button"
                onClick={saveSettings}
                className="flex-1 py-3 rounded-2xl bg-gold-500 text-zinc-950 text-[11px] font-black uppercase tracking-widest active:scale-95 transition-all"
              >
                Spara val
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Huvudbanner */}
      <div
        // Position: ovanför BottomNav på mobil, i nedre vänster på desktop
        className="fixed left-3 right-3 z-[90] md:left-6 md:right-auto md:w-[min(32rem,calc(100vw-3rem))] pointer-events-none"
        style={{ bottom: "calc(7rem + env(safe-area-inset-bottom, 0px))" }}
        role="region"
        aria-label="Cookie-samtycke"
      >
        <div
          className="pointer-events-auto rounded-2xl border shadow-lg overflow-hidden"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--border-muted)",
          }}
        >
          <div className="p-3 sm:p-4 space-y-3">
            <div className="flex items-start gap-2.5">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: "var(--bg-deep)" }}
              >
                <Cookie size={16} className="text-gold-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="text-[12px] font-black uppercase tracking-tight"
                  style={{ color: "var(--text-primary)" }}
                >
                  Cookies
                </div>
                <p
                  className="text-[11px] leading-tight"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Nödvändiga cookies håller varukorg och inloggning igång.
                  Analys används bara om du samtycker.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={acceptAll}
                className="min-h-10 rounded-xl bg-gold-500 text-zinc-950 text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-1.5"
              >
                <Check size={13} /> Acceptera
              </button>
              <button
                type="button"
                onClick={acceptEssential}
                className="min-h-10 rounded-xl border text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
                style={{
                  backgroundColor: "var(--bg-deep)",
                  borderColor: "var(--border-muted)",
                  color: "var(--text-primary)",
                }}
              >
                Nödvändiga
              </button>
              <button
                type="button"
                onClick={reject}
                className="min-h-10 rounded-xl border text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
                style={{
                  backgroundColor: "transparent",
                  borderColor: "var(--border-muted)",
                  color: "var(--text-secondary)",
                }}
              >
                Avvisa
              </button>
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="min-h-10 rounded-xl border text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-1.5"
                style={{
                  backgroundColor: "transparent",
                  borderColor: "var(--border-muted)",
                  color: "var(--text-secondary)",
                }}
              >
                <Sliders size={12} /> Val
              </button>
            </div>

            <Link
              href="/privacy"
              className="inline-flex text-[10px] font-black uppercase tracking-widest transition-colors hover:text-gold-500"
              style={{ color: "var(--text-secondary)" }}
            >
              Integritetspolicy
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
