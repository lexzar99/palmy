"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Cookie, X } from "lucide-react";

/**
 * CookieConsent — skitenkel, icke-störande notis i botten. En "OK"-knapp +
 * länk till villkoren. Inga inställningar, ingen info-mur. Persisteras i
 * localStorage så den bara visas en gång per browser.
 */
export default function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("matgo_cookie_consent");
    if (!consent) {
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const accept = () => {
    localStorage.setItem("matgo_cookie_consent", "true");
    setIsVisible(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          // Position: ovanför BottomNav på mobil, i nedre vänster på desktop
          className="fixed left-4 right-4 z-[90] md:left-6 md:right-auto md:max-w-sm pointer-events-none"
          style={{ bottom: "calc(7rem + env(safe-area-inset-bottom, 0px))" }}
        >
          <div
            className="pointer-events-auto flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-xl"
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderColor: "var(--border-muted)",
            }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--bg-deep)" }}>
              <Cookie size={16} className="text-gold-500" />
            </div>
            <p className="flex-1 text-[12px] font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
              Vi använder cookies.{" "}
              <Link href="/terms" className="text-gold-500 hover:text-gold-400 underline whitespace-nowrap">
                Läs villkor
              </Link>
            </p>
            <button
              onClick={accept}
              aria-label="OK, godkänn cookies"
              className="shrink-0 px-4 py-2 bg-gold-500 text-zinc-950 rounded-xl text-[11px] font-black uppercase tracking-widest active:scale-95 transition-transform"
            >
              OK
            </button>
            <button
              onClick={accept}
              aria-label="Stäng"
              className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-white/5"
              style={{ color: "var(--text-secondary)" }}
            >
              <X size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
