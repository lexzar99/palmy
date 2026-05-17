"use client";

import { useEffect, useRef, useState } from "react";
import { Languages, Check } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LocaleProvider";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/messages";

const FLAG: Record<Locale, string> = {
  sv: "🇸🇪",
  en: "🇬🇧",
};

const LocaleSwitcher = () => {
  const { locale, setLocale, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-2 transition-colors rounded-full flex items-center justify-center"
        style={{ backgroundColor: "var(--bg-deep)", color: "var(--text-secondary)" }}
        aria-label={t("nav.locale.label")}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Languages size={20} className="text-gold-600" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-[210] min-w-[160px] rounded-2xl shadow-2xl py-2 border"
          style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border-muted)" }}
        >
          {SUPPORTED_LOCALES.map((l) => {
            const active = l === locale;
            return (
              <button
                key={l}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setLocale(l);
                  setOpen(false);
                }}
                className="w-full px-4 py-2 flex items-center gap-3 text-left text-sm font-bold transition-colors hover:bg-gold-500/10"
                style={{ color: active ? "var(--gold-primary, #e7b24b)" : "var(--text-primary)" }}
              >
                <span aria-hidden className="text-base leading-none">{FLAG[l]}</span>
                <span className="flex-1">{t(`nav.locale.${l}`)}</span>
                {active && <Check size={14} className="text-gold-500" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LocaleSwitcher;
