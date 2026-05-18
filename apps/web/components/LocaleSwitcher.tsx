"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Languages, Check } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LocaleProvider";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/messages";

const FLAG: Record<Locale, string> = {
  sv: "🇸🇪",
  en: "🇬🇧",
};

interface LocaleSwitcherProps {
  /**
   * Override för button-styling. Används av home-page-mobil för att matcha
   * theme/kontakta-knapparnas w-9 h-9 rounded-xl-design. Default-stilen
   * (p-2 rounded-full) används av Navbar.
   */
  buttonClassName?: string;
  iconSize?: number;
}

const LocaleSwitcher = ({ buttonClassName, iconSize = 20 }: LocaleSwitcherProps = {}) => {
  const { locale, setLocale, t } = useTranslation();
  const [open, setOpen] = useState(false);
  // Position för portal-renderad dropdown. Räknas ut från knappens
  // getBoundingClientRect vid varje open så menyn alltid hamnar precis
  // under knappen — oavsett parents overflow:hidden eller transform.
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      // Klick utanför button OCH utanför menyn → stäng
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onScroll = () => setOpen(false); // stäng vid scroll så positionen aldrig blir off
    document.addEventListener("mousedown", onClick);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("scroll", onScroll);
    };
  }, [open]);

  const handleToggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 6,
        right: Math.max(8, window.innerWidth - rect.right), // min 8px från höger edge
      });
    }
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className={buttonClassName ?? "p-2 transition-colors rounded-full flex items-center justify-center"}
        style={buttonClassName ? undefined : { backgroundColor: "var(--bg-deep)", color: "var(--text-secondary)" }}
        aria-label={t("nav.locale.label")}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Languages size={iconSize} className="text-gold-600" />
      </button>
      {open && dropdownPos && typeof window !== "undefined" && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-[300] min-w-[160px] rounded-2xl shadow-2xl py-2 border"
          style={{
            top: dropdownPos.top,
            right: dropdownPos.right,
            backgroundColor: "var(--bg-primary)",
            borderColor: "var(--border-muted)",
          }}
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
        </div>,
        document.body,
      )}
    </>
  );
};

export default LocaleSwitcher;
