"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { BadgePercent, Home, Search, ShoppingBag, User } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { useTranslation } from "@/lib/i18n/LocaleProvider";
import { useEffect, useState } from "react";
import "@/components/restaurant/restaurant.css";

/**
 * BottomNav — flikrad i designsystemet (docs/DESIGN_SYSTEM.md): frostat glas,
 * hårfin topplinje, fem lika breda flikar med ikon + etikett. Aktiv flik i
 * bläck, övriga i ink-3, antalsbadge i accent.
 *
 * Döljs (glider ner) när ett textfält har fokus: iOS lägger annars den fasta
 * raden ovanpå tangentbordet där den hoppar och täcker fältet. Döljs också på
 * restaurang-, embed- och spårningssidor där en egen bottenyta tar över.
 */
const EDITABLE = "input, textarea, select, [contenteditable=''], [contenteditable='true']";

const BottomNav = () => {
  const pathname = usePathname();
  const { t } = useTranslation();
  const items = useCartStore((state) => state.items);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const [embedQuery, setEmbedQuery] = useState(false);
  useEffect(() => {
    setEmbedQuery(new URLSearchParams(window.location.search).get("embed") === "1");
  }, [pathname]);

  // Tangentbord uppe → göm raden. Fördröjd återvisning så den inte blinkar
  // när fokus flyttas mellan två fält.
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    let timer: number | undefined;
    const isEditable = (el: EventTarget | null) => el instanceof Element && el.matches(EDITABLE) && !(el as HTMLInputElement).readOnly;
    const onFocusIn = (e: FocusEvent) => {
      if (!isEditable(e.target)) return;
      window.clearTimeout(timer);
      setTyping(true);
    };
    const onFocusOut = (e: FocusEvent) => {
      if (!isEditable(e.target)) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setTyping(false), 180);
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.clearTimeout(timer);
    };
  }, []);

  const embedSurface = embedQuery &&
    (pathname === "/cart" || pathname === "/orders" || pathname?.startsWith("/order/"));
  const hidden = typing
    || pathname?.startsWith("/restaurants/")
    || pathname?.startsWith("/embed/")
    || pathname?.startsWith("/order/")
    || embedSurface
    || false;

  const navItems = [
    { href: "/", label: t("nav.home"), icon: Home },
    { href: "/search", label: t("nav.search"), icon: Search },
    { href: "/deals", label: t("nav.deals"), icon: BadgePercent },
    { href: "/cart", label: t("nav.cart"), icon: ShoppingBag, count: itemCount },
    { href: "/profile", label: t("nav.account"), icon: User },
  ];

  if (pathname === "/for-restauranger" || pathname === "/tipsa" || pathname?.startsWith("/tipsa/")) return null;

  return (
    <nav
      className="ve-root ve-glass fixed left-0 right-0 bottom-0 z-[100] md:hidden flex transition-[transform,opacity] duration-300 ease-out"
      style={{
        boxShadow: "inset 0 0.5px 0 var(--ve-line)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        // iOS Safari: transform bara när raden göms — annars följer den inte
        // visual-viewporten när verktygsfältet dras in vid scroll.
        transform: hidden ? "translateY(110%)" : undefined,
        opacity: hidden ? 1 : 1,
        pointerEvents: hidden ? "none" : undefined,
      }}
      aria-hidden={hidden}
    >
      {/* Täcker glipan mellan raden och skärmkanten när Safaris verktygsfält krymper. */}
      <span aria-hidden="true" className="pointer-events-none absolute left-0 right-0 top-full ve-glass" style={{ height: "100vh" }} />
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || (item.href !== "/" && pathname?.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            aria-current={isActive ? "page" : undefined}
            className="relative flex-1 touch-manipulation"
          >
            <div className="flex h-[54px] flex-col items-center justify-center gap-[3px]">
              <span className="relative">
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2.2 : 1.8}
                  className="shrink-0 transition-colors duration-150"
                  style={{ color: isActive ? "var(--ve-ink)" : "var(--ve-ink-3)" }}
                />
                <AnimatePresence>
                  {item.count !== undefined && item.count > 0 && (
                    <motion.span
                      key={item.count}
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.4, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 700, damping: 18 }}
                      className="ve-tabular absolute -top-1.5 -right-2.5 min-w-[17px] h-[17px] px-1 rounded-full text-[10.5px] font-semibold grid place-items-center"
                      style={{ backgroundColor: "var(--ve-accent)", color: "#fff", boxShadow: "0 0 0 2px rgba(245,245,247,0.9)" }}
                    >
                      {item.count}
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
              <span
                className="max-w-full truncate text-[10px] leading-none transition-colors duration-150"
                style={{ color: isActive ? "var(--ve-ink)" : "var(--ve-ink-3)", fontWeight: isActive ? 600 : 500, letterSpacing: "0.005em" }}
              >
                {item.label}
              </span>
            </div>
          </Link>
        );
      })}
    </nav>
  );
};

export default BottomNav;
