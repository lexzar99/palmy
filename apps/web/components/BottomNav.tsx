"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import axios from "axios";
import { Home, Heart, ShoppingBag, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCartStore } from "@/store/cartStore";
import { useTranslation } from "@/lib/i18n/LocaleProvider";

// Dpoints-saldo för nav-badgen under Profil. Tyst om utloggad/av (401 → null).
async function fetchNavBalance(): Promise<{ enabled: boolean; balance: number } | null> {
  try {
    const r = await axios.get("/api/platform/dpoints/me");
    return { enabled: !!r.data?.enabled, balance: Number(r.data?.balance ?? 0) };
  } catch {
    return null;
  }
}

/**
 * BottomNav — flytande glas-bar med morfande guld-pill.
 * Aktiv flik: guld-pill (delad layoutId → glider mjukt mellan flikar) med
 * ikon + etikett. Inaktiva flikar: bara ikon. Etiketten animeras in/ut i
 * bredd så pillen växer organiskt. Cart-antal + Dpoints som mini-badges.
 */
const BottomNav = () => {
  const pathname = usePathname();
  const { t } = useTranslation();
  const items = useCartStore((state) => state.items);
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const [dpoints, setDpoints] = useState<{ enabled: boolean; balance: number } | null>(null);

  // Uppdatera saldot vid navigering (efter köp/inlösen syns nya saldot direkt).
  useEffect(() => {
    fetchNavBalance().then(setDpoints);
  }, [pathname]);

  // Hide bottom nav inside restaurant detail pages — the FloatingCartButton handles navigation there
  if (pathname?.startsWith("/restaurants/")) return null;

  const navItems = [
    { href: "/", label: t("nav.home"), icon: Home },
    { href: "/discover", label: t("nav.favorites"), icon: Heart },
    { href: "/cart", label: t("nav.cart"), icon: ShoppingBag, count: itemCount },
    { href: "/profile", label: t("nav.profile"), icon: User },
  ];

  return (
    <div
      className="fixed left-4 right-4 z-[100] md:hidden flex justify-center pointer-events-none"
      style={{ bottom: "max(env(safe-area-inset-bottom, 0px), 14px)" }}
    >
      <nav
        className="pointer-events-auto flex items-center gap-1 p-1.5 rounded-full backdrop-blur-xl"
        style={{
          backgroundColor: "var(--glass-bg)",
          border: "1px solid var(--glass-border)",
          boxShadow: "0 8px 32px rgba(17,17,19,0.14), 0 2px 8px rgba(17,17,19,0.08)",
        }}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              className="relative touch-manipulation"
            >
              <motion.div
                layout
                transition={{ type: "spring", bounce: 0.18, duration: 0.45 }}
                className="relative flex items-center justify-center gap-1.5 h-11 rounded-full"
                style={{ paddingLeft: isActive ? 16 : 12, paddingRight: isActive ? 16 : 12 }}
              >
                {/* Delad guld-pill — glider mellan flikarna via layoutId */}
                {isActive && (
                  <motion.div
                    layoutId="navActivePill"
                    className="absolute inset-0 rounded-full"
                    style={{ backgroundColor: "var(--color-gold-500, #E7B24B)" }}
                    transition={{ type: "spring", bounce: 0.18, duration: 0.45 }}
                  />
                )}
                <Icon
                  size={20}
                  strokeWidth={isActive ? 2.4 : 2}
                  className="relative z-10 shrink-0"
                  style={{ color: isActive ? "#1c1c1e" : "var(--text-secondary)" }}
                />
                {/* Etiketten finns bara på aktiv flik — animeras in i bredd */}
                <AnimatePresence initial={false}>
                  {isActive && (
                    <motion.span
                      key="label"
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: "auto", opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                      className="relative z-10 overflow-hidden whitespace-nowrap text-[12px] font-bold"
                      style={{ color: "#1c1c1e" }}
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
                {/* Cart-antal */}
                {item.count !== undefined && item.count > 0 && (
                  <span className="absolute top-0.5 right-1 z-20 min-w-[16px] h-4 px-1 rounded-full bg-zinc-900 text-gold-400 text-[9px] font-black flex items-center justify-center">
                    {item.count}
                  </span>
                )}
                {/* Dpoints-saldo på Profil */}
                {item.href === "/profile" && dpoints?.enabled && dpoints.balance > 0 && (
                  <span className="absolute top-0.5 right-0 z-20 px-1 h-4 rounded-full bg-zinc-900 text-gold-400 text-[8px] font-black flex items-center justify-center leading-none">
                    {dpoints.balance}p
                  </span>
                )}
              </motion.div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

export default BottomNav;
