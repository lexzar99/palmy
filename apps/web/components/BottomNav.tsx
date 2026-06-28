"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Diamond, Home, Heart, ShoppingBag, User } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { useTranslation } from "@/lib/i18n/LocaleProvider";

/**
 * BottomNav — platt vit bar, kant till kant, med hårfin topplinje.
 * Fyra lika breda segment (ikon + etikett). Aktivt segment markeras med
 * textfärg + ifylld ikon — ingen glidande pill, ingen blur, ingen skugga.
 * På restaurangsidor göms baren med transform + opacity istället för
 * unmount, så den aldrig flimrar vid sidbyten.
 */
const BottomNav = () => {
  const pathname = usePathname();
  const { t } = useTranslation();
  const items = useCartStore((state) => state.items);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  // Restaurangsidor: FloatingCartButton tar över. Order-tracking är en
  // fullskärmsvy som i appen och ska inte ha bottom nav ovanpå.
  const hidden = pathname?.startsWith("/restaurants/") || pathname?.startsWith("/order/") || false;

  const navItems = [
    { href: "/", label: t("nav.home"), icon: Home },
    { href: "/discover", label: t("nav.favorites"), icon: Heart },
    { href: "/cart", label: t("nav.cart"), icon: ShoppingBag, count: itemCount },
    { href: "/orders", label: t("nav.myOrders"), icon: Diamond },
    { href: "/profile", label: t("nav.profile"), icon: User },
  ];

  return (
    <nav
      className={`fixed left-0 right-0 bottom-0 z-[100] md:hidden flex transition-[transform,opacity] duration-300 ease-out ${hidden ? "pointer-events-none" : ""}`}
      style={{
        backgroundColor: "var(--bg-primary)",
        borderTop: "1px solid var(--border-muted)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        // iOS Safari: ett position:fixed-element MED transform (även identitets-
        // translateY(0)) fästs mot LAYOUT-viewporten, inte visual-viewporten, och
        // släpar därför efter när det nedre verktygsfältet dras in vid scroll →
        // glipa under navet. Vi sätter transform ENDAST när baren göms (slide-
        // animationen). Synlig = ingen transform → navet följer visual-viewporten.
        transform: hidden ? "translateY(110%)" : undefined,
        opacity: hidden ? 0 : 1,
      }}
      aria-hidden={hidden}
    >
      {/* iOS Safari: när det nedre verktygsfältet (sökfältet) krymper vid scroll
          uppstår annars en transparent remsa MELLAN navet och skärmkanten.
          Detta vita barn förlänger navets bakgrund nedåt (top:100% = från navets
          underkant) så ytan alltid är vit — täcker safe-arean + ev. dynamiskt
          viewport-gap. Ligger bakom innehållet, fångar inga klick. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0 right-0 top-full"
        style={{ height: "100vh", backgroundColor: "var(--bg-primary)" }}
      />
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            aria-current={isActive ? "page" : undefined}
            className="relative flex-1 touch-manipulation"
          >
            <div className="flex h-[56px] flex-col items-center justify-center gap-1 px-0.5">
              {/* Aktiv ikon fylls med varumärkesguldet — guld markerar "här är du". */}
              <Icon
                size={20}
                strokeWidth={isActive ? 2.2 : 1.8}
                fill={isActive ? "var(--color-gold-500, #F0531C)" : "none"}
                className="shrink-0 transition-colors duration-150"
                style={{ color: isActive ? "var(--color-gold-500, #F0531C)" : "var(--text-secondary)" }}
              />
              <span
                className={`max-w-full truncate text-[10.5px] leading-none transition-colors duration-150 ${isActive ? "font-semibold" : "font-medium"}`}
                style={{ color: isActive ? "var(--text-primary)" : "var(--text-secondary)" }}
              >
                {item.label}
              </span>
            </div>
            {/* Cart-antal — springer till vid varje ändring (wow vid "lägg till"). */}
            <AnimatePresence>
              {item.count !== undefined && item.count > 0 && (
                <motion.span
                  key={item.count}
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.4, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 700, damping: 18 }}
                  className="absolute top-1.5 right-[calc(50%-20px)] z-20 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                  style={{ backgroundColor: "var(--color-gold-500, #F0531C)", color: "#141416" }}
                >
                  {item.count}
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
        );
      })}
    </nav>
  );
};

export default BottomNav;
